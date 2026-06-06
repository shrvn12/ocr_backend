const authService    = require('./auth.service');
const asyncHandler   = require('../../utils/asyncHandler');
const api            = require('../../utils/apiResponse');

const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  return api.created(res, result, 'Account created successfully.');
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  return api.success(res, result, 'Login successful.');
});

const refresh = asyncHandler(async (req, res) => {
  const result = await authService.refresh(req.body.refreshToken);
  return api.success(res, result, 'Tokens refreshed.');
});

const getMe = asyncHandler(async (req, res) => {
  const user = await authService.getMe(req.user.id);
  return api.success(res, user);
});

const changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user.id, req.body);
  return api.success(res, null, 'Password updated successfully.');
});

// ── Admin endpoints ───────────────────────────────────────────────────────────

const listUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const { users, total } = await authService.listUsers({
    page:  Number(page),
    limit: Number(limit),
  });
  return api.paginate(res, users, total, page, limit);
});

const toggleUserActive = asyncHandler(async (req, res) => {
  const user = await authService.toggleUserActive(req.params.userId, req.user.id);
  return api.success(res, user, `User ${user.isActive ? 'activated' : 'deactivated'}.`);
});

module.exports = {
  register,
  login,
  refresh,
  getMe,
  changePassword,
  listUsers,
  toggleUserActive,
};