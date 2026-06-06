const searchService = require('./search.service');
const asyncHandler  = require('../../utils/asyncHandler');
const api           = require('../../utils/apiResponse');

const byVehicleNumber = asyncHandler(async (req, res) => {
  const { vehicleNumber, page = 1, limit = 20, status } = req.query;
  const result = await searchService.searchByVehicleNumber(vehicleNumber, {
    page: Number(page), limit: Number(limit), status,
    requestingUser: req.user,
  });
  return api.paginate(res, result.documents, result.total, page, limit, 'Search results');
});

const byDateRange = asyncHandler(async (req, res) => {
  const { fromDate, toDate, page = 1, limit = 20, status } = req.query;
  const result = await searchService.searchByDateRange(fromDate, toDate, {
    page: Number(page), limit: Number(limit), status,
    requestingUser: req.user,
  });
  return api.paginate(res, result.documents, result.total, page, limit, 'Search results');
});

const byStatus = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const result = await searchService.searchByStatus(status, {
    page: Number(page), limit: Number(limit),
    requestingUser: req.user,
  });
  return api.paginate(res, result.documents, result.total, page, limit, 'Search results');
});

const byConfidence = asyncHandler(async (req, res) => {
  const { threshold, operator = 'below', fieldName, page = 1, limit = 20 } = req.query;
  const result = await searchService.searchByConfidence(threshold, operator, {
    page: Number(page), limit: Number(limit), fieldName,
    requestingUser: req.user,
  });
  return api.paginate(res, result.documents, result.total, page, limit, 'Search results');
});

const universal = asyncHandler(async (req, res) => {
  const { q, page = 1, limit = 20 } = req.query;
  const result = await searchService.universalSearch(q, {
    page: Number(page), limit: Number(limit),
    requestingUser: req.user,
  });
  return api.paginate(res, result.documents, result.total, page, limit, 'Search results');
});

module.exports = { byVehicleNumber, byDateRange, byStatus, byConfidence, universal };