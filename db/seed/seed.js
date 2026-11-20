const bcrypt = require('bcryptjs');
const { createPool } = require('@lifelink/shared/db');
const logger = require('@lifelink/shared/logger');

const DEMO_PASSWORD = 'Demo@1234';
const DAY_MS = 24 * 60 * 60 * 1000;
const PII_KEY = process.env.PII_KEY || 'lifelink-dev-pii-key';

const INSTITUTIONS = [
  { name: 'Yelahanka General Hospital', type: 'HOSPITAL', city: 'Bengaluru', lat: 13.1007, lng: 77.5963 },
  { name: 'Jayanagar City Hospital', type: 'HOSPITAL', city: 'Bengaluru', lat: 12.925, lng: 77.5938 },
  { name: 'Whitefield Care Hospital', type: 'HOSPITAL', city: 'Bengaluru', lat: 12.9698, lng: 77.75 },
  { name: 'Hebbal Blood Centre', type: 'BLOOD_BANK', city: 'Bengaluru', lat: 13.0358, lng: 77.597 },
  { name: 'Koramangala Blood Bank', type: 'BLOOD_BANK', city: 'Bengaluru', lat: 12.9352, lng: 77.6245 },
  { name: 'Malleshwaram Red Cross Bank', type: 'BLOOD_BANK', city: 'Bengaluru', lat: 13.0035, lng: 77.5709 },
];

const DONORS = [
  { fullName: 'Priya Sharma', email: 'donor.priya@lifelink.dev', phone: '+91-9845011101', bloodGroup: 'O-', dob: '1996-04-12', lastDonationDaysAgo: 120, organPledge: true, city: 'Bengaluru', lat: 13.0358, lng: 77.597 },
  { fullName: 'Arjun Mehta', email: 'arjun.mehta@example.com', phone: '+91-9845011102', bloodGroup: 'O+', dob: '1990-07-03', lastDonationDaysAgo: 100, organPledge: false, city: 'Bengaluru', lat: 12.9352, lng: 77.6245 },
  { fullName: 'Sneha Reddy', email: 'sneha.reddy@example.com', phone: '+91-9845011103', bloodGroup: 'A+', dob: '1998-02-19', lastDonationDaysAgo: 20, organPledge: true, city: 'Bengaluru', lat: 13.0035, lng: 77.5709 },
  { fullName: 'Vikram Rao', email: 'vikram.rao@example.com', phone: '+91-9845011104', bloodGroup: 'B+', dob: '1985-11-27', lastDonationDaysAgo: 95, organPledge: false, city: 'Bengaluru', lat: 13.1007, lng: 77.5963 },
  { fullName: 'Ananya Iyer', email: 'ananya.iyer@example.com', phone: '+91-9845011105', bloodGroup: 'AB+', dob: '1993-05-08', lastDonationDaysAgo: null, organPledge: false, city: 'Bengaluru', lat: 12.925, lng: 77.5938 },
  { fullName: 'Rohan Das', email: 'rohan.das@example.com', phone: '+91-9845011106', bloodGroup: 'O-', dob: '2001-09-14', lastDonationDaysAgo: 30, organPledge: false, city: 'Bengaluru', lat: 12.9698, lng: 77.75 },
  { fullName: 'Kavita Nair', email: 'kavita.nair@example.com', phone: '+91-9845011107', bloodGroup: 'A-', dob: '1988-01-22', lastDonationDaysAgo: 150, organPledge: true, city: 'Bengaluru', lat: 13.0358, lng: 77.597 },
  { fullName: 'Imran Khan', email: 'imran.khan@example.com', phone: '+91-9845011108', bloodGroup: 'B-', dob: '1995-12-05', lastDonationDaysAgo: 10, organPledge: false, city: 'Bengaluru', lat: 12.9352, lng: 77.6245 },
  { fullName: 'Divya Menon', email: 'divya.menon@example.com', phone: '+91-9845011109', bloodGroup: 'AB-', dob: '1991-03-30', lastDonationDaysAgo: 200, organPledge: false, city: 'Bengaluru', lat: 13.0035, lng: 77.5709 },
  { fullName: 'Sanjay Patel', email: 'sanjay.patel@example.com', phone: '+91-9845011110', bloodGroup: 'O+', dob: '1983-06-17', lastDonationDaysAgo: 45, organPledge: false, city: 'Bengaluru', lat: 13.1007, lng: 77.5963 },
  { fullName: 'Meera Joshi', email: 'meera.joshi@example.com', phone: '+91-9845011111', bloodGroup: 'A+', dob: '1997-08-11', lastDonationDaysAgo: 110, organPledge: true, city: 'Bengaluru', lat: 12.925, lng: 77.5938 },
  { fullName: 'Karthik Subramanian', email: 'karthik.s@example.com', phone: '+91-9845011112', bloodGroup: 'B+', dob: '1989-10-25', lastDonationDaysAgo: null, organPledge: false, city: 'Bengaluru', lat: 12.9698, lng: 77.75 },
  { fullName: 'Lena Mathew', email: 'lena.mathew@example.com', phone: '+91-9845011113', bloodGroup: 'O-', dob: '1994-02-02', lastDonationDaysAgo: 140, organPledge: true, city: 'Bengaluru', lat: 13.0358, lng: 77.597 },
  { fullName: 'Nikhil Verma', email: 'nikhil.verma@example.com', phone: '+91-9845011114', bloodGroup: 'A-', dob: '2000-04-09', lastDonationDaysAgo: 60, organPledge: false, city: 'Bengaluru', lat: 12.9352, lng: 77.6245 },
  { fullName: 'Farah Sheikh', email: 'farah.sheikh@example.com', phone: '+91-9845011115', bloodGroup: 'AB+', dob: '1992-07-21', lastDonationDaysAgo: 90, organPledge: false, city: 'Bengaluru', lat: 13.0035, lng: 77.5709 },
];

const USERS = [
  { email: 'admin@lifelink.dev', role: 'ADMIN', institutionName: null, donorEmail: null },
  { email: 'hospital.yelahanka@lifelink.dev', role: 'HOSPITAL_STAFF', institutionName: 'Yelahanka General Hospital', donorEmail: null },
  { email: 'hospital.jayanagar@lifelink.dev', role: 'HOSPITAL_STAFF', institutionName: 'Jayanagar City Hospital', donorEmail: null },
  { email: 'bank.hebbal@lifelink.dev', role: 'BLOODBANK_STAFF', institutionName: 'Hebbal Blood Centre', donorEmail: null },
  { email: 'bank.koramangala@lifelink.dev', role: 'BLOODBANK_STAFF', institutionName: 'Koramangala Blood Bank', donorEmail: null },
  { email: 'donor.priya@lifelink.dev', role: 'DONOR', institutionName: null, donorEmail: 'donor.priya@lifelink.dev' },
];

// Each bank's first units become near-expiry/expired (see classifySeedUnit). Hebbal lists A+
// first so demo step 1 (2 x O+ PRBC from Hebbal) leaves its amber near-expiry rows visible.
const BANK_UNITS = [
  { bank: 0, group: 'A+', component: 'PRBC', count: 4 },
  { bank: 0, group: 'O+', component: 'PRBC', count: 5 },
  { bank: 0, group: 'B+', component: 'WHOLE_BLOOD', count: 3 },
  { bank: 0, group: 'AB+', component: 'PLASMA', count: 2 },
  { bank: 0, group: 'O-', component: 'PRBC', count: 1 },
  { bank: 0, group: 'A-', component: 'PRBC', count: 1 },
  { bank: 0, group: 'O+', component: 'WHOLE_BLOOD', count: 1 },
  { bank: 0, group: 'A+', component: 'PLASMA', count: 1 },

  { bank: 1, group: 'O+', component: 'PRBC', count: 4 },
  { bank: 1, group: 'A+', component: 'PRBC', count: 3 },
  { bank: 1, group: 'B+', component: 'WHOLE_BLOOD', count: 3 },
  { bank: 1, group: 'AB+', component: 'PLASMA', count: 1 },
  { bank: 1, group: 'O-', component: 'PRBC', count: 1 },
  { bank: 1, group: 'B-', component: 'PRBC', count: 1 },

  { bank: 2, group: 'O+', component: 'PRBC', count: 4 },
  { bank: 2, group: 'A+', component: 'PRBC', count: 3 },
  { bank: 2, group: 'B+', component: 'WHOLE_BLOOD', count: 2 },
  { bank: 2, group: 'AB+', component: 'PLASMA', count: 2 },
  { bank: 2, group: 'A-', component: 'PRBC', count: 1 },
  { bank: 2, group: 'B-', component: 'PRBC', count: 1 },
  { bank: 2, group: 'AB+', component: 'WHOLE_BLOOD', count: 1 },
];

const SHELF_LIFE_DAYS = { WHOLE_BLOOD: 35, PRBC: 35, PLATELETS: 5, PLASMA: 365 };

function buildUnits() {
  const units = [];
  for (const spec of BANK_UNITS) {
    for (let i = 0; i < spec.count; i += 1) {
      units.push({ bankIndex: spec.bank, bloodGroup: spec.group, component: spec.component });
    }
  }
  return units;
}

function classifySeedUnit(bankIndex, indexInBank) {
  if (indexInBank === 0) {
    return { expiresInDays: 1, status: 'AVAILABLE', expiryFlag: 'NEAR_EXPIRY' };
  }
  if (bankIndex !== 2 && indexInBank === 1) {
    return { expiresInDays: 2, status: 'AVAILABLE', expiryFlag: 'NEAR_EXPIRY' };
  }
  if ((bankIndex === 0 && indexInBank === 2) || (bankIndex === 2 && indexInBank === 1)) {
    return { expiresInDays: bankIndex === 0 ? -1 : -2, status: 'EXPIRED', expiryFlag: 'EXPIRED' };
  }
  return { expiresInDays: 21 + (indexInBank % 15), status: 'AVAILABLE', expiryFlag: 'OK' };
}

function prepareUnits() {
  const counters = [0, 0, 0];
  const now = Date.now();
  return buildUnits().map((unit) => {
    const indexInBank = counters[unit.bankIndex];
    counters[unit.bankIndex] += 1;
    const classification = classifySeedUnit(unit.bankIndex, indexInBank);
    const expiresAt = new Date(now + classification.expiresInDays * DAY_MS);
    const collectedAt = new Date(expiresAt.getTime() - SHELF_LIFE_DAYS[unit.component] * DAY_MS);
    return { ...unit, ...classification, expiresAt, collectedAt };
  });
}

async function insertInstitutions(client, ids) {
  for (const inst of INSTITUTIONS) {
    const { rows } = await client.query(
      `INSERT INTO institution (name, type, city, lat, lng)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [inst.name, inst.type, inst.city, inst.lat, inst.lng]
    );
    ids.push(rows[0].id);
  }
}

async function insertDonors(client, idsByEmail) {
  for (const donor of DONORS) {
    const { rows } = await client.query(
      `INSERT INTO donor (full_name, email, phone_encrypted, blood_group, date_of_birth,
                          last_donation_date, organ_pledge, city, lat, lng)
       VALUES ($1, $2, pgp_sym_encrypt($3, $4), $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        donor.fullName,
        donor.email,
        donor.phone,
        PII_KEY,
        donor.bloodGroup,
        donor.dob,
        donor.lastDonationDaysAgo === null ? null : new Date(Date.now() - donor.lastDonationDaysAgo * DAY_MS),
        donor.organPledge,
        donor.city,
        donor.lat,
        donor.lng,
      ]
    );
    idsByEmail[donor.email] = rows[0].id;
  }
}

function hash(password) {
  return bcrypt.hashSync(password, 10);
}

async function insertUsers(client, institutionIds, donorIdsByEmail) {
  const institutionIdByName = new Map(
    INSTITUTIONS.map((inst, index) => [inst.name, institutionIds[index]])
  );
  for (const user of USERS) {
    await client.query(
      `INSERT INTO app_user (email, password_hash, role, institution_id, donor_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user.email,
        hash(DEMO_PASSWORD),
        user.role,
        user.institutionName ? institutionIdByName.get(user.institutionName) : null,
        user.donorEmail ? donorIdsByEmail[user.donorEmail] : null,
      ]
    );
  }
}

async function insertUnits(client, institutionIds) {
  const units = prepareUnits();
  for (const unit of units) {
    await client.query(
      `INSERT INTO inventory_unit
         (institution_id, blood_group, component, collected_at, expires_at, status, expiry_flag)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        institutionIds[3 + unit.bankIndex],
        unit.bloodGroup,
        unit.component,
        unit.collectedAt,
        unit.expiresAt,
        unit.status,
        unit.expiryFlag,
      ]
    );
  }
}

// --if-empty (used by docker compose's one-shot migrate container) leaves an already seeded
// database alone, so re-running `docker compose up` (e.g. --scale) does not wipe demo data.
async function alreadySeeded(pool) {
  const { rows } = await pool.query('SELECT EXISTS (SELECT 1 FROM institution) AS seeded');
  return rows[0].seeded;
}

async function seed({ ifEmpty = process.argv.includes('--if-empty') } = {}) {
  const pool = createPool(process.env.DATABASE_URL);
  try {
    if (ifEmpty && (await alreadySeeded(pool))) {
      logger.info('database already seeded; skipping (--if-empty)');
      return;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `TRUNCATE match, notification, request, inventory_unit, app_user, donor, institution
         RESTART IDENTITY CASCADE`
      );
      const institutionIds = [];
      await insertInstitutions(client, institutionIds);
      const donorIdsByEmail = {};
      await insertDonors(client, donorIdsByEmail);
      await insertUsers(client, institutionIds, donorIdsByEmail);
      await insertUnits(client, institutionIds);
      await client.query('COMMIT');
      logger.info('database seeded', {
        institutions: institutionIds.length,
        donors: DONORS.length,
        users: USERS.length,
        units: BANK_UNITS.reduce((sum, spec) => sum + spec.count, 0),
      });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

seed().catch((err) => {
  logger.error('seed failed', { error: err.message, stack: err.stack });
  process.exit(1);
});
