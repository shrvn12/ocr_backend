require('dotenv').config();

const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const compression  = require('compression');
const morgan       = require('morgan');
const rateLimit    = require('express-rate-limit');

const logger               = require('./utils/logger');
const { errorHandler }     = require('./middleware/errorHandler');

// ── Route imports (stubbed here — populated in each module phase) ──────────────
const authRoutes      = require('./modules/auth/auth.routes');
const documentRoutes  = require('./modules/document/document.routes');
const ocrRoutes       = require('./modules/ocr/ocr.routes');
const reviewRoutes    = require('./modules/review/review.routes');
const auditRoutes     = require('./modules/audit/audit.routes');
const searchRoutes    = require('./modules/search/search.routes');
const dashboardRoutes = require('./modules/dashboard/dashboard.routes');

const app    = express();
const PREFIX = process.env.API_PREFIX || '/api/v1';

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin:      process.env.CORS_ORIGIN || '*',
    methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// ── Rate Limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});
app.use(PREFIX, limiter);

// ── Body Parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(compression());

// ── HTTP Request Logging ──────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(
    morgan('combined', {
      stream: { write: (msg) => logger.http(msg.trim()) },
    })
  );
}

// ── Health Check (no auth, no rate limit) ─────────────────────────────────────
app.get('/health', (_req, res) =>
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() })
);

// ── API Routes ────────────────────────────────────────────────────────────────
app.use(`${PREFIX}/auth`,      authRoutes);
app.use(`${PREFIX}/documents`, documentRoutes);
app.use(`${PREFIX}/ocr`,       ocrRoutes);
app.use(`${PREFIX}/reviews`,   reviewRoutes);
app.use(`${PREFIX}/audit`,     auditRoutes);
app.use(`${PREFIX}/search`,    searchRoutes);
app.use(`${PREFIX}/dashboard`, dashboardRoutes);

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((_req, res) =>
  res.status(404).json({ success: false, message: 'Route not found.' })
);

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;