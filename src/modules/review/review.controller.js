const reviewService = require('./review.service');
const asyncHandler  = require('../../utils/asyncHandler');
const api           = require('../../utils/apiResponse');

/**
 * GET /api/v1/reviews
 * Paginated READY_FOR_REVIEW queue with confidence filters.
 */
const getQueue = asyncHandler(async (req, res) => {
  const {
    page = 1, limit = 20,
    minConfidence, maxConfidence,
    hasCorrections,
  } = req.query;

  const { documents, total } = await reviewService.getReviewQueue({
    page:           Number(page),
    limit:          Number(limit),
    minConfidence:  minConfidence !== undefined ? Number(minConfidence) : undefined,
    maxConfidence:  maxConfidence !== undefined ? Number(maxConfidence) : undefined,
    hasCorrections: hasCorrections !== undefined ? hasCorrections === 'true' : undefined,
  });

  return api.paginate(res, documents, total, page, limit);
});

/**
 * GET /api/v1/reviews/:id
 * Full review view for a single document.
 */
const getOne = asyncHandler(async (req, res) => {
  const document = await reviewService.getDocumentForReview(req.params.id);
  return api.success(res, document);
});

/**
 * PATCH /api/v1/reviews/:id/fields
 * Correct a single extracted field.
 * Body: { fieldName, correctedValue, reason? }
 */
const correctField = asyncHandler(async (req, res) => {
  const field = await reviewService.correctField(
    req.params.id,
    req.body,
    req.user.id
  );
  return api.success(res, field, 'Field corrected successfully.');
});

/**
 * PATCH /api/v1/reviews/:id/fields/bulk
 * Correct multiple fields in one request.
 * Body: { corrections: [{ fieldName, correctedValue, reason? }] }
 */
const correctFieldsBulk = asyncHandler(async (req, res) => {
  const fields = await reviewService.correctFields(
    req.params.id,
    req.body,
    req.user.id
  );
  return api.success(res, fields, `${fields.length} field(s) corrected successfully.`);
});

/**
 * POST /api/v1/reviews/:id/approve
 * Body: { notes? }
 */
const approve = asyncHandler(async (req, res) => {
  const document = await reviewService.approveDocument(
    req.params.id,
    req.body,
    req.user.id
  );
  return api.success(res, document, 'Document approved successfully.');
});

/**
 * POST /api/v1/reviews/:id/reject
 * Body: { notes } (required)
 */
const reject = asyncHandler(async (req, res) => {
  const document = await reviewService.rejectDocument(
    req.params.id,
    req.body,
    req.user.id
  );
  return api.success(res, document, 'Document rejected.');
});

module.exports = { getQueue, getOne, correctField, correctFieldsBulk, approve, reject };