const { getPool } = require('@lifelink/shared/db');

const UNIT_COLUMNS = `u.id, u.institution_id, i.name AS institution_name, u.blood_group, u.component,
  u.collected_at, u.expires_at, u.status, u.expiry_flag, u.donor_id, u.created_at,
  m.created_at AS allocated_at, h.name AS allocated_to`;

// Allocation details (when and to which hospital) for the blood bank's "Recent allocations".
const UNIT_JOINS = `inventory_unit u JOIN institution i ON i.id = u.institution_id
  LEFT JOIN match m ON m.unit_id = u.id
  LEFT JOIN request r ON r.id = m.request_id
  LEFT JOIN institution h ON h.id = r.hospital_id`;

async function listUnits({ institutionId, bloodGroup, status, expiryFlag }) {
  const { rows } = await getPool().query(
    `SELECT ${UNIT_COLUMNS}
     FROM ${UNIT_JOINS}
     WHERE ($1::uuid IS NULL OR u.institution_id = $1)
       AND ($2::text IS NULL OR u.blood_group = $2)
       AND ($3::text IS NULL OR u.status = $3)
       AND ($4::text IS NULL OR u.expiry_flag = $4)
     ORDER BY u.expires_at`,
    [institutionId || null, bloodGroup || null, status || null, expiryFlag || null]
  );
  return rows;
}

async function findUnit(id) {
  const { rows } = await getPool().query(
    `SELECT ${UNIT_COLUMNS}
     FROM ${UNIT_JOINS}
     WHERE u.id = $1`,
    [id]
  );
  return rows[0];
}

async function insertUnit(institutionId, unit) {
  const { rows } = await getPool().query(
    `INSERT INTO inventory_unit (institution_id, blood_group, component, collected_at, expires_at, donor_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, institution_id, blood_group, component, collected_at, expires_at, status, expiry_flag`,
    [institutionId, unit.bloodGroup, unit.component, unit.collectedAt, unit.expiresAt, unit.donorId || null]
  );
  return rows[0];
}

// Allocation only happens through shared/allocate.js, so an ALLOCATED unit is never changed here.
async function updateStatus(id, status) {
  const { rows } = await getPool().query(
    `UPDATE inventory_unit SET status = $2
     WHERE id = $1 AND status <> 'ALLOCATED'
     RETURNING id, institution_id, blood_group, component, status, expiry_flag`,
    [id, status]
  );
  return rows[0];
}

async function listUnitsForExpiryCheck() {
  const { rows } = await getPool().query(
    `SELECT id, institution_id, blood_group, component, expires_at, status, expiry_flag
     FROM inventory_unit WHERE status <> 'ALLOCATED'`
  );
  return rows;
}

async function updateExpiry(id, flag) {
  const { rowCount } = await getPool().query(
    `UPDATE inventory_unit
     SET expiry_flag = $2, status = CASE WHEN $2 = 'EXPIRED' THEN 'EXPIRED' ELSE status END
     WHERE id = $1 AND status <> 'ALLOCATED'`,
    [id, flag]
  );
  return rowCount === 1;
}

async function countAvailable(institutionId, bloodGroup, component) {
  const { rows } = await getPool().query(
    `SELECT count(*)::int AS count FROM inventory_unit
     WHERE institution_id = $1 AND blood_group = $2 AND component = $3
       AND status = 'AVAILABLE' AND expires_at > now()`,
    [institutionId, bloodGroup, component]
  );
  return rows[0].count;
}

async function countAllAvailable() {
  const { rows } = await getPool().query(
    `SELECT institution_id, blood_group, component, count(*)::int AS count
     FROM inventory_unit WHERE status = 'AVAILABLE' AND expires_at > now()
     GROUP BY institution_id, blood_group, component`
  );
  return rows;
}

module.exports = {
  listUnits,
  findUnit,
  insertUnit,
  updateStatus,
  listUnitsForExpiryCheck,
  updateExpiry,
  countAvailable,
  countAllAvailable,
};
