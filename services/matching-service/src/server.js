const os = require('os');
const app = require('./app');
const logger = require('@lifelink/shared/logger');
const { consume } = require('@lifelink/shared/events');
const { matchRequest } = require('./engine/allocator');
const { compatibleRecipientGroups } = require('./engine/compatibility');
const escalation = require('./engine/escalation');

const port = Number(process.env.PORT) || 4003;
const name = process.env.SERVICE_NAME || 'matching-service';

// New or freed stock: retry open requests that could use it, in rank order.
// One consumer group across all instances, so each event is handled once.
function onInventoryUpdated(event) {
  return escalation.retryOpenRequests(matchRequest, {
    bloodGroups: compatibleRecipientGroups(event.bloodGroup),
    component: event.component,
  });
}

consume({
  stream: 'inventory.updated',
  group: 'matching-service',
  consumer: os.hostname(),
  handler: onInventoryUpdated,
}).catch((err) => logger.error('inventory.updated consumer stopped', { error: err.message }));

escalation.start(matchRequest);

app.listen(port, () => {
  logger.info(`${name} listening on port ${port}`);
});
