const { Router }                  = require('express');
const controller                  = require('./dashboard.controller');
const { authenticate, authorize } = require('../../middleware/auth');

const router = Router();

router.use(authenticate, authorize('ADMIN', 'REVIEWER'));

// GET /api/v1/dashboard                        — full aggregated dashboard
router.get('/',              controller.getDashboard);

// GET /api/v1/dashboard/status                 — status bucket counts
router.get('/status',        controller.getStatusCounts);

// GET /api/v1/dashboard/confidence             — high/medium/low distribution
router.get('/confidence',    controller.getConfidenceDistribution);

// GET /api/v1/dashboard/throughput?days=30     — daily upload/approve/reject series
router.get('/throughput',    controller.getThroughput);

// GET /api/v1/dashboard/correction-rate        — how often OCR is corrected
router.get('/correction-rate', controller.getCorrectionRate);

// GET /api/v1/dashboard/activity?limit=10      — recent audit events feed
router.get('/activity',      controller.getRecentActivity);

module.exports = router;