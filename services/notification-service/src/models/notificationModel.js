const { getPool } = require('@lifelink/shared/db');

// A row reaches a user directly (user_id), every staff member of one institution
// (role + institution_id), or everyone holding a role (role only).
const VISIBLE_TO_CALLER = `(user_id = $1
  OR (user_id IS NULL AND role = $2 AND (institution_id IS NULL OR institution_id = $3)))`;

// All rows for one event are written together, so a redelivered event never leaves half a set.
// shortcut: a crash after COMMIT but before XACK duplicates the set; add an event-id column to dedupe.
async function insertNotifications(rows) {
  if (!rows.length) {
    return 0;
  }
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    for (const row of rows) {
      await client.query(
        `INSERT INTO notification (user_id, role, institution_id, channel, title, body)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [row.userId || null, row.role || null, row.institutionId || null, row.channel || 'IN_APP', row.title, row.body]
      );
    }
    await client.query('COMMIT');
    return rows.length;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function listForCaller({ userId, role, institutionId }, limit = 50) {
  const { rows } = await getPool().query(
    `SELECT id, channel, title, body, read_at, created_at
     FROM notification WHERE ${VISIBLE_TO_CALLER}
     ORDER BY created_at DESC LIMIT $4`,
    [userId, role, institutionId || null, limit]
  );
  return rows;
}

// shortcut: role-wide rows share one read_at, so one staff member marking it read marks it for the
// whole team; a per-user receipt table would fix that if needed.
async function markRead(id, { userId, role, institutionId }) {
  const { rows } = await getPool().query(
    `UPDATE notification SET read_at = coalesce(read_at, now())
     WHERE id = $4 AND ${VISIBLE_TO_CALLER}
     RETURNING id, read_at`,
    [userId, role, institutionId || null, id]
  );
  return rows[0];
}

async function institutionName(id) {
  const { rows } = await getPool().query('SELECT name FROM institution WHERE id = $1', [id]);
  return rows[0] ? rows[0].name : 'a hospital';
}

async function userIdsForDonors(donorIds) {
  if (!donorIds.length) {
    return [];
  }
  const { rows } = await getPool().query('SELECT id FROM app_user WHERE donor_id = ANY($1)', [donorIds]);
  return rows.map((row) => row.id);
}

module.exports = { insertNotifications, listForCaller, markRead, institutionName, userIdsForDonors };
