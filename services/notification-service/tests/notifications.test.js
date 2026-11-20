const http = require('http');
const request = require('supertest');
const { createPool, setPool, getPool, closePool } = require('@lifelink/shared/db');
const { TEST_DB_URL } = require('../../../db/testSetup');
const app = require('../src/app');
const handlers = require('../src/consumers/handlers');
const { getSmsProvider } = require('../src/providers/smsProvider');

let donorStub;
let donorStubStatus = 200;
const ids = {};
const users = {};

async function insert(sql, params) {
  return (await getPool().query(`${sql} RETURNING id`, params)).rows[0].id;
}

async function seedPeople() {
  await getPool().query('TRUNCATE notification, app_user, donor, institution CASCADE');
  const inst = (name, type) => insert(
    `INSERT INTO institution (name, type, city, lat, lng) VALUES ($1, $2, 'Bengaluru', 13, 77.6)`, [name, type]
  );
  ids.hospital = await inst('Yelahanka General Hospital', 'HOSPITAL');
  ids.bankA = await inst('Hebbal Blood Centre', 'BLOOD_BANK');
  ids.bankB = await inst('Koramangala Blood Bank', 'BLOOD_BANK');
  ids.donor = await insert(
    `INSERT INTO donor (full_name, email, blood_group, date_of_birth) VALUES ('Priya', 'priya@x.dev', 'O-', '1996-04-12')`
  );
  const user = (email, role, institutionId = null, donorId = null) => insert(
    `INSERT INTO app_user (email, password_hash, role, institution_id, donor_id) VALUES ($1, 'x', $2, $3, $4)`,
    [email, role, institutionId, donorId]
  );
  users.hospital = { userId: await user('h@x.dev', 'HOSPITAL_STAFF', ids.hospital), role: 'HOSPITAL_STAFF', institutionId: ids.hospital };
  users.bankA = { userId: await user('a@x.dev', 'BLOODBANK_STAFF', ids.bankA), role: 'BLOODBANK_STAFF', institutionId: ids.bankA };
  users.bankB = { userId: await user('b@x.dev', 'BLOODBANK_STAFF', ids.bankB), role: 'BLOODBANK_STAFF', institutionId: ids.bankB };
  users.admin = { userId: await user('admin@x.dev', 'ADMIN'), role: 'ADMIN' };
  users.donor = { userId: await user('priya@x.dev', 'DONOR', null, ids.donor), role: 'DONOR' };
}

function headersFor(who) {
  const headers = { 'x-user-id': who.userId, 'x-user-role': who.role };
  return who.institutionId ? { ...headers, 'x-institution-id': who.institutionId } : headers;
}

async function inbox(who) {
  const res = await request(app).get('/api/notifications').set(headersFor(who));
  expect(res.status).toBe(200);
  return res.body;
}

beforeAll(async () => {
  // Stub donor-service: every requested group returns our one eligible donor.
  donorStub = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://stub');
    res.writeHead(donorStubStatus, { 'Content-Type': 'application/json' });
    const ok = url.searchParams.get('eligible') === 'true' && url.searchParams.get('bloodGroup') === 'O-';
    res.end(JSON.stringify(ok ? [{ id: ids.donor }] : []));
  }).listen(0);
  process.env.DONOR_SERVICE_URL = `http://127.0.0.1:${donorStub.address().port}`;
  setPool(createPool(TEST_DB_URL));
});

beforeEach(async () => {
  donorStubStatus = 200;
  await seedPeople();
});

afterAll(async () => {
  donorStub.close();
  await closePool();
});

describe('notification consumers', () => {
  test('match.created notifies the hospital with the match time and each supplying bank', async () => {
    await handlers.onMatchCreated({
      requestId: 'r1', hospitalId: ids.hospital, bloodGroup: 'O-', component: 'PRBC', status: 'MATCHED', matchMs: 1400,
      matches: [{ unitId: 'u1', institutionId: ids.bankA, distanceKm: 7.2 }, { unitId: 'u2', institutionId: ids.bankA, distanceKm: 7.2 }],
    });
    expect((await inbox(users.hospital))[0].body).toBe('2 units of O- allocated, matched in 1.4 s.');
    expect((await inbox(users.bankA))[0].body).toBe('2 units of O- allocated to Yelahanka General Hospital.');
    expect(await inbox(users.bankB)).toEqual([]);
  });

  test('request.escalated reaches every blood bank and eligible compatible donors in-app and by SMS', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    await handlers.onRequestEscalated({ requestId: 'r1', bloodGroup: 'O-', component: 'PRBC', urgency: 'EMERGENCY', donorGroups: ['O-'] });

    expect((await inbox(users.bankA))[0].title).toBe('Emergency request escalated');
    expect((await inbox(users.bankB))[0].title).toBe('Emergency request escalated');
    expect((await inbox(users.donor)).map((n) => n.channel).sort()).toEqual(['IN_APP', 'SMS']);
    expect(await inbox(users.hospital)).toEqual([]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining(`[SMS] to=user:${users.donor.userId} body=Urgent`));
    log.mockRestore();
  });

  test('when donor-service is down the event fails and nothing is stored (so it is retried)', async () => {
    donorStubStatus = 503;
    await expect(handlers.onRequestEscalated({ requestId: 'r1', bloodGroup: 'O-', component: 'PRBC', urgency: 'EMERGENCY', donorGroups: ['O-'] }))
      .rejects.toThrow('donor-service responded 503');
    expect(await inbox(users.bankA)).toEqual([]);
  });

  test('the escalation alert goes to admins only', async () => {
    await handlers.onRequestEscalated({ requestId: 'r1', bloodGroup: 'O-', component: 'PRBC', urgency: 'EMERGENCY', alert: true, escalatedMinutes: 2 });
    expect((await inbox(users.admin))[0].body).toMatch(/escalated for over 2 min/);
    expect(await inbox(users.bankA)).toEqual([]);
  });

  test('unit.expiring notifies only the owning bank; request.created notifies the hospital', async () => {
    await handlers.onUnitExpiring({ unitId: 'abcdef12-3456', institutionId: ids.bankB, bloodGroup: 'A+', flag: 'NEAR_EXPIRY' });
    await handlers.onRequestCreated({ requestId: 'r1', hospitalId: ids.hospital, bloodGroup: 'O-', component: 'PRBC', quantity: 3, urgency: 'EMERGENCY' });
    expect((await inbox(users.bankB))[0].body).toBe('A+ unit abcdef12 expires within 3 days.');
    expect(await inbox(users.bankA)).toEqual([]);
    expect((await inbox(users.hospital))[0].title).toBe('EMERGENCY request raised');
  });
});

describe('notification API', () => {
  test('lists newest first and marks a notification read', async () => {
    await handlers.onUnitExpiring({ unitId: 'first000', institutionId: ids.bankA, bloodGroup: 'A+', flag: 'NEAR_EXPIRY' });
    await handlers.onUnitExpiring({ unitId: 'second00', institutionId: ids.bankA, bloodGroup: 'A+', flag: 'EXPIRED' });
    const [newest, older] = await inbox(users.bankA);
    expect(newest.title).toBe('Unit expired');
    expect(older.title).toBe('Unit near expiry');

    const res = await request(app).patch(`/api/notifications/${newest.id}/read`).set(headersFor(users.bankA));
    expect(res.status).toBe(200);
    expect(res.body.read_at).not.toBeNull();
  });

  test('cannot mark another user\'s notification; bad ids and missing identity are rejected', async () => {
    await handlers.onUnitExpiring({ unitId: 'aaaa0000', institutionId: ids.bankA, bloodGroup: 'A+', flag: 'EXPIRED' });
    const [note] = await inbox(users.bankA);
    expect((await request(app).patch(`/api/notifications/${note.id}/read`).set(headersFor(users.bankB))).status).toBe(404);
    expect((await request(app).patch('/api/notifications/nope/read').set(headersFor(users.bankA))).status).toBe(400);
    expect((await request(app).get('/api/notifications')).status).toBe(401);
  });

  test('an unsupported SMS provider is rejected', () => {
    expect(() => getSmsProvider('twilio')).toThrow('Unsupported SMS_PROVIDER');
    expect(typeof getSmsProvider('console').send).toBe('function');
  });
});
