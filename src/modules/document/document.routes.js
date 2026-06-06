const { Router }                  = require('express');
const controller                  = require('./document.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const upload                      = require('../../middleware/upload');
const validate                    = require('../../middleware/validate');
const v                           = require('./document.validation');

const router = Router();

// All document routes require authentication
router.use(authenticate);

/**
 * POST /api/v1/documents/upload
 * Roles: UPLOADER, ADMIN
 * Multer processes the "document" field from multipart/form-data.
 * On success → triggers OCR pipeline asynchronously.
 */
router.post(
  '/upload',
  authorize('UPLOADER', 'ADMIN'),
  upload.single('document'),
  controller.upload
);

/**
 * GET /api/v1/documents
 * Roles: All authenticated
 * UPLOADER: sees only their own. REVIEWER/ADMIN: sees all.
 */
router.get(
  '/',
  validate(v.listDocuments, 'query'),
  controller.list
);

/**
 * GET /api/v1/documents/:id
 */
router.get(
  '/:id',
  validate(v.documentId, 'params'),
  controller.getOne
);

/**
 * PATCH /api/v1/documents/:id/status
 * Roles: ADMIN only (manual status override)
 */
router.patch(
  '/:id/status',
  authorize('ADMIN'),
  validate(v.documentId, 'params'),
  validate(v.updateStatus),
  controller.updateStatus
);

/**
 * DELETE /api/v1/documents/:id
 * Roles: ADMIN (any), UPLOADER (own + UPLOADED status only)
 */
router.delete(
  '/:id',
  validate(v.documentId, 'params'),
  controller.remove
);

module.exports = router;