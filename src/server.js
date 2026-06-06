require('dotenv').config();

const app    = require('./app');
const prisma = require('./config/db');
const logger = require('./utils/logger');

const PORT = parseInt(process.env.PORT, 10) || 5000;

const start = async () => {
  // 1. Verify DB connectivity before accepting traffic
  await prisma.$connect();
  logger.info('✅ PostgreSQL connected via Prisma');

  // 2. Verify Google Vision credentials are resolvable
  const { getVisionClient } = require('./config/vision');
  getVisionClient(); // throws early if misconfigured
  logger.info('✅ Google Vision client initialised');

  // 3. Start HTTP server
  const server = app.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV}]`);
    logger.info(`📡 API prefix: ${process.env.API_PREFIX || '/api/v1'}`);
  });

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal) => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      await prisma.$disconnect();
      logger.info('DB connection closed');
      process.exit(0);
    });

    // Force exit after 10 s if connections don't close
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  // Unhandled promise rejections
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection:', reason);
    shutdown('unhandledRejection');
  });
};

start().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});