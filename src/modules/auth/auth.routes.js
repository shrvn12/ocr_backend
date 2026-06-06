const { Router }              = require('express');
const controller              = require('./auth.controller');
const validate                = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const v                       = require('./auth.validation');

const router = Router();

// ── Public ────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/register
 * Body: { name, email, password, role? }
 */
router.post('/register',
  validate(v.register),
  controller.register
);

/**
 * POST /api/v1/auth/login
 * Body: { email, password }
 * Returns: { user, tokens: { accessToken, refreshToken, expiresIn } }
 */
router.post('/login',
  validate(v.login),
  controller.login
);

/**
 * POST /api/v1/auth/refresh
 * Body: { refreshToken }
 * Returns: { tokens }
 */
router.post('/refresh',
  validate(v.refreshToken),
  controller.refresh
);

// ── Authenticated ─────────────────────────────────────────────────────────────

/**
 * GET /api/v1/auth/me
 * Returns: current user profile + document count
 */
router.get('/me',
  authenticate,
  controller.getMe
);

/**
 * PATCH /api/v1/auth/me/password
 * Body: { currentPassword, newPassword }
 */
router.patch('/me/password',
  authenticate,
  validate(v.changePassword),
  controller.changePassword
);

// ── Admin ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/auth/users
 * Query: { page?, limit? }
 */
router.get('/users',
  authenticate,
  authorize('ADMIN'),
  controller.listUsers
);

/**
 * PATCH /api/v1/auth/users/:userId/toggle-active
 */
router.patch('/users/:userId/toggle-active',
  authenticate,
  authorize('ADMIN'),
  controller.toggleUserActive
);

module.exports = router;