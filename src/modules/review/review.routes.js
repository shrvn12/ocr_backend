const { Router }                  = require('express');
const controller                  = require('./review.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const validate                    = require('../../middleware/validate');
const v                           = require('./review.validation');

const router = Router();

// All review routes require authentication + REVIEWER or ADMIN role
router.use(authenticate, authorize('REVIEWER', 'ADMIN'));

/**
 * GET /api/v1/reviews
 * Review queue — filterable by confidence, correction status.
 * Query: { page?, limit?, minConfidence?, maxConfidence?, hasCorrections? }
 */
router.get(
  '/',
  validate(v.listReviewQueue, 'query'),
  controller.getQueue
);

/**
 * GET /api/v1/reviews/:id
 * Full document view for review — includes fields, audit trail, metadata.
 */
router.get(
  '/:id',
  validate(v.documentId, 'params'),
  controller.getOne
);

/**
 * PATCH /api/v1/reviews/:id/fields
 * Correct a single field.
 * Body: { fieldName, correctedValue, reason? }
 */
router.patch(
  '/:id/fields',
  validate(v.documentId, 'params'),
  validate(v.correctField),
  controller.correctField
);

/**
 * PATCH /api/v1/reviews/:id/fields/bulk
 * Correct multiple fields atomically.
 * Body: { corrections: [{ fieldName, correctedValue, reason? }] }
 */
router.patch(
  '/:id/fields/bulk',
  validate(v.documentId, 'params'),
  validate(v.correctFields),
  controller.correctFieldsBulk
);

/**
 * POST /api/v1/reviews/:id/approve
 * Approve document — commits all finalValues and sets status APPROVED.
 * Body: { notes? }
 */
router.post(
  '/:id/approve',
  validate(v.documentId, 'params'),
  validate(v.approveDocument),
  controller.approve
);

/**
 * POST /api/v1/reviews/:id/reject
 * Reject document — notes are mandatory.
 * Body: { notes }
 */
router.post(
  '/:id/reject',
  validate(v.documentId, 'params'),
  validate(v.rejectDocument),
  controller.reject
);

module.exports = router;