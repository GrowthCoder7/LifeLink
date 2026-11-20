const { publish } = require('@lifelink/shared/events');
const logger = require('@lifelink/shared/logger');
const unitModel = require('../models/unitModel');
const cache = require('../models/availabilityCache');

const NEAR_EXPIRY_MS = 3 * 24 * 60 * 60 * 1000;

// Pure rule: past expiry -> EXPIRED; within 3 days -> NEAR_EXPIRY; otherwise OK.
function classify(unit, now = new Date()) {
  const msLeft = new Date(unit.expires_at).getTime() - new Date(now).getTime();
  if (msLeft < 0) {
    return 'EXPIRED';
  }
  return msLeft <= NEAR_EXPIRY_MS ? 'NEAR_EXPIRY' : 'OK';
}

function stockKey(unit) {
  return { institutionId: unit.institution_id, bloodGroup: unit.blood_group, component: unit.component };
}

async function applyFlag(unit, flag) {
  const updated = await unitModel.updateExpiry(unit.id, flag);
  if (updated && flag !== 'OK') {
    await publish('unit.expiring', {
      unitId: unit.id,
      institutionId: unit.institution_id,
      bloodGroup: unit.blood_group,
      flag,
    });
  }
  return updated;
}

// Re-flags every non-allocated unit, refreshes the cache keys it touched and
// publishes unit.expiring for units that newly became NEAR_EXPIRY or EXPIRED.
async function run(now = new Date()) {
  const units = await unitModel.listUnitsForExpiryCheck();
  const touched = new Map();
  for (const unit of units) {
    const flag = classify(unit, now);
    if (flag !== unit.expiry_flag && (await applyFlag(unit, flag))) {
      const key = stockKey(unit);
      touched.set(cache.cacheKey(key.institutionId, key.bloodGroup, key.component), key);
    }
  }
  for (const key of touched.values()) {
    await cache.refreshKey(key);
  }
  return touched.size;
}

function start(intervalMs = Number(process.env.EXPIRY_INTERVAL_MS) || 60000) {
  let running = false;
  const tick = async () => {
    if (running) {
      return;
    }
    running = true;
    try {
      await run();
    } catch (err) {
      logger.error('expiry monitor run failed', { error: err.message });
    } finally {
      running = false;
    }
  };
  logger.info('expiry monitor started', { intervalMs });
  tick();
  return setInterval(tick, intervalMs);
}

module.exports = { classify, run, start };
