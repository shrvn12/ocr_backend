const prisma       = require('../../config/db');
const { AppError } = require('../../middleware/errorHandler');

// ── Per-document audit trail ──────────────────────────────────────────────────

const getDocumentAuditTrail = async (documentId, { page = 1, limit = 50 } = {}) => {
  const document = await prisma.document.findUnique({ where: { id: documentId } });
  if (!document) throw new AppError('Document not found.', 404);

  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where:   { documentId },
      skip,
      take:    limit,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true, role: true } } },
    }),
    prisma.auditLog.count({ where: { documentId } }),
  ]);

  return { logs, total };
};

// ── Per-user activity ─────────────────────────────────────────────────────────

const getUserActivity = async (userId, { page = 1, limit = 50, action } = {}) => {
  const skip  = (page - 1) * limit;
  const where = { userId, ...(action && { action }) };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take:    limit,
      orderBy: { createdAt: 'desc' },
      include: {
        document: { select: { id: true, originalName: true, status: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, total };
};

// ── Per-field change history across all documents ─────────────────────────────

const getFieldHistory = async (fieldName, { page = 1, limit = 50 } = {}) => {
  const VALID_FIELDS = ['vehicle_number', 'weight', 'date'];
  if (!VALID_FIELDS.includes(fieldName)) {
    throw new AppError(`Invalid field name. Must be one of: ${VALID_FIELDS.join(', ')}.`, 400);
  }

  const skip  = (page - 1) * limit;
  const where = { action: 'FIELD_CORRECTED', fieldName };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take:    limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user:     { select: { id: true, name: true, role: true } },
        document: { select: { id: true, originalName: true, status: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, total };
};

// ── Global audit log (admin) ──────────────────────────────────────────────────

const getGlobalAuditLog = async ({
  page = 1, limit = 50,
  action, userId,
  fromDate, toDate,
} = {}) => {
  const skip  = (page - 1) * limit;
  const where = {
    ...(action && { action }),
    ...(userId && { userId }),
    ...((fromDate || toDate) && {
      createdAt: {
        ...(fromDate && { gte: new Date(fromDate) }),
        ...(toDate   && { lte: new Date(toDate)   }),
      },
    }),
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take:    limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user:     { select: { id: true, name: true, role: true } },
        document: { select: { id: true, originalName: true, status: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, total };
};

// ── Correction stats (admin insight) ─────────────────────────────────────────

const getCorrectionStats = async () => {
  const [byField, byUser, byAction] = await Promise.all([
    prisma.auditLog.groupBy({
      by:      ['fieldName'],
      where:   { action: 'FIELD_CORRECTED', fieldName: { not: null } },
      _count:  { _all: true },
      orderBy: { _count: { fieldName: 'desc' } },
    }),
    prisma.auditLog.groupBy({
      by:      ['userId'],
      where:   { action: 'FIELD_CORRECTED' },
      _count:  { _all: true },
      orderBy: { _count: { userId: 'desc' } },
      take:    10,
    }),
    prisma.auditLog.groupBy({
      by:     ['action'],
      _count: { _all: true },
    }),
  ]);

  // Hydrate user names for the top-correctors list
  const userIds     = byUser.map((r) => r.userId);
  const users       = await prisma.user.findMany({
    where:  { id: { in: userIds } },
    select: { id: true, name: true, role: true },
  });
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  return {
    correctionsByField: byField.map((r) => ({
      fieldName: r.fieldName,
      count:     r._count._all,
    })),
    topCorrectingUsers: byUser.map((r) => ({
      user:  userMap[r.userId] ?? { id: r.userId },
      count: r._count._all,
    })),
    actionBreakdown: byAction.map((r) => ({
      action: r.action,
      count:  r._count._all,
    })),
  };
};

module.exports = {
  getDocumentAuditTrail,
  getUserActivity,
  getFieldHistory,
  getGlobalAuditLog,
  getCorrectionStats,
};