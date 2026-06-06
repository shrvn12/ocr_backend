const prisma        = require('../../config/db');
const { AppError }  = require('../../middleware/errorHandler');
const logger        = require('../../utils/logger');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Assert document exists and is READY_FOR_REVIEW.
 * Returns the full document with extracted fields.
 */
const assertReviewable = async (documentId, tx = prisma) => {
  const document = await tx.document.findUnique({
    where:   { id: documentId },
    include: {
      extractedFields: { orderBy: { fieldName: 'asc' } },
      uploadedBy:      { select: { id: true, name: true, email: true } },
    },
  });

  if (!document) throw new AppError('Document not found.', 404);

  if (document.status !== 'READY_FOR_REVIEW') {
    throw new AppError(
      `Document is not available for review. Current status: '${document.status}'.`,
      400
    );
  }

  return document;
};

/**
 * Resolve the final value for a field after correction.
 * finalValue = correctedValue if set, otherwise rawValue.
 */
const resolveFinalValue = (field) =>
  field.correctedValue ?? field.rawValue ?? null;

// ── Review queue ──────────────────────────────────────────────────────────────

const getReviewQueue = async ({
  page = 1,
  limit = 20,
  minConfidence,
  maxConfidence,
  hasCorrections,
} = {}) => {
  const skip = (page - 1) * limit;

  // Build a confidence filter at the extracted_fields level using subquery logic
  // We flag documents where ANY field falls within the confidence range
  const confidenceFilter =
    minConfidence !== undefined || maxConfidence !== undefined
      ? {
          extractedFields: {
            some: {
              confidence: {
                ...(minConfidence !== undefined && { gte: minConfidence }),
                ...(maxConfidence !== undefined && { lte: maxConfidence }),
              },
            },
          },
        }
      : {};

  const correctionFilter =
    hasCorrections !== undefined
      ? {
          extractedFields: {
            ...(hasCorrections
              ? { some:  { correctedValue: { not: null } } }
              : { none:  { correctedValue: { not: null } } }),
          },
        }
      : {};

  const where = {
    status: 'READY_FOR_REVIEW',
    ...confidenceFilter,
    ...correctionFilter,
  };

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      skip,
      take:    limit,
      orderBy: { ocrProcessedAt: 'asc' }, // oldest first (FIFO queue)
      include: {
        uploadedBy:      { select: { id: true, name: true } },
        extractedFields: { orderBy: { fieldName: 'asc' } },
        _count:          { select: { auditLogs: true } },
      },
    }),
    prisma.document.count({ where }),
  ]);

  // Attach per-document confidence summary
  const enriched = documents.map((doc) => {
    const fields = doc.extractedFields;
    const avgConf =
      fields.length > 0
        ? fields.reduce((s, f) => s + (f.confidence ?? 0), 0) / fields.length
        : null;

    return {
      ...doc,
      _meta: {
        avgConfidence:  avgConf !== null ? parseFloat(avgConf.toFixed(3)) : null,
        correctedCount: fields.filter((f) => f.correctedValue !== null).length,
        missingCount:   fields.filter((f) => f.rawValue === null).length,
      },
    };
  });

  return { documents: enriched, total };
};

// ── Get single document for review ───────────────────────────────────────────

const getDocumentForReview = async (documentId) => {
  const document = await prisma.document.findUnique({
    where:   { id: documentId },
    include: {
      uploadedBy:      { select: { id: true, name: true, email: true } },
      extractedFields: { orderBy: { fieldName: 'asc' } },
      auditLogs: {
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true, role: true } } },
      },
    },
  });

  if (!document) throw new AppError('Document not found.', 404);

  if (!['READY_FOR_REVIEW', 'APPROVED', 'REJECTED'].includes(document.status)) {
    throw new AppError(
      `Document is not in a reviewable state. Current status: '${document.status}'.`,
      400
    );
  }

  // Compute per-field review metadata
  const fields = document.extractedFields.map((f) => ({
    ...f,
    finalValue:   resolveFinalValue(f),
    needsReview:  f.confidence !== null && f.confidence < 0.75,
    isCorrected:  f.correctedValue !== null,
    isMissing:    f.rawValue === null && f.correctedValue === null,
  }));

  return {
    ...document,
    extractedFields: fields,
    _meta: {
      avgConfidence:
        fields.length > 0
          ? parseFloat(
              (fields.reduce((s, f) => s + (f.confidence ?? 0), 0) / fields.length).toFixed(3)
            )
          : null,
      correctedCount: fields.filter((f) => f.isCorrected).length,
      missingCount:   fields.filter((f) => f.isMissing).length,
      lowConfCount:   fields.filter((f) => f.needsReview).length,
    },
  };
};

// ── Correct a single field ────────────────────────────────────────────────────

const correctField = async (documentId, { fieldName, correctedValue, reason }, reviewerId) => {
  await assertReviewable(documentId);

  const field = await prisma.extractedField.findUnique({
    where: {
      documentId_fieldName: { documentId, fieldName },
    },
  });

  if (!field) throw new AppError(`Field '${fieldName}' not found for this document.`, 404);

  const oldValue = resolveFinalValue(field);

  // No-op guard
  if (oldValue === correctedValue) {
    throw new AppError('Corrected value is identical to the current value.', 400);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedField = await tx.extractedField.update({
      where: {
        documentId_fieldName: { documentId, fieldName },
      },
      data: {
        correctedValue,
        finalValue:    correctedValue,
        isManuallySet: true,
      },
    });

    await tx.auditLog.create({
      data: {
        documentId,
        userId:    reviewerId,
        action:    'FIELD_CORRECTED',
        fieldName,
        oldValue,
        newValue:  correctedValue,
        metadata:  { reason: reason ?? null },
      },
    });

    return updatedField;
  });

  logger.info(
    `[Review] Field '${fieldName}' corrected on document ${documentId} by user ${reviewerId}`
  );

  return updated;
};

// ── Correct multiple fields at once ──────────────────────────────────────────

const correctFields = async (documentId, { corrections }, reviewerId) => {
  await assertReviewable(documentId);

  const results = await prisma.$transaction(async (tx) => {
    const updated = [];

    for (const { fieldName, correctedValue, reason } of corrections) {
      const field = await tx.extractedField.findUnique({
        where: { documentId_fieldName: { documentId, fieldName } },
      });

      if (!field) {
        throw new AppError(`Field '${fieldName}' not found for this document.`, 404);
      }

      const oldValue = resolveFinalValue(field);

      if (oldValue === correctedValue) continue; // skip no-op silently in bulk

      const updatedField = await tx.extractedField.update({
        where: { documentId_fieldName: { documentId, fieldName } },
        data: {
          correctedValue,
          finalValue:    correctedValue,
          isManuallySet: true,
        },
      });

      await tx.auditLog.create({
        data: {
          documentId,
          userId:    reviewerId,
          action:    'FIELD_CORRECTED',
          fieldName,
          oldValue,
          newValue:  correctedValue,
          metadata:  { reason: reason ?? null, bulkOperation: true },
        },
      });

      updated.push(updatedField);
    }

    return updated;
  });

  logger.info(
    `[Review] Bulk correction (${results.length} fields) on document ${documentId} by user ${reviewerId}`
  );

  return results;
};

// ── Approve document ──────────────────────────────────────────────────────────

const approveDocument = async (documentId, { notes } = {}, reviewerId) => {
  const document = await assertReviewable(documentId);

  // Resolve all finalValues before approval
  const fieldUpdates = document.extractedFields.map((f) => ({
    id:         f.id,
    finalValue: resolveFinalValue(f),
  }));

  const updated = await prisma.$transaction(async (tx) => {
    // Commit finalValues
    for (const { id, finalValue } of fieldUpdates) {
      await tx.extractedField.update({
        where: { id },
        data:  { finalValue },
      });
    }

    const doc = await tx.document.update({
      where: { id: documentId },
      data: {
        status:     'APPROVED',
        reviewedAt: new Date(),
        reviewNotes: notes ?? null,
      },
      include: {
        extractedFields: { orderBy: { fieldName: 'asc' } },
        uploadedBy:      { select: { id: true, name: true, email: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        documentId,
        userId:    reviewerId,
        action:    'DOCUMENT_APPROVED',
        oldValue:  'READY_FOR_REVIEW',
        newValue:  'APPROVED',
        metadata:  {
          notes:          notes ?? null,
          approvedFields: fieldUpdates,
        },
      },
    });

    return doc;
  });

  logger.info(`[Review] Document ${documentId} APPROVED by user ${reviewerId}`);
  return updated;
};

// ── Reject document ───────────────────────────────────────────────────────────

const rejectDocument = async (documentId, { notes }, reviewerId) => {
  await assertReviewable(documentId);

  const updated = await prisma.$transaction(async (tx) => {
    const doc = await tx.document.update({
      where: { id: documentId },
      data: {
        status:      'REJECTED',
        reviewedAt:  new Date(),
        reviewNotes: notes,
      },
      include: {
        extractedFields: { orderBy: { fieldName: 'asc' } },
        uploadedBy:      { select: { id: true, name: true, email: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        documentId,
        userId:   reviewerId,
        action:   'DOCUMENT_REJECTED',
        oldValue: 'READY_FOR_REVIEW',
        newValue: 'REJECTED',
        metadata: { notes },
      },
    });

    return doc;
  });

  logger.info(`[Review] Document ${documentId} REJECTED by user ${reviewerId}`);
  return updated;
};

module.exports = {
  getReviewQueue,
  getDocumentForReview,
  correctField,
  correctFields,
  approveDocument,
  rejectDocument,
};