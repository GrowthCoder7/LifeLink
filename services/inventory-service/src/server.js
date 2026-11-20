const os = require('os');
const app = require('./app');
const logger = require('@lifelink/shared/logger');
const { consume } = require('@lifelink/shared/events');
const cache = require('./models/availabilityCache');
const expiryMonitor = require('./jobs/expiryMonitor');

const port = Number(process.env.PORT) || 4002;
const name = process.env.SERVICE_NAME || 'inventory-service';

async function start() {
  const keys = await cache.rebuildAll();
  logger.info('availability cache rebuilt', { keys });

  // Allocations made by matching-service change stock too; keep those cache keys fresh.
  consume({
    stream: 'inventory.updated',
    group: 'inventory-service',
    consumer: os.hostname(),
    handler: cache.refreshKey,
  }).catch((err) => logger.error('inventory.updated consumer stopped', { error: err.message }));

  expiryMonitor.start();
  app.listen(port, () => logger.info(`${name} listening on port ${port}`));
}

start().catch((err) => {
  logger.error('inventory-service failed to start', { error: err.message });
  process.exit(1);
});
