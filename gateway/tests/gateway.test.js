const http = require('http');
const express = require('express');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createPool, setPool, getPool, closePool } = require('@lifelink/shared/db');
const { TEST_DB_URL } = require('../../db/testSetup');

const PASSWORD = 'Demo@1234';
const STAFF_EMAIL = 'hospital.test@lifelink.dev';

// A stub "inventory-service" that echoes the identity headers the gateway forwarded.
let stub;
let app;
let institutionId;

beforeAll(async () => {
  const stubApp = express();
  stubApp.all('*', (req, res) => res.json({
    path: req.originalUrl,
    userId: req.get('x-user-id') || null,
    role: req.get('x-user-role') || null,
    institutionId: req.get('x-institution-id') || null,
  }));
  stub = http.createServer(stubApp).listen(0);
  process.env.JWT_SECRET = 'test-secret';
  process.env.INVENTORY_SERVICE_URL = `http://127.0.0.1:${stub.address().port}`;
  app = require('../src/app');

  setPool(createPool(TEST_DB_URL));
  await getPool().query('TRUNCATE app_user, donor, institution CASCADE');
  const { rows } = await getPool().query(
    `INSERT INTO institution (name, type, city, lat, lng)
     VALUES ('Test Hospital', 'HOSPITAL', 'Bengaluru', 13.1, 77.6) RETURNING id`
  );
  institutionId = rows[0].id;
  await getPool().query(
    `INSERT INTO app_user (email, password_hash, role, institution_id)
     VALUES ($1, $2, 'HOSPITAL_STAFF', $3)`,
    [STAFF_EMAIL, await bcrypt.hash(PASSWORD, 4), institutionId]
  );
});

afterAll(async () => {
  stub.close();
  await closePool();
});

function tokenFor(role, extra = {}) {
  return jwt.sign({ role, ...extra }, 'test-secret', { subject: 'user-1', expiresIn: '1h' });
}

describe('gateway auth', () => {
  test('TC-05: POST /api/auth/login with valid hospital-staff credentials returns 200 and a HOSPITAL_STAFF JWT', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: STAFF_EMAIL, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: STAFF_EMAIL, role: 'HOSPITAL_STAFF', institutionId });
    const payload = jwt.verify(res.body.token, 'test-secret');
    expect(payload.role).toBe('HOSPITAL_STAFF');
  });

  test('login with a wrong password returns 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: STAFF_EMAIL, password: 'wrong-pass' });
    expect(res.status).toBe(401);
  });

  test('login with an unknown email returns 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nobody@lifelink.dev', password: PASSWORD });
    expect(res.status).toBe(401);
  });

  test('TC-07: GET /api/inventory without Authorization header returns 401 from the gateway', async () => {
    const res = await request(app).get('/api/inventory');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  test('an invalid token returns 401', async () => {
    const res = await request(app).get('/api/inventory').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });

  test('GET /api/health is public', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('gateway RBAC and proxy', () => {
  test('a role outside the route table gets 403', async () => {
    const res = await request(app).post('/api/inventory').set('Authorization', `Bearer ${tokenFor('DONOR')}`);
    expect(res.status).toBe(403);
  });

  test('an unlisted route is denied by default', async () => {
    const res = await request(app).delete('/api/inventory/x').set('Authorization', `Bearer ${tokenFor('ADMIN')}`);
    expect(res.status).toBe(403);
  });

  test('forwards the verified identity and drops spoofed identity headers', async () => {
    const res = await request(app)
      .get('/api/inventory?status=AVAILABLE')
      .set('Authorization', `Bearer ${tokenFor('HOSPITAL_STAFF', { institutionId: 'inst-1' })}`)
      .set('x-user-role', 'ADMIN');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      path: '/api/inventory?status=AVAILABLE',
      userId: 'user-1',
      role: 'HOSPITAL_STAFF',
      institutionId: 'inst-1',
    });
  });
});
