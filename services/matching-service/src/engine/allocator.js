const { getPool } = require('@lifelink/shared/db');
const { getRedis } = require('@lifelink/shared/redis');
const { publish } = require('@lifelink/shared/events');
const { allocateUnit } = require('@lifelink/shared/allocate');
const requestModel = require('../models/requestModel');
const { compatibleDonorGroups } = require('./compatibility');
const { scoreCandidates } = require('./scoring');
const { escalateIfNeeded } = require('./escalation');

const DONE_STATUSES = ['MATCHED', 'CANCELLED'];

// Institutions the availability cache says hold stock. The cache is only a hint:
// null (no hint) makes the candidate query search every institution in the database.
async function institutionsWithStock(bloodGroups, component) {
  const redis = getRedis();
  const ids = new Set();
  for (const group of bloodGroups) {
    // shortcut: KEYS per group is fine for demo-sized Redis; use SCAN or a set index if it grows.
    const keys = await redis.keys(`avail:*:${group}:${component}`);
    const counts = keys.length ? await redis.mget(...keys) : [];
    keys.forEach((key, i) => {
      if (Number(counts[i]) > 0) { // eslint-disable-line security/detect-object-injection
        ids.add(key.split(':')[1]);
      }
    });
  }
  return ids.size ? [...ids] : null;
}

async function loadCandidates(request, needed) {
  const bloodGroups = compatibleDonorGroups(request.blood_group);
  const hinted = await institutionsWithStock(bloodGroups, request.component);
  let units = await requestModel.findCandidateUnits({
    bloodGroups, component: request.component, institutionIds: hinted,
  });
  if (units.length < needed && hinted) {
    // Hint may be stale: fall back to the database, which is the source of truth.
    units = await requestModel.findCandidateUnits({ bloodGroups, component: request.component, institutionIds: null });
  }
  return scoreCandidates(units, { lat: request.lat, lng: request.lng }, request.blood_group);
}

async function allocateNeeded(request, needed) {
  const allocated = [];
  for (const unit of await loadCandidates(request, needed)) {
    if (allocated.length >= needed) {
      break;
    }
    const { ok } = await allocateUnit(getPool(), unit.id, request.id, unit.distanceKm);
    if (ok) {
      allocated.push(unit);
    }
  }
  return allocated;
}

async function updateStatus(request, matchedTotal) {
  if (matchedTotal >= request.quantity) {
    const row = await requestModel.markMatched(request.id);
    return { status: 'MATCHED', matchMs: new Date(row.matched_at) - new Date(row.created_at) };
  }
  if (matchedTotal > 0) {
    await requestModel.markPartial(request.id);
  }
  const status = request.status === 'PENDING' && matchedTotal > 0 ? 'PARTIAL' : request.status;
  return { status, matchMs: Date.now() - new Date(request.created_at).getTime() };
}

async function publishAllocations(request, allocated, outcome) {
  const touched = new Map();
  for (const unit of allocated) {
    const key = { institutionId: unit.institution_id, bloodGroup: unit.blood_group, component: unit.component };
    touched.set(Object.values(key).join(':'), key);
  }
  for (const key of touched.values()) {
    await publish('inventory.updated', key);
  }
  await publish('match.created', {
    requestId: request.id,
    hospitalId: request.hospital_id,
    bloodGroup: request.blood_group,
    component: request.component,
    matches: allocated.map((u) => ({ unitId: u.id, institutionId: u.institution_id, distanceKm: u.distanceKm })),
    status: outcome.status,
    matchMs: outcome.matchMs,
  });
}

async function runMatch(requestId) {
  const request = await requestModel.findRequestWithHospital(requestId);
  if (!request || DONE_STATUSES.includes(request.status)) {
    return request ? { status: request.status, matches: [], matchMs: null } : null;
  }
  const allocated = await allocateNeeded(request, request.quantity - request.matched_units);
  const outcome = await updateStatus(request, request.matched_units + allocated.length);
  if (allocated.length) {
    await publishAllocations(request, allocated, outcome);
  }
  const escalated = await escalateIfNeeded({ ...request, status: outcome.status });
  return {
    status: escalated ? 'ESCALATED' : outcome.status,
    matches: allocated.map((u) => ({ unitId: u.id, institutionId: u.institution_id, distanceKm: u.distanceKm })),
    matchMs: outcome.matchMs,
  };
}

// Load request + hospital, find compatible stock (cache as hint, DB as truth), score it,
// allocate until quantity is reached, update status, publish events, escalate if needed.
// Returns null when another matcher is already working on this request.
function matchRequest(requestId) {
  return requestModel.withRequestLock(requestId, () => runMatch(requestId));
}

module.exports = { matchRequest };
