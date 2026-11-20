const request = require('supertest');
const { createPool, setPool, getPool, closePool } = require('@lifelink/shared/db');
const { TEST_DB_URL } = require('../../../db/testSetup');
const app = require('../src/app');

const donor = {
  full_name: 'Test Donor',
  email: 'test.donor@example.com',
  password: 'Demo@1234',
  phone: '+91-9000000001',
  blood_group: 'A+',
  date_of_birth: '1990-05-20',
  organ_pledge: true,
};

beforeAll(async () => {
  process.env.PII_KEY = 'test-pii-key';
  setPool(createPool(TEST_DB_URL));
  await getPool().query('TRUNCATE app_user, donor, institution CASCADE');
});

afterAll(closePool);

describe('donor-service API', () => {
  test('TC-06: POST /api/donors without blood_group returns 400 with a field-level error', async () => {
    const withoutGroup = { ...donor };
    delete withoutGroup.blood_group;
    const res = await request(app).post('/api/donors').send(withoutGroup);
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('blood_group');
    expect(res.body.error).toMatch(/blood_group/);
  });

  test('POST /api/donors creates a donor, an encrypted phone and a DONOR login', async () => {
    const res = await request(app).post('/api/donors').send(donor);
    expect(res.status).toBe(201);
    const { rows } = await getPool().query(
      `SELECT d.phone_encrypted, u.role, u.donor_id
       FROM donor d JOIN app_user u ON u.donor_id = d.id WHERE d.id = $1`,
      [res.body.id]
    );
    expect(rows[0].role).toBe('DONOR');
    expect(rows[0].phone_encrypted.toString()).not.toContain('9000000001');
  });

  test('a duplicate email returns 409', async () => {
    const res = await request(app).post('/api/donors').send(donor);
    expect(res.status).toBe(409);
  });

  test('GET /api/donors/me returns the decrypted phone and eligibility', async () => {
    const { rows } = await getPool().query('SELECT id FROM donor WHERE email = $1', [donor.email]);
    const res = await request(app).get('/api/donors/me').set('x-donor-id', rows[0].id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ phone: donor.phone, blood_group: 'A+', organ_pledge: true, eligible: true });
    expect(res.body.nextEligibleDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('GET /api/donors/me without a donor identity returns 403', async () => {
    expect((await request(app).get('/api/donors/me')).status).toBe(403);
  });

  test('GET /api/donors lists donors without phone numbers', async () => {
    const res = await request(app).get('/api/donors?bloodGroup=A%2B&eligible=true');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).not.toHaveProperty('phone');
    expect(res.body[0]).not.toHaveProperty('phone_encrypted');
  });

  test('GET /api/donors rejects an unknown blood group', async () => {
    expect((await request(app).get('/api/donors?bloodGroup=C%2B')).status).toBe(400);
  });
});
