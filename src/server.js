import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'tuk-track-api listening');
});

function shutdown(signal) {
  logger.info({ signal }, 'Shutting down');
  server.close((err) => {
    if (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
    process.exit(0);
  });
  setTimeout(() => {
    logger.warn('Force exit after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => logger.error({ reason }, 'Unhandled rejection'));
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});
