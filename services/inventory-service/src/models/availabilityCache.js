const { getRedis } = require('@lifelink/shared/redis');
const unitModel = require('./unitModel');

const PREFIX = 'avail';

function cacheKey(institutionId, bloodGroup, component) {
  return `${PREFIX}:${institutionId}:${bloodGroup}:${component}`;
}

// Recount one institution/group/component from the database (the source of truth).
async function refreshKey({ institutionId, bloodGroup, component }) {
  const count = await unitModel.countAvailable(institutionId, bloodGroup, component);
  await getRedis().set(cacheKey(institutionId, bloodGroup, component), count);
  return count;
}

// shortcut: KEYS is O(n) over the keyspace; fine for a demo-sized Redis, switch to SCAN if it grows.
async function rebuildAll() {
  const redis = getRedis();
  const rows = await unitModel.countAllAvailable();
  const stale = await redis.keys(`${PREFIX}:*`);
  const tx = redis.multi();
  if (stale.length) {
    tx.del(...stale);
  }
  for (const row of rows) {
    tx.set(cacheKey(row.institution_id, row.blood_group, row.component), row.count);
  }
  await tx.exec();
  return rows.length;
}

module.exports = { cacheKey, refreshKey, rebuildAll };
