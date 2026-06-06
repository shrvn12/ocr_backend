const auditService = require('./audit.service');
const asyncHandler = require('../../utils/asyncHandler');
const api          = require('../../utils/apiResponse');

const getDocumentTrail = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const { logs, total } = await auditService.getDocumentAuditTrail(
    req.params.documentId,
    { page: Number(page), limit: Number(limit) }
  );
  return api.paginate(res, logs, total, page, limit);
});

const getUserActivity = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, action } = req.query;
  const targetId = req.params.userId ?? req.user.id;

  // Non-admins can only see their own activity
  if (req.user.role !== 'ADMIN' && targetId !== req.user.id) {
    return api.forbidden(res, 'You can only view your own activity.');
  }

  const { logs, total } = await auditService.getUserActivity(targetId, {
    page: Number(page), limit: Number(limit), action,
  });
  return api.paginate(res, logs, total, page, limit);
});

const getFieldHistory = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const { logs, total } = await auditService.getFieldHistory(
    req.params.fieldName,
    { page: Number(page), limit: Number(limit) }
  );
  return api.paginate(res, logs, total, page, limit);
});

const getGlobalLog = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, action, userId, fromDate, toDate } = req.query;
  const { logs, total } = await auditService.getGlobalAuditLog({
    page: Number(page), limit: Number(limit),
    action, userId, fromDate, toDate,
  });
  return api.paginate(res, logs, total, page, limit);
});

const getCorrectionStats = asyncHandler(async (req, res) => {
  const stats = await auditService.getCorrectionStats();
  return api.success(res, stats);
});

module.exports = {
  getDocumentTrail,
  getUserActivity,
  getFieldHistory,
  getGlobalLog,
  getCorrectionStats,
};