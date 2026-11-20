const request = require('supertest');
const { closePool, getPool } = require('@lifelink/shared/db');
const app = require('../src/app');
const { DAY_MS, useTestBackends, resetDb, insertInstitution, insertUnit, insertRequest } = require('./fixtures');

let redis;
let bankA;
let bankB;
let hospitalId;

const asBank = (institutionId) => ({ 'x-user-role': 'BLOODBANK_STAFF', 'x-institution-id': institutionId });
const asAdmin = { 'x-user-role': 'ADMIN' };

beforeAll(() => {
  redis = useTestBackends();
});

beforeEach(async () => {
  await redis.flushall();
  await resetDb();
  bankA = await insertInstitution('Bank A', 'BLOOD_BANK');
  bankB = await insertInstitution('Bank B', 'BLOOD_BANK');
  hospitalId = await insertInstitution('Hospital', 'HOSPITAL');
});

afterAll(closePool);

describe('inventory allocation', () => {
  test('TC-09: two concurrent allocations of the same unit give exactly one 200 and one 409', async () => {
    const unitId = await insertUnit(bankA);
    const [first, second] = [await insertRequest(hospitalId), await insertRequest(hospitalId)];

    const responses = await Promise.all([
      request(app).post(`/api/inventory/${unitId}/allocate`).set(asAdmin).send({ requestId: first }),
      request(app).post(`/api/inventory/${unitId}/allocate`).set(asAdmin).send({ requestId: second }),
    ]);

    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(responses.find((r) => r.status === 409).body).toEqual({ error: 'Unit not available' });
    const { rows } = await getPool().query('SELECT count(*)::int AS n FROM match WHERE unit_id = $1', [unitId]);
    expect(rows[0].n).toBe(1);
  });

  test('allocation publishes inventory.updated and lowers the cached count', async () => {
    const unitId = await insertUnit(bankA);
    const requestId = await insertRequest(hospitalId);
    const res = await request(app).post(`/api/inventory/${unitId}/allocate`).set(asBank(bankA)).send({ requestId });
    expect(res.status).toBe(200);
    expect(await redis.get(`avail:${bankA}:O-:PRBC`)).toBe('0');
    expect(await redis.xlen('inventory.updated')).toBe(1);
  });

  test('blood bank staff cannot allocate another bank\'s unit', async () => {
    const unitId = await insertUnit(bankB);
    const requestId = await insertRequest(hospitalId);
    const res = await request(app).post(`/api/inventory/${unitId}/allocate`).set(asBank(bankA)).send({ requestId });
    expect(res.status).toBe(404);
  });

  test('an unknown request id returns 404 and leaves the unit available', async () => {
    const unitId = await insertUnit(bankA);
    const res = await request(app)
      .post(`/api/inventory/${unitId}/allocate`).set(asAdmin)
      .send({ requestId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(404);
    const { rows } = await getPool().query('SELECT status FROM inventory_unit WHERE id = $1', [unitId]);
    expect(rows[0].status).toBe('AVAILABLE');
  });
});

describe('inventory CRUD', () => {
  test('POST /api/inventory adds a unit for the caller\'s bank and publishes inventory.updated', async () => {
    const collectedAt = new Date(Date.now() - DAY_MS).toISOString();
    const expiresAt = new Date(Date.now() + 30 * DAY_MS).toISOString();
    const res = await request(app).post('/api/inventory').set(asBank(bankA))
      .send({ bloodGroup: 'O-', component: 'PRBC', collectedAt, expiresAt });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ institution_id: bankA, status: 'AVAILABLE' });
    expect(await redis.get(`avail:${bankA}:O-:PRBC`)).toBe('1');
    const [[, fields]] = await redis.xrange('inventory.updated', '-', '+');
    expect(JSON.parse(fields[1])).toEqual({ institutionId: bankA, bloodGroup: 'O-', component: 'PRBC' });
  });

  test('POST /api/inventory rejects an expiry before collection with 400', async () => {
    const res = await request(app).post('/api/inventory').set(asBank(bankA)).send({
      bloodGroup: 'O-', component: 'PRBC', collectedAt: '2026-01-10', expiresAt: '2026-01-01',
    });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('expiresAt');
  });

  test('GET /api/inventory: bank staff see only their own units, admin sees all', async () => {
    await insertUnit(bankA);
    await insertUnit(bankB);
    const own = await request(app).get('/api/inventory?institutionId=' + bankB).set(asBank(bankA));
    expect(own.body.map((u) => u.institution_id)).toEqual([bankA]);
    const all = await request(app).get('/api/inventory?bloodGroup=O-').set(asAdmin);
    expect(all.body).toHaveLength(2);
  });

  test('GET /api/inventory/expiring lists NEAR_EXPIRY units', async () => {
    await insertUnit(bankA, { expiresInDays: 2, flag: 'NEAR_EXPIRY' });
    await insertUnit(bankA);
    const res = await request(app).get('/api/inventory/expiring').set(asBank(bankA));
    expect(res.body).toHaveLength(1);
    expect(res.body[0].expiry_flag).toBe('NEAR_EXPIRY');
  });

  test('PATCH /api/inventory/:id discards a unit; an allocated unit cannot be changed', async () => {
    const unitId = await insertUnit(bankA);
    const discarded = await request(app).patch(`/api/inventory/${unitId}`).set(asBank(bankA)).send({ status: 'EXPIRED' });
    expect(discarded.status).toBe(200);
    expect(discarded.body.status).toBe('EXPIRED');

    const allocatedId = await insertUnit(bankA, { status: 'ALLOCATED' });
    const res = await request(app).patch(`/api/inventory/${allocatedId}`).set(asBank(bankA)).send({ status: 'AVAILABLE' });
    expect(res.status).toBe(409);
  });

  test('a malformed unit id returns 400', async () => {
    const res = await request(app).patch('/api/inventory/not-a-uuid').set(asBank(bankA)).send({ status: 'EXPIRED' });
    expect(res.status).toBe(400);
  });
});
