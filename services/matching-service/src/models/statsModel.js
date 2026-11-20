const { getPool } = require('@lifelink/shared/db');

async function availableByGroup() {
  const { rows } = await getPool().query(
    `SELECT blood_group, count(*)::int AS count FROM inventory_unit
     WHERE status = 'AVAILABLE' AND expires_at > now()
     GROUP BY blood_group`
  );
  return rows;
}

async function requestsByStatus() {
  const { rows } = await getPool().query(
    `SELECT status, count(*)::int AS count FROM request GROUP BY status`
  );
  return rows;
}

async function expiredUnitCount() {
  const { rows } = await getPool().query(
    `SELECT count(*)::int AS count FROM inventory_unit WHERE status = 'EXPIRED'`
  );
  return rows[0].count;
}

async function averageMatchMs() {
  const { rows } = await getPool().query(
    `SELECT avg(extract(epoch FROM matched_at - created_at) * 1000)::float AS avg_ms
     FROM request WHERE matched_at IS NOT NULL`
  );
  return rows[0].avg_ms;
}

module.exports = { availableByGroup, requestsByStatus, expiredUnitCount, averageMatchMs };
