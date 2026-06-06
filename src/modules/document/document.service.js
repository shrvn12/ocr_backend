const prisma              = require('../../config/db');
const { uploadBuffer, deleteResource } = require('../../config/cloudinary');
const { AppError }        = require('../../middleware/errorHandler');
const logger              = require('../../utils/logger');

// ── Upload & create ───────────────────────────────────────────────────────────

/**
 * 1. Stream buffer to Cloudinary
 * 2. Create Document record (status = UPLOADED)
 * 3. Create an AuditLog entry
 * 4. Return the full document
 */
const uploadDocument = async (file, userId) => {
  logger.info(`[Document] Uploading "${file.originalname}" for user ${userId}`);

  // Upload to Cloudinary
  let cloudinaryResult;
  try {
    cloudinaryResult = await uploadBuffer(file.buffer, file.originalname);
  } catch (err) {
    logger.error('[Document] Cloudinary upload failed:', err);
    throw new AppError('Failed to upload file to storage. Please try again.', 502);
  }

  // Persist document record + initial audit log in a transaction
  const document = await prisma.$transaction(async (tx) => {
    const doc = await tx.document.create({
      data: {
        originalName:  file.originalname,
        cloudinaryUrl: cloudinaryResult.url,
        cloudinaryId:  cloudinaryResult.publicId,
        status:        'UPLOADED',
        uploadedById:  userId,
      },
      include: {
        uploadedBy:     { select: { id: true, name: true, email: true } },
        extractedFields: true,
      },
    });

    await tx.auditLog.create({
      data: {
        documentId: doc.id,
        userId,
        action:     'DOCUMENT_UPLOADED',
        newValue:   doc.status,
        metadata: {
          cloudinaryId: cloudinaryResult.publicId,
          fileSize:     cloudinaryResult.bytes,
          format:       cloudinaryResult.format,
          originalName: file.originalname,
        },
      },
    });

    return doc;
  });

  logger.info(`[Document] Created document ${document.id}`);
  return document;
};

// ── Read ──────────────────────────────────────────────────────────────────────

const getDocumentById = async (id, requestingUser) => {
  const document = await prisma.document.findUnique({
    where:   { id },
    include: {
      uploadedBy:      { select: { id: true, name: true, email: true } },
      extractedFields: { orderBy: { fieldName: 'asc' } },
      auditLogs: {
        orderBy: { createdAt: 'desc' },
        take:    20,
        include: { user: { select: { id: true, name: true, role: true } } },
      },
    },
  });

  if (!document) throw new AppError('Document not found.', 404);

  // UPLOADERs can only see their own documents
  if (
    requestingUser.role === 'UPLOADER' &&
    document.uploadedById !== requestingUser.id
  ) {
    throw new AppError('You do not have access to this document.', 403);
  }

  return document;
};

const listDocuments = async ({ page = 1, limit = 20, status, uploadedById }, requestingUser) => {
  const skip = (page - 1) * limit;

  const where = {
    ...(status       && { status }),
    // UPLOADERs always scoped to their own documents
    ...(requestingUser.role === 'UPLOADER'
      ? { uploadedById: requestingUser.id }
      : uploadedById && { uploadedById }),
  };

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      skip,
      take:    limit,
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy:      { select: { id: true, name: true } },
        extractedFields: { orderBy: { fieldName: 'asc' } },
        _count: { select: { auditLogs: true } },
      },
    }),
    prisma.document.count({ where }),
  ]);

  return { documents, total };
};

// ── Status update ─────────────────────────────────────────────────────────────

const updateDocumentStatus = async (id, newStatus, userId) => {
  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) throw new AppError('Document not found.', 404);

  const oldStatus = document.status;
  if (oldStatus === newStatus) {
    throw new AppError(`Document is already in '${newStatus}' status.`, 400);
  }

  // Enforce valid status transitions
  const TRANSITIONS = {
    UPLOADED:         ['OCR_PROCESSING'],
    OCR_PROCESSING:   ['OCR_FAILED', 'READY_FOR_REVIEW'],
    OCR_FAILED:       ['OCR_PROCESSING'],
    READY_FOR_REVIEW: ['APPROVED', 'REJECTED'],
    APPROVED:         [],
    REJECTED:         ['OCR_PROCESSING'], // allow re-processing
  };

  if (!TRANSITIONS[oldStatus]?.includes(newStatus)) {
    throw new AppError(
      `Invalid status transition: '${oldStatus}' → '${newStatus}'.`,
      400
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const doc = await tx.document.update({
      where: { id },
      data:  { status: newStatus },
    });

    await tx.auditLog.create({
      data: {
        documentId: id,
        userId,
        action:     'STATUS_CHANGED',
        oldValue:   oldStatus,
        newValue:   newStatus,
      },
    });

    return doc;
  });

  return updated;
};

// ── Delete ────────────────────────────────────────────────────────────────────

const deleteDocument = async (id, requestingUser) => {
  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) throw new AppError('Document not found.', 404);

  // Only admins or the uploader (if still UPLOADED status) can delete
  const canDelete =
    requestingUser.role === 'ADMIN' ||
    (document.uploadedById === requestingUser.id && document.status === 'UPLOADED');

  if (!canDelete) {
    throw new AppError(
      'You can only delete your own documents while they are in UPLOADED status.',
      403
    );
  }

  // Remove from Cloudinary first
  try {
    await deleteResource(document.cloudinaryId);
  } catch (err) {
    logger.warn(`[Document] Cloudinary delete failed for ${document.cloudinaryId}:`, err);
    // Non-fatal: continue with DB deletion
  }

  // Cascade delete removes extracted_fields and audit_logs automatically (schema onDelete: Cascade)
  await prisma.document.delete({ where: { id } });

  logger.info(`[Document] Deleted document ${id} by user ${requestingUser.id}`);
};

module.exports = {
  uploadDocument,
  getDocumentById,
  listDocuments,
  updateDocumentStatus,
  deleteDocument,
};