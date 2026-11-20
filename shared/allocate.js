const logger = require('./logger');

async function allocateUnit(client, unitId, requestId, distanceKm) {
  const release = typeof client.connect === 'function';
  const conn = release ? await client.connect() : client;
  try {
    await conn.query('BEGIN');
    const { rows } = await conn.query(
      `SELECT id, institution_id
       FROM inventory_unit
       WHERE id = $1 AND status = 'AVAILABLE'
       FOR UPDATE SKIP LOCKED`,
      [unitId]
    );
    const unit = rows[0];
    if (!unit) {
      await conn.query('ROLLBACK');
      return { ok: false };
    }
    await conn.query(`UPDATE inventory_unit SET status = 'ALLOCATED' WHERE id = $1`, [unitId]);
    await conn.query(
      `INSERT INTO match (request_id, unit_id, institution_id, distance_km)
       VALUES ($1, $2, $3, $4)`,
      [requestId, unitId, unit.institution_id, distanceKm]
    );
    await conn.query('COMMIT');
    logger.debug('unit allocated', { unitId, requestId });
    return { ok: true };
  } catch (err) {
    await conn.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') {
      return { ok: false };
    }
    throw err;
  } finally {
    if (release) {
      conn.release();
    }
  }
}

module.exports = { allocateUnit };
