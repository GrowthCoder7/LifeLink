const { AppError } = require('@lifelink/shared/errors');
const { publish } = require('@lifelink/shared/events');
const { validateRequest, validateId } = require('../validators/requestValidator');
const requestModel = require('../models/requestModel');
const { matchRequest } = require('../engine/allocator');

function check({ value, error }) {
  if (error) {
    throw new AppError(400, error.message, error.field);
  }
  return value;
}

// Hospital staff are limited to their own hospital; admins see every request.
function hospitalScope(req) {
  return req.get('x-user-role') === 'HOSPITAL_STAFF' ? req.get('x-institution-id') : null;
}

async function create(req, res, next) {
  try {
    const body = check(validateRequest(req.body));
    const hospitalId = req.get('x-institution-id');
    if (!hospitalId) {
      throw new AppError(403, 'Only hospital staff can raise requests');
    }
    const created = await requestModel.insertRequest({ ...body, hospitalId, createdBy: req.get('x-user-id') });
    await publish('request.created', {
      requestId: created.id,
      hospitalId,
      bloodGroup: created.blood_group,
      component: created.component,
      quantity: created.quantity,
      urgency: created.urgency,
    });
    // Match in-process before responding so the demo shows the result immediately.
    const result = await matchRequest(created.id);
    res.status(201).json({ id: created.id, ...result });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    res.json(await requestModel.listRequests(hospitalScope(req)));
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const id = check(validateId(req.params.id));
    const request = await requestModel.findRequestWithHospital(id);
    const scope = hospitalScope(req);
    if (!request || (scope && request.hospital_id !== scope)) {
      throw new AppError(404, 'Request not found');
    }
    const matches = await requestModel.listMatches(id);
    const matchMs = request.matched_at ? new Date(request.matched_at) - new Date(request.created_at) : null;
    res.json({ ...request, matchMs, matches });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list, getOne };
