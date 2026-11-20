const { closePool, getPool } = require('@lifelink/shared/db');
const { classify, run } = require('../src/jobs/expiryMonitor');
const cache = require('../src/models/availabilityCache');
const { DAY_MS, useTestBackends, resetDb, insertInstitution, insertUnit } = require('./fixtures');

let redis;
let bankId;

beforeAll(async () => {
  redis = useTestBackends();
  await resetDb();
  bankId = await insertInstitution('Test Bank', 'BLOOD_BANK');
});

afterAll(closePool);

describe('TC-04: expiry monitor', () => {
  const now = new Date('2026-06-01T12:00:00Z');
  const expiresIn = (days) => ({ expires_at: new Date(now.getTime() + days * DAY_MS) });

  test('TC-04: classify() for a unit expiring in 2 days returns NEAR_EXPIRY', () => {
    expect(classify(expiresIn(2), now)).toBe('NEAR_EXPIRY');
  });

  test('TC-04: classify() for a unit that expired 1 day ago returns EXPIRED', () => {
    expect(classify(expiresIn(-1), now)).toBe('EXPIRED');
  });

  test('classify() boundaries: exactly 3 days is NEAR_EXPIRY, just over is OK', () => {
    expect(classify(expiresIn(3), now)).toBe('NEAR_EXPIRY');
    expect(classify({ expires_at: new Date(now.getTime() + 3 * DAY_MS + 1) }, now)).toBe('OK');
  });

  test('TC-04: an EXPIRED unit is excluded from availability', async () => {
    await insertUnit(bankId, { expiresInDays: 20 });
    // Past its expiry date but not yet swept by the monitor: still must not count.
    await insertUnit(bankId, { expiresInDays: -1 });
    const key = { institutionId: bankId, bloodGroup: 'O-', component: 'PRBC' };
    expect(await cache.refreshKey(key)).toBe(1);
    expect(await redis.get(cache.cacheKey(bankId, 'O-', 'PRBC'))).toBe('1');
  });

  test('run() marks expired units EXPIRED, flags near-expiry ones and publishes unit.expiring once', async () => {
    await insertUnit(bankId, { expiresInDays: 2 });
    await run();

    const { rows } = await getPool().query(
      'SELECT status, expiry_flag FROM inventory_unit ORDER BY expires_at'
    );
    expect(rows.map((r) => `${r.status}/${r.expiry_flag}`)).toEqual([
      'EXPIRED/EXPIRED',
      'AVAILABLE/NEAR_EXPIRY',
      'AVAILABLE/OK',
    ]);
    const events = await redis.xrange('unit.expiring', '-', '+');
    expect(events.map(([, fields]) => JSON.parse(fields[1]).flag).sort()).toEqual(['EXPIRED', 'NEAR_EXPIRY']);

    await run();
    expect(await redis.xlen('unit.expiring')).toBe(2);
  });

  test('rebuildAll() recreates every availability key from the database', async () => {
    await redis.set('avail:stale:O-:PRBC', 9);
    await cache.rebuildAll();
    expect(await redis.get('avail:stale:O-:PRBC')).toBeNull();
    expect(await redis.get(cache.cacheKey(bankId, 'O-', 'PRBC'))).toBe('2');
  });
});
