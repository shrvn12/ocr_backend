const jwt             = require('jsonwebtoken');
const prisma          = require('../config/db');
const { AppError }    = require('./errorHandler');
const asyncHandler    = require('../utils/asyncHandler');

/**
 * Verifies the Bearer JWT in Authorization header.
 * Attaches the full user object to req.user.
 */
const authenticate = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError('No token provided.', 401);
  }

  const token = authHeader.split(' ')[1];
  const decoded = jwt.verify(token, process.env.JWT_SECRET); // throws on invalid/expired

  const user = await prisma.user.findUnique({
    where:  { id: decoded.sub },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });

  if (!user)           throw new AppError('User no longer exists.', 401);
  if (!user.isActive)  throw new AppError('Account is deactivated.', 403);

  req.user = user;
  next();
});

/**
 * Role-based access control factory.
 * Usage: authorize('ADMIN', 'REVIEWER')
 */
const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    throw new AppError(
      `Role '${req.user?.role}' is not permitted to perform this action.`,
      403
    );
  }
  next();
};

module.exports = { authenticate, authorize };