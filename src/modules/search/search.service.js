const prisma       = require('../../config/db');
const { AppError } = require('../../middleware/errorHandler');

/**
 * All searches operate on APPROVED documents only by default,
 * but admins may pass status filters to widen the scope.
 */

// ── Search by vehicle number ──────────────────────────────────────────────────

const searchByVehicleNumber = async (vehicleNumber, {
  page = 1, limit = 20,
  status, requestingUser,
} = {}) => {
  if (!vehicleNumber?.trim()) throw new AppError('vehicle_number query is required.', 400);

  const skip = (page - 1) * limit;

  // Normalise: remove spaces/dashes, uppercase
  const normalised = vehicleNumber.replace(/[\s\-]/g, '').toUpperCase();

  const where = {
    ...(status
      ? { status }
      : requestingUser.role === 'ADMIN'
        ? {}
        : { status: 'APPROVED' }),
    extractedFields: {
      some: {
        fieldName: 'vehicle_number',
        OR: [
          { finalValue:     { contains: normalised, mode: 'insensitive' } },
          { correctedValue: { contains: normalised, mode: 'insensitive' } },
          { rawValue:       { contains: normalised, mode: 'insensitive' } },
        ],
      },
    },
  };

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      skip,
      take:    limit,
      orderBy: { createdAt: 'desc' },
      include: {
        extractedFields: { orderBy: { fieldName: 'asc' } },
        uploadedBy:      { select: { id: true, name: true } },
      },
    }),
    prisma.document.count({ where }),
  ]);

  return { documents, total, query: { vehicleNumber: normalised } };
};

// ── Search by date range ──────────────────────────────────────────────────────

const searchByDateRange = async (fromDate, toDate, {
  page = 1, limit = 20,
  status, requestingUser,
} = {}) => {
  if (!fromDate && !toDate) throw new AppError('At least one of fromDate or toDate is required.', 400);

  const skip = (page - 1) * limit;

  // Validate dates
  if (fromDate && isNaN(new Date(fromDate).getTime())) {
    throw new AppError('fromDate is not a valid date.', 400);
  }
  if (toDate && isNaN(new Date(toDate).getTime())) {
    throw new AppError('toDate is not a valid date.', 400);
  }
  if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
    throw new AppError('fromDate must be before toDate.', 400);
  }

  // Search against the extracted 'date' field's finalValue (stored as YYYY-MM-DD string)
  const dateConditions = [];
  if (fromDate) dateConditions.push({ finalValue: { gte: fromDate } });
  if (toDate)   dateConditions.push({ finalValue: { lte: toDate   } });

  const where = {
    ...(status
      ? { status }
      : requestingUser.role === 'ADMIN'
        ? {}
        : { status: 'APPROVED' }),
    extractedFields: {
      some: {
        fieldName: 'date',
        AND: dateConditions,
      },
    },
  };

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      skip,
      take:    limit,
      orderBy: { createdAt: 'desc' },
      include: {
        extractedFields: { orderBy: { fieldName: 'asc' } },
        uploadedBy:      { select: { id: true, name: true } },
      },
    }),
    prisma.document.count({ where }),
  ]);

  return { documents, total, query: { fromDate, toDate } };
};

// ── Search by status ──────────────────────────────────────────────────────────

const searchByStatus = async (status, { page = 1, limit = 20, requestingUser } = {}) => {
  const VALID = ['UPLOADED', 'OCR_PROCESSING', 'OCR_FAILED', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED'];
  if (!VALID.includes(status)) {
    throw new AppError(`Invalid status. Must be one of: ${VALID.join(', ')}.`, 400);
  }

  // UPLOADERs scoped to their own documents
  if (requestingUser.role === 'UPLOADER' && !['APPROVED', 'REJECTED'].includes(status)) {
    throw new AppError('UPLOADERs can only search APPROVED or REJECTED documents.', 403);
  }

  const skip  = (page - 1) * limit;
  const where = {
    status,
    ...(requestingUser.role === 'UPLOADER' && { uploadedById: requestingUser.id }),
  };

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      skip,
      take:    limit,
      orderBy: { updatedAt: 'desc' },
      include: {
        extractedFields: { orderBy: { fieldName: 'asc' } },
        uploadedBy:      { select: { id: true, name: true } },
        _count:          { select: { auditLogs: true } },
      },
    }),
    prisma.document.count({ where }),
  ]);

  return { documents, total, query: { status } };
};

// ── Search by confidence threshold ───────────────────────────────────────────

const searchByConfidence = async (threshold, operator = 'below', {
  page = 1, limit = 20,
  fieldName, requestingUser,
} = {}) => {
  if (threshold === undefined || threshold === null) {
    throw new AppError('threshold is required.', 400);
  }

  const thresh = parseFloat(threshold);
  if (isNaN(thresh) || thresh < 0 || thresh > 1) {
    throw new AppError('threshold must be a number between 0 and 1.', 400);
  }

  if (!['above', 'below'].includes(operator)) {
    throw new AppError('operator must be "above" or "below".', 400);
  }

  const VALID_FIELDS = ['vehicle_number', 'weight', 'date'];
  if (fieldName && !VALID_FIELDS.includes(fieldName)) {
    throw new AppError(`fieldName must be one of: ${VALID_FIELDS.join(', ')}.`, 400);
  }

  const skip = (page - 1) * limit;

  const confidenceCondition = operator === 'below'
    ? { lt: thresh }
    : { gt: thresh };

  const where = {
    status: { not: 'UPLOADED' }, // must have been through OCR
    ...(requestingUser.role === 'UPLOADER' && { uploadedById: requestingUser.id }),
    extractedFields: {
      some: {
        confidence: confidenceCondition,
        ...(fieldName && { fieldName }),
      },
    },
  };

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      skip,
      take:    limit,
      orderBy: { ocrProcessedAt: 'desc' },
      include: {
        extractedFields: {
          where: {
            confidence: confidenceCondition,
            ...(fieldName && { fieldName }),
          },
          orderBy: { confidence: 'asc' },
        },
        uploadedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.document.count({ where }),
  ]);

  return {
    documents,
    total,
    query: { threshold: thresh, operator, fieldName: fieldName ?? 'all' },
  };
};

// ── Universal search (searches across all field types) ────────────────────────

const universalSearch = async (query, { page = 1, limit = 20, requestingUser } = {}) => {
  if (!query?.trim()) throw new AppError('query is required.', 400);

  const skip = (page - 1) * limit;
  const q    = query.trim();

  const where = {
    ...(requestingUser.role === 'UPLOADER' && { uploadedById: requestingUser.id }),
    OR: [
      // Match on original filename
      { originalName: { contains: q, mode: 'insensitive' } },
      // Match on any extracted field value
      {
        extractedFields: {
          some: {
            OR: [
              { finalValue:     { contains: q, mode: 'insensitive' } },
              { correctedValue: { contains: q, mode: 'insensitive' } },
              { rawValue:       { contains: q, mode: 'insensitive' } },
            ],
          },
        },
      },
    ],
  };

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      skip,
      take:    limit,
      orderBy: { updatedAt: 'desc' },
      include: {
        extractedFields: { orderBy: { fieldName: 'asc' } },
        uploadedBy:      { select: { id: true, name: true } },
      },
    }),
    prisma.document.count({ where }),
  ]);

  return { documents, total, query: { q } };
};

module.exports = {
  searchByVehicleNumber,
  searchByDateRange,
  searchByStatus,
  searchByConfidence,
  universalSearch,
};