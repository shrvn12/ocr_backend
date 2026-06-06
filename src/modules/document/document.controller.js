const documentService = require('./document.service');
const asyncHandler    = require('../../utils/asyncHandler');
const api             = require('../../utils/apiResponse');
const { AppError }    = require('../../middleware/errorHandler');
const ocrService = require('../ocr/ocr.service');

/**
 * POST /api/v1/documents/upload
 * multipart/form-data — field name: "document"
 */
// const upload = asyncHandler(async (req, res) => {
//   if (!req.file) throw new AppError('No file uploaded. Use field name "document".', 400);

//   const document = await documentService.uploadDocument(req.file, req.user.id);
//   return api.created(res, document, 'Document uploaded successfully.');
// });

const upload = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('No file uploaded. Use field name "document".', 400);

  const document = await documentService.uploadDocument(req.file, req.user.id);

  // Respond immediately — OCR runs asynchronously in the background
  api.created(res, document, 'Document uploaded. OCR processing started.');

  // Fire-and-forget: process after response is sent
  ocrService.processDocument(document.id, req.user.id).catch((err) => {
    const logger = require('../../utils/logger');
    logger.error(`[OCR] Background processing failed for ${document.id}:`, err);
  });
});

/**
 * GET /api/v1/documents
 * Query: { page?, limit?, status?, uploadedById? }
 */
const list = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, uploadedById } = req.query;
  const { documents, total } = await documentService.listDocuments(
    { page: Number(page), limit: Number(limit), status, uploadedById },
    req.user
  );
  return api.paginate(res, documents, total, page, limit);
});

/**
 * GET /api/v1/documents/:id
 */
const getOne = asyncHandler(async (req, res) => {
  const document = await documentService.getDocumentById(req.params.id, req.user);
  return api.success(res, document);
});

/**
 * PATCH /api/v1/documents/:id/status
 * Body: { status }
 */
const updateStatus = asyncHandler(async (req, res) => {
  const document = await documentService.updateDocumentStatus(
    req.params.id,
    req.body.status,
    req.user.id
  );
  return api.success(res, document, 'Document status updated.');
});

/**
 * DELETE /api/v1/documents/:id
 */
const remove = asyncHandler(async (req, res) => {
  await documentService.deleteDocument(req.params.id, req.user);
  return api.success(res, null, 'Document deleted successfully.');
});

module.exports = { upload, list, getOne, updateStatus, remove };