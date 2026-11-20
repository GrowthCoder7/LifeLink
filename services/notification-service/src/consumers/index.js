const os = require('os');
const { consume } = require('@lifelink/shared/events');
const logger = require('@lifelink/shared/logger');
const handlers = require('./handlers');

const GROUP = 'notification-service';

const SUBSCRIPTIONS = {
  'request.created': handlers.onRequestCreated,
  'match.created': handlers.onMatchCreated,
  'request.escalated': handlers.onRequestEscalated,
  'unit.expiring': handlers.onUnitExpiring,
};

// One listener per stream. Pending (un-acked) entries are processed first, so events
// published while this service was down are delivered when it comes back.
function startConsumers(consumer = os.hostname()) {
  for (const [stream, handler] of Object.entries(SUBSCRIPTIONS)) {
    consume({ stream, group: GROUP, consumer, handler })
      .catch((err) => logger.error('consumer stopped', { stream, error: err.message }));
  }
}

module.exports = { startConsumers };
