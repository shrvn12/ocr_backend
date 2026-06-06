const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [
      { level: 'query',  emit: 'event' },
      { level: 'error',  emit: 'stdout' },
      { level: 'warn',   emit: 'stdout' },
    ],
  });

if (process.env.NODE_ENV === 'development') {
  prisma.$on('query', (e) => {
    logger.debug(`[Prisma] ${e.query} — ${e.duration}ms`);
  });
}

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;