const { AppError } = require('@lifelink/shared/errors');
const { getPool } = require('@lifelink/shared/db');
const { publish } = require('@lifelink/shared/events');
const { allocateUnit } = require('@lifelink/shared/allocate');
const { validate } = require('../validators/unitValidator');
const unitModel = require('../models/unitModel');
const cache = require('../models/availabilityCache');

const FK_VIOLATION = '23503';

function check(name, payload) {
  const { value, error } = validate(name, payload);
  if (error) {
    throw new AppError(400, error.message, error.field);
  }
  return value;
}

function caller(req) {
  return { role: req.get('x-user-role'), institutionId: req.get('x-institution-id') };
}

// Blood bank staff only ever see and change their own institution's stock.
function scopeInstitution(req, requested) {
  const { role, institutionId } = caller(req);
  return role === 'BLOODBANK_STAFF' ? institutionId : requested;
}

async function loadOwnUnit(req) {
  const unit = await unitModel.findUnit(check('id', req.params.id));
  const scope = scopeInstitution(req, null);
  if (!unit || (scope && unit.institution_id !== scope)) {
    throw new AppError(404, 'Unit not found');
  }
  return unit;
}

// Recount the cache key now and tell other services (matching retries open requests).
async function stockChanged(unit) {
  const key = { institutionId: unit.institution_id, bloodGroup: unit.blood_group, component: unit.component };
  await cache.refreshKey(key);
  await publish('inventory.updated', key);
}

async function list(req, res, next) {
  try {
    const query = check('query', req.query);
    const institutionId = scopeInstitution(req, query.institutionId);
    res.json(await unitModel.listUnits({ ...query, institutionId }));
  } catch (err) {
    next(err);
  }
}

async function expiring(req, res, next) {
  try {
    const institutionId = scopeInstitution(req, null);
    res.json(await unitModel.listUnits({ institutionId, status: 'AVAILABLE', expiryFlag: 'NEAR_EXPIRY' }));
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const unit = check('create', req.body);
    const { institutionId } = caller(req);
    if (!institutionId) {
      throw new AppError(403, 'Only blood bank staff can add units');
    }
    const created = await unitModel.insertUnit(institutionId, unit);
    await stockChanged(created);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

async function patch(req, res, next) {
  try {
    const { status } = check('patch', req.body);
    const unit = await loadOwnUnit(req);
    const updated = await unitModel.updateStatus(unit.id, status);
    if (!updated) {
      throw new AppError(409, 'Allocated units cannot be changed');
    }
    await stockChanged(updated);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

async function allocate(req, res, next) {
  try {
    const { requestId } = check('allocate', req.body);
    const unit = await loadOwnUnit(req);
    const result = await allocateUnit(getPool(), unit.id, requestId, null);
    if (!result.ok) {
      throw new AppError(409, 'Unit not available');
    }
    await stockChanged(unit);
    res.json({ unitId: unit.id, requestId, status: 'ALLOCATED' });
  } catch (err) {
    next(err.code === FK_VIOLATION ? new AppError(404, 'Request not found', 'requestId') : err);
  }
}

module.exports = { list, expiring, create, patch, allocate };
