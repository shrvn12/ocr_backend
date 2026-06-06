const { Router }                  = require('express');
const controller                  = require('./audit.controller');
const { authenticate, authorize } = require('../../middleware/auth');

const router = Router();

router.use(authenticate);

// GET /api/v1/audit/documents/:documentId   — all roles
router.get('/documents/:documentId', controller.getDocumentTrail);

// GET /api/v1/audit/users/me               — own activity
router.get('/users/me', controller.getUserActivity);

// GET /api/v1/audit/users/:userId          — admin: any user's activity
router.get('/users/:userId', authorize('ADMIN'), controller.getUserActivity);

// GET /api/v1/audit/fields/:fieldName      — admin + reviewer
router.get('/fields/:fieldName', authorize('ADMIN', 'REVIEWER'), controller.getFieldHistory);

// GET /api/v1/audit                        — global log (admin only)
router.get('/', authorize('ADMIN'), controller.getGlobalLog);

// GET /api/v1/audit/stats/corrections      — admin only
router.get('/stats/corrections', authorize('ADMIN'), controller.getCorrectionStats);

module.exports = router;