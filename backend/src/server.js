import { createApp } from './app.js';
import { env, assertProductionSecrets } from './config/env.js';
import { pool } from './database/pool.js';
import { startScheduler } from './jobs/scheduler.js';
import { logger } from './utils/logger.js';

assertProductionSecrets();
const app = createApp();
const server = app.listen(env.port, () => {
  logger.info(`${env.appName} API listening`, { port: env.port });
  startScheduler();
});

async function shutdown() {
  logger.info('Shutting down');
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
