const { getPool } = require('@lifelink/shared/db');

const OPEN_STATUSES = ['PENDING', 'PARTIAL', 'ESCALATED'];

const REQUEST_COLUMNS = `r.id, r.hospital_id, h.name AS hospital_name, r.blood_group, r.component,
  r.quantity, r.urgency, r.status, r.created_by, r.created_at, r.matched_at, r.escalated_at,
  (SELECT count(*)::int FROM match m WHERE m.request_id = r.id) AS matched_units`;

async function insertRequest({ hospitalId, createdBy, bloodGroup, component, quantity, urgency }) {
  const { rows } = await getPool().query(
    `INSERT INTO request (hospital_id, created_by, blood_group, component, quantity, urgency)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, hospital_id, blood_group, component, quantity, urgency, status, created_at`,
    [hospitalId, createdBy || null, bloodGroup, component, quantity, urgency]
  );
  return rows[0];
}

// Request plus the requesting hospital's coordinates (the origin for distance scoring).
async function findRequestWithHospital(id) {
  const { rows } = await getPool().query(
    `SELECT ${REQUEST_COLUMNS}, h.lat, h.lng
     FROM request r JOIN institution h ON h.id = r.hospital_id
     WHERE r.id = $1`,
    [id]
  );
  return rows[0];
}

async function listRequests(hospitalId) {
  const { rows } = await getPool().query(
    `SELECT ${REQUEST_COLUMNS}
     FROM request r JOIN institution h ON h.id = r.hospital_id
     WHERE ($1::uuid IS NULL OR r.hospital_id = $1)
     ORDER BY r.created_at DESC`,
    [hospitalId || null]
  );
  return rows;
}

async function listOpenRequests({ bloodGroups = null, component = null } = {}) {
  const { rows } = await getPool().query(
    `SELECT id, urgency, created_at, blood_group, component
     FROM request
     WHERE status = ANY($1)
       AND ($2::text[] IS NULL OR blood_group = ANY($2))
       AND ($3::text IS NULL OR component = $3)`,
    [OPEN_STATUSES, bloodGroups, component]
  );
  return rows;
}

async function listMatches(requestId) {
  const { rows } = await getPool().query(
    `SELECT m.id, m.unit_id, m.institution_id, i.name AS institution_name, m.distance_km,
            m.created_at, u.blood_group, u.component, u.expires_at
     FROM match m
     JOIN inventory_unit u ON u.id = m.unit_id
     JOIN institution i ON i.id = m.institution_id
     WHERE m.request_id = $1
     ORDER BY m.created_at`,
    [requestId]
  );
  return rows;
}

// Available, unexpired units of the given groups/component, optionally limited to some institutions.
async function findCandidateUnits({ bloodGroups, component, institutionIds }) {
  const { rows } = await getPool().query(
    `SELECT u.id, u.institution_id, u.blood_group, u.component, u.expires_at, i.lat, i.lng
     FROM inventory_unit u JOIN institution i ON i.id = u.institution_id
     WHERE u.status = 'AVAILABLE' AND u.expires_at > now()
       AND u.blood_group = ANY($1) AND u.component = $2
       AND ($3::uuid[] IS NULL OR u.institution_id = ANY($3))`,
    [bloodGroups, component, institutionIds]
  );
  return rows;
}

async function markMatched(id) {
  const { rows } = await getPool().query(
    `UPDATE request SET status = 'MATCHED', matched_at = now()
     WHERE id = $1 RETURNING status, created_at, matched_at`,
    [id]
  );
  return rows[0];
}

async function markPartial(id) {
  await getPool().query(`UPDATE request SET status = 'PARTIAL' WHERE id = $1 AND status = 'PENDING'`, [id]);
}

// Returns true only for the caller that actually moved the request to ESCALATED.
async function markEscalated(id) {
  const { rowCount } = await getPool().query(
    `UPDATE request SET status = 'ESCALATED', escalated_at = now()
     WHERE id = $1 AND status IN ('PENDING', 'PARTIAL')`,
    [id]
  );
  return rowCount === 1;
}

async function listEscalatedBefore(cutoff) {
  const { rows } = await getPool().query(
    `SELECT id, blood_group, component, urgency, escalated_at
     FROM request WHERE status = 'ESCALATED' AND escalated_at < $1`,
    [cutoff]
  );
  return rows;
}

// Runs fn while holding a per-request advisory lock, so two matchers (timer, consumer, a second
// instance) never fill the same request at once. Returns null if another matcher holds it.
async function withRequestLock(id, fn) {
  const client = await getPool().connect();
  try {
    const { rows } = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [id]);
    if (!rows[0].locked) {
      return null;
    }
    try {
      return await fn();
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [id]);
    }
  } finally {
    client.release();
  }
}

module.exports = {
  withRequestLock,
  insertRequest,
  findRequestWithHospital,
  listRequests,
  listOpenRequests,
  listMatches,
  findCandidateUnits,
  markMatched,
  markPartial,
  markEscalated,
  listEscalatedBefore,
};
