const ocrService   = require('./ocr.service');
const asyncHandler = require('../../utils/asyncHandler');
const api          = require('../../utils/apiResponse');

/**
 * POST /api/v1/ocr/:documentId/process
 * Trigger OCR pipeline manually (also auto-called post-upload).
 */
const process = asyncHandler(async (req, res) => {
  const result = await ocrService.processDocument(
    req.params.documentId,
    req.user.id
  );
  return api.success(res, result, 'OCR processing complete.');
});

/**
 * POST /api/v1/ocr/:documentId/retry
 * Retry a failed or rejected OCR.
 */
const retry = asyncHandler(async (req, res) => {
  const result = await ocrService.retryOcr(req.params.documentId, req.user.id);
  return api.success(res, result, 'OCR retry successful.');
});

/**
 * GET /api/v1/ocr/:documentId/result
 * Fetch parsed OCR fields + summary for a document.
 */
const getResult = asyncHandler(async (req, res) => {
  const result = await ocrService.getOcrResult(req.params.documentId, req.user);
  return api.success(res, result);
});

module.exports = { process, retry, getResult };