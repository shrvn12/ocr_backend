const dashboardService = require('./dashboard.service');
const asyncHandler     = require('../../utils/asyncHandler');
const api              = require('../../utils/apiResponse');

const getDashboard = asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;
  const data = await dashboardService.getDashboard({ days: Number(days) });
  return api.success(res, data);
});

const getStatusCounts = asyncHandler(async (_req, res) => {
  const data = await dashboardService.getStatusCounts();
  return api.success(res, data);
});

const getConfidenceDistribution = asyncHandler(async (_req, res) => {
  const data = await dashboardService.getConfidenceDistribution();
  return api.success(res, data);
});

const getThroughput = asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;
  const data = await dashboardService.getThroughput(Number(days));
  return api.success(res, data);
});

const getCorrectionRate = asyncHandler(async (_req, res) => {
  const data = await dashboardService.getCorrectionRate();
  return api.success(res, data);
});

const getRecentActivity = asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;
  const data = await dashboardService.getRecentActivity(Number(limit));
  return api.success(res, data);
});

module.exports = {
  getDashboard,
  getStatusCounts,
  getConfidenceDistribution,
  getThroughput,
  getCorrectionRate,
  getRecentActivity,
};