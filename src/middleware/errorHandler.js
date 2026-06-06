const logger = require('../utils/logger');

// ── Known error types ─────────────────────────────────────────────────────────

const PRISMA_ERROR_MAP = {
  P2002: { status: 409, message: 'A record with this value already exists.' },
  P2025: { status: 404, message: 'Record not found.' },
  P2003: { status: 400, message: 'Related record not found.' },
  P2014: { status: 400, message: 'Invalid relation.' },
};

// ── Global error handler (must have 4 params for Express to treat it as error middleware) ──

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // Prisma known errors
  if (err.code && PRISMA_ERROR_MAP[err.code]) {
    const { status, message } = PRISMA_ERROR_MAP[err.code];
    return res.status(status).json({ success: false, message });
  }

  // Prisma validation errors
  if (err.name === 'PrismaClientValidationError') {
    return res.status(400).json({ success: false, message: 'Invalid data provided.' });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Token expired.' });
  }

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      message: `File too large. Maximum size is ${process.env.MAX_FILE_SIZE_MB || 10}MB.`,
    });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ success: false, message: 'Unexpected file field.' });
  }

  // Operational errors (thrown intentionally with a statusCode)
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.errors && { errors: err.errors }),
    });
  }

  // Unknown / programmer errors — log and hide details in production
  logger.error(err);

  return res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'Internal server error.'
      : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

// ── AppError factory ──────────────────────────────────────────────────────────

class AppError extends Error {
  constructor(message, statusCode = 500, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.errors     = errors;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = { errorHandler, AppError };