const { Router }                  = require('express');
const controller                  = require('./ocr.controller');
const { authenticate, authorize } = require('../../middleware/auth');

const router = Router();

router.use(authenticate);

/**
 * POST /api/v1/ocr/:documentId/process
 * Roles: ADMIN (manual trigger — normal flow is auto-triggered on upload)
 */
router.post(
  '/:documentId/process',
  authorize('ADMIN'),
  controller.process
);

/**
 * POST /api/v1/ocr/:documentId/retry
 * Roles: ADMIN, REVIEWER
 */
router.post(
  '/:documentId/retry',
  authorize('ADMIN', 'REVIEWER'),
  controller.retry
);

/**
 * GET /api/v1/ocr/:documentId/result
 * Roles: All authenticated (scoped in service for UPLOADERs)
 */
router.get(
  '/:documentId/result',
  controller.getResult
);

module.exports = router;