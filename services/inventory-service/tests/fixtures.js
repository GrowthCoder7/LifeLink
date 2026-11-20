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

async function insertInstitution(name, type) {
  const { rows } = await getPool().query(
    `INSERT INTO institution (name, type, city, lat, lng) VALUES ($1, $2, 'Bengaluru', 13.0, 77.6) RETURNING id`,
    [name, type]
  );
  return rows[0].id;
}

async function insertUnit(institutionId, { bloodGroup = 'O-', expiresInDays = 20, status = 'AVAILABLE', flag = 'OK' } = {}) {
  const expiresAt = new Date(Date.now() + expiresInDays * DAY_MS);
  const { rows } = await getPool().query(
    `INSERT INTO inventory_unit (institution_id, blood_group, component, collected_at, expires_at, status, expiry_flag)
     VALUES ($1, $2, 'PRBC', $3, $4, $5, $6) RETURNING id`,
    [institutionId, bloodGroup, new Date(expiresAt.getTime() - 35 * DAY_MS), expiresAt, status, flag]
  );
  return rows[0].id;
}

async function insertRequest(hospitalId) {
  const { rows } = await getPool().query(
    `INSERT INTO request (hospital_id, blood_group, component, quantity, urgency)
     VALUES ($1, 'O-', 'PRBC', 1, 'EMERGENCY') RETURNING id`,
    [hospitalId]
  );
  return rows[0].id;
}

module.exports = { DAY_MS, useTestBackends, resetDb, insertInstitution, insertUnit, insertRequest };
