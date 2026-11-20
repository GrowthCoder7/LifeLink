const { isCompatible, compatibleDonorGroups, compatibleRecipientGroups } = require('../src/engine/compatibility');
const { rankRequests } = require('../src/engine/ranking');
const { haversineKm, scoreCandidates } = require('../src/engine/scoring');

describe('compatibility', () => {
  test('TC-02: isCompatible("O-","AB+") is true and isCompatible("A+","O-") is false', () => {
    expect(isCompatible('O-', 'AB+')).toBe(true);
    expect(isCompatible('A+', 'O-')).toBe(false);
  });

  test('compatibleDonorGroups follows the red-cell table', () => {
    expect(compatibleDonorGroups('O-')).toEqual(['O-']);
    expect(compatibleDonorGroups('AB-')).toEqual(['O-', 'A-', 'B-', 'AB-']);
    expect(compatibleDonorGroups('AB+')).toHaveLength(8);
    expect(compatibleDonorGroups('C+')).toEqual([]);
  });

  test('compatibleRecipientGroups is the inverse lookup', () => {
    expect(compatibleRecipientGroups('O-')).toHaveLength(8);
    expect(compatibleRecipientGroups('AB+')).toEqual(['AB+']);
  });
});

describe('ranking', () => {
  test('TC-03: a Routine created earlier and an Emergency created later -> Emergency first', () => {
    const routine = { id: 'routine', urgency: 'ROUTINE', created_at: '2026-06-01T09:00:00Z' };
    const emergency = { id: 'emergency', urgency: 'EMERGENCY', created_at: '2026-06-01T10:00:00Z' };
    const input = [routine, emergency];
    expect(rankRequests(input).map((r) => r.id)).toEqual(['emergency', 'routine']);
    expect(input.map((r) => r.id)).toEqual(['routine', 'emergency']);
  });

  test('same urgency is ordered oldest first, URGENT between EMERGENCY and ROUTINE', () => {
    const ranked = rankRequests([
      { id: 'r', urgency: 'ROUTINE', created_at: '2026-06-01T08:00:00Z' },
      { id: 'u2', urgency: 'URGENT', created_at: '2026-06-01T10:00:00Z' },
      { id: 'u1', urgency: 'URGENT', created_at: '2026-06-01T09:00:00Z' },
      { id: 'e', urgency: 'EMERGENCY', created_at: '2026-06-01T11:00:00Z' },
    ]);
    expect(ranked.map((r) => r.id)).toEqual(['e', 'u1', 'u2', 'r']);
  });
});

describe('scoring', () => {
  const yelahanka = { lat: 13.1007, lng: 77.5963 };
  const hebbal = { lat: 13.0358, lng: 77.597 };
  const koramangala = { lat: 12.9352, lng: 77.6245 };

  test('haversineKm gives the Yelahanka-Hebbal distance (~7.2 km) and 0 for the same point', () => {
    expect(haversineKm(yelahanka, hebbal)).toBeCloseTo(7.22, 1);
    expect(haversineKm(hebbal, hebbal)).toBe(0);
  });

  test('scoreCandidates orders exact group, then distance, then soonest expiry', () => {
    const candidates = [
      { id: 'far-exact', blood_group: 'O+', expires_at: '2026-07-01', ...koramangala },
      { id: 'near-universal', blood_group: 'O-', expires_at: '2026-06-05', ...hebbal },
      { id: 'near-exact-late', blood_group: 'O+', expires_at: '2026-07-10', ...hebbal },
      { id: 'near-exact-soon', blood_group: 'O+', expires_at: '2026-06-10', ...hebbal },
    ];
    const scored = scoreCandidates(candidates, yelahanka, 'O+');
    expect(scored.map((c) => c.id)).toEqual(['near-exact-soon', 'near-exact-late', 'far-exact', 'near-universal']);
    expect(scored[0].distanceKm).toBeCloseTo(7.22, 1);
    expect(candidates[0]).not.toHaveProperty('distanceKm');
  });
});
