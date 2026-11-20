const { getPool } = require('@lifelink/shared/db');

const PUBLIC_COLUMNS = `id, full_name, email, blood_group, date_of_birth, last_donation_date,
  organ_pledge, city, lat, lng, created_at`;

// Creates the donor (phone encrypted with pgcrypto) and its DONOR login in one transaction.
async function createDonorWithUser(donor, passwordHash, piiKey) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO donor (full_name, email, phone_encrypted, blood_group, date_of_birth,
         last_donation_date, organ_pledge, city, lat, lng)
       VALUES ($1, $2, pgp_sym_encrypt($3, $4), $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [donor.full_name, donor.email, donor.phone, piiKey, donor.blood_group, donor.date_of_birth,
        donor.last_donation_date || null, donor.organ_pledge, donor.city || null,
        donor.lat ?? null, donor.lng ?? null]
    );
    const donorId = rows[0].id;
    await client.query(
      `INSERT INTO app_user (email, password_hash, role, donor_id) VALUES ($1, $2, 'DONOR', $3)`,
      [donor.email, passwordHash, donorId]
    );
    await client.query('COMMIT');
    return donorId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function findDonorWithPhone(donorId, piiKey) {
  const { rows } = await getPool().query(
    `SELECT ${PUBLIC_COLUMNS}, pgp_sym_decrypt(phone_encrypted, $2) AS phone
     FROM donor WHERE id = $1`,
    [donorId, piiKey]
  );
  return rows[0];
}

async function listDonors(bloodGroup) {
  const { rows } = await getPool().query(
    `SELECT ${PUBLIC_COLUMNS} FROM donor
     WHERE ($1::text IS NULL OR blood_group = $1)
     ORDER BY full_name`,
    [bloodGroup || null]
  );
  return rows;
}

module.exports = { createDonorWithUser, findDonorWithPhone, listDonors };
