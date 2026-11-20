const RedisMock = require('ioredis-mock');
const { createPool, setPool, getPool } = require('@lifelink/shared/db');
const { setRedis } = require('@lifelink/shared/redis');
const { TEST_DB_URL } = require('../../../db/testSetup');

const DAY_MS = 24 * 60 * 60 * 1000;

function useTestBackends() {
  setPool(createPool(TEST_DB_URL));
  const redis = new RedisMock();
  setRedis(redis);
  return redis;
}

async function resetDb() {
  await getPool().query(
    'TRUNCATE match, notification, request, inventory_unit, app_user, donor, institution CASCADE'
  );
}

async function insertInstitution(name, type, lat, lng) {
  const { rows } = await getPool().query(
    `INSERT INTO institution (name, type, city, lat, lng) VALUES ($1, $2, 'Bengaluru', $3, $4) RETURNING id`,
    [name, type, lat, lng]
  );
  return rows[0].id;
}

async function insertUnit(institutionId, bloodGroup, { expiresInDays = 20, component = 'PRBC' } = {}) {
  const expiresAt = new Date(Date.now() + expiresInDays * DAY_MS);
  const { rows } = await getPool().query(
    `INSERT INTO inventory_unit (institution_id, blood_group, component, collected_at, expires_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [institutionId, bloodGroup, component, new Date(expiresAt.getTime() - 35 * DAY_MS), expiresAt]
  );
  return rows[0].id;
}

async function streamPayloads(redis, stream) {
  const entries = await redis.xrange(stream, '-', '+');
  return entries.map(([, fields]) => JSON.parse(fields[1]));
}

module.exports = { useTestBackends, resetDb, insertInstitution, insertUnit, streamPayloads };
