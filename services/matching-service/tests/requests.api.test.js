const request = require('supertest');
const { closePool, getPool } = require('@lifelink/shared/db');
const app = require('../src/app');
const { matchRequest } = require('../src/engine/allocator');
const { compatibleRecipientGroups } = require('../src/engine/compatibility');
const escalation = require('../src/engine/escalation');
const requestModel = require('../src/models/requestModel');
const { useTestBackends, resetDb, insertInstitution, insertUnit, streamPayloads } = require('./fixtures');

let redis;
let hospitalId;
let otherHospitalId;
let hebbal;
let koramangala;

const asHospital = (id = hospitalId) => ({ 'x-user-role': 'HOSPITAL_STAFF', 'x-institution-id': id });
const asAdmin = { 'x-user-role': 'ADMIN' };

function raise(body, headers = asHospital()) {
  return request(app).post('/api/requests').set(headers).send({ component: 'PRBC', ...body });
}

async function matchCount(requestId) {
  const { rows } = await getPool().query('SELECT count(*)::int AS n FROM match WHERE request_id = $1', [requestId]);
  return rows[0].n;
}

beforeAll(() => {
  redis = useTestBackends();
});

beforeEach(async () => {
  await redis.flushall();
  await resetDb();
  hospitalId = await insertInstitution('Yelahanka General Hospital', 'HOSPITAL', 13.1007, 77.5963);
  otherHospitalId = await insertInstitution('Jayanagar City Hospital', 'HOSPITAL', 12.925, 77.5938);
  hebbal = await insertInstitution('Hebbal Blood Centre', 'BLOOD_BANK', 13.0358, 77.597);
  koramangala = await insertInstitution('Koramangala Blood Bank', 'BLOOD_BANK', 12.9352, 77.6245);
});

afterAll(closePool);

describe('POST /api/requests and matching', () => {
  test('TC-08: Emergency 2 x O- with stock seeded -> 201, a match row per unit, matchMs < 30000', async () => {
    const units = [await insertUnit(hebbal, 'O-'), await insertUnit(koramangala, 'O-')];
    const res = await raise({ bloodGroup: 'O-', quantity: 2, urgency: 'EMERGENCY' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('MATCHED');
    expect(res.body.matches).toHaveLength(2);
    expect(res.body.matchMs).toBeLessThan(30000);
    for (const unitId of units) {
      const { rows } = await getPool().query('SELECT request_id FROM match WHERE unit_id = $1', [unitId]);
      expect(rows).toEqual([{ request_id: res.body.id }]);
    }
    expect(await streamPayloads(redis, 'request.created')).toHaveLength(1);
    const [matched] = await streamPayloads(redis, 'match.created');
    expect(matched).toMatchObject({ requestId: res.body.id, hospitalId, status: 'MATCHED', bloodGroup: 'O-' });
  });

  test('the nearest bank is used first and its distance is recorded', async () => {
    await insertUnit(koramangala, 'O+');
    await insertUnit(hebbal, 'O+');
    const res = await raise({ bloodGroup: 'O+', quantity: 1, urgency: 'URGENT' });
    expect(res.body.matches).toEqual([
      expect.objectContaining({ institutionId: hebbal, distanceKm: expect.closeTo(7.22, 1) }),
    ]);
  });

  test('demo step 3: 3 x O- with 2 in stock escalates, then new stock completes it', async () => {
    await insertUnit(hebbal, 'O-');
    await insertUnit(koramangala, 'O-');
    const res = await raise({ bloodGroup: 'O-', quantity: 3, urgency: 'EMERGENCY' });
    expect(res.body).toMatchObject({ status: 'ESCALATED' });
    expect(res.body.matches).toHaveLength(2);
    expect(await streamPayloads(redis, 'request.escalated')).toEqual([
      { requestId: res.body.id, bloodGroup: 'O-', component: 'PRBC', urgency: 'EMERGENCY' },
    ]);

    await insertUnit(hebbal, 'O-');
    // What the inventory.updated consumer does when a bank adds an O- unit.
    await escalation.retryOpenRequests(matchRequest, {
      bloodGroups: compatibleRecipientGroups('O-'),
      component: 'PRBC',
    });

    const detail = await request(app).get(`/api/requests/${res.body.id}`).set(asHospital());
    expect(detail.body.status).toBe('MATCHED');
    expect(detail.body.matches).toHaveLength(3);
    expect(detail.body.matchMs).toBeGreaterThan(0);
  });

  test('a ROUTINE request without stock stays PENDING and is not escalated', async () => {
    const res = await raise({ bloodGroup: 'AB-', quantity: 1, urgency: 'ROUTINE' });
    expect(res.body.status).toBe('PENDING');
    expect(await redis.xlen('request.escalated')).toBe(0);
  });

  test('a stale cache hint falls back to the database', async () => {
    await redis.set(`avail:${koramangala}:B+:PRBC`, 3); // claims stock that is not there
    await insertUnit(hebbal, 'B+');
    const res = await raise({ bloodGroup: 'B+', quantity: 1, urgency: 'ROUTINE' });
    expect(res.body.status).toBe('MATCHED');
    expect(res.body.matches[0].institutionId).toBe(hebbal);
  });

  test('concurrent matchers never over-fill a request', async () => {
    await insertUnit(hebbal, 'A+');
    await insertUnit(hebbal, 'A+');
    const created = await requestModel.insertRequest({
      hospitalId, bloodGroup: 'A+', component: 'PRBC', quantity: 1, urgency: 'URGENT',
    });
    await Promise.all([matchRequest(created.id), matchRequest(created.id), matchRequest(created.id)]);
    expect(await matchCount(created.id)).toBe(1);
  });

  test('an invalid body returns 400 with the offending field', async () => {
    const res = await raise({ bloodGroup: 'O-', quantity: 11, urgency: 'EMERGENCY' });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('quantity');
  });
});

describe('GET /api/requests', () => {
  test('hospital staff see only their own requests; admin sees all', async () => {
    const mine = await raise({ bloodGroup: 'O-', quantity: 1, urgency: 'ROUTINE' });
    await raise({ bloodGroup: 'A+', quantity: 1, urgency: 'ROUTINE' }, asHospital(otherHospitalId));

    const own = await request(app).get('/api/requests').set(asHospital());
    expect(own.body.map((r) => r.id)).toEqual([mine.body.id]);
    expect((await request(app).get('/api/requests').set(asAdmin)).body).toHaveLength(2);

    const foreign = await request(app).get(`/api/requests/${mine.body.id}`).set(asHospital(otherHospitalId));
    expect(foreign.status).toBe(404);
  });
});

describe('admin stats and escalation alerts', () => {
  test('GET /api/admin/stats reports stock, statuses, fulfilment, wastage and match time', async () => {
    await insertUnit(hebbal, 'O+');
    await insertUnit(hebbal, 'O+');
    await insertUnit(hebbal, 'A+', { expiresInDays: -1 });
    await getPool().query(`UPDATE inventory_unit SET status = 'EXPIRED' WHERE blood_group = 'A+'`);
    await raise({ bloodGroup: 'O+', quantity: 1, urgency: 'URGENT' });
    await raise({ bloodGroup: 'AB-', quantity: 1, urgency: 'ROUTINE' });

    const res = await request(app).get('/api/admin/stats').set(asAdmin);
    expect(res.body).toMatchObject({
      availableUnits: 1,
      availableByGroup: { 'O+': 1 },
      requestsByStatus: { MATCHED: 1, PENDING: 1 },
      totalRequests: 2,
      fulfilmentRate: 0.5,
      expiredUnits: 1,
    });
    expect(res.body.avgMatchMs).toBeGreaterThanOrEqual(0);
  });

  test('requests escalated longer than the alert window alert the admins exactly once', async () => {
    const res = await raise({ bloodGroup: 'O-', quantity: 1, urgency: 'EMERGENCY' });
    await getPool().query(`UPDATE request SET escalated_at = now() - interval '5 minutes' WHERE id = $1`, [res.body.id]);

    expect(await escalation.alertStaleEscalations(2)).toBe(1);
    expect(await escalation.alertStaleEscalations(2)).toBe(0);
    const events = await streamPayloads(redis, 'request.escalated');
    expect(events.filter((e) => e.alert)).toEqual([
      expect.objectContaining({ requestId: res.body.id, alert: true }),
    ]);
  });
});
