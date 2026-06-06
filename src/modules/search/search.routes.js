const { Router }   = require('express');
const controller   = require('./search.controller');
const { authenticate } = require('../../middleware/auth');

const router = Router();

router.use(authenticate);

// GET /api/v1/search/vehicle?vehicleNumber=MH12AB1234&page=1&limit=20&status=APPROVED
router.get('/vehicle',    controller.byVehicleNumber);

// GET /api/v1/search/date?fromDate=2024-01-01&toDate=2024-12-31
router.get('/date',       controller.byDateRange);

// GET /api/v1/search/status?status=READY_FOR_REVIEW
router.get('/status',     controller.byStatus);

// GET /api/v1/search/confidence?threshold=0.75&operator=below&fieldName=weight
router.get('/confidence', controller.byConfidence);

// GET /api/v1/search?q=MH12AB
router.get('/',           controller.universal);

module.exports = router;