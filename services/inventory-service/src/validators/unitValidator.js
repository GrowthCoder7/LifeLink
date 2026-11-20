const Joi = require('joi');
const { BLOOD_GROUPS, COMPONENTS } = require('@lifelink/shared/eventSchemas');

const STATUSES = ['AVAILABLE', 'ALLOCATED', 'EXPIRED'];

const schemas = {
  create: Joi.object({
    bloodGroup: Joi.string().valid(...BLOOD_GROUPS).required(),
    component: Joi.string().valid(...COMPONENTS).required(),
    collectedAt: Joi.date().iso().max('now').required(),
    expiresAt: Joi.date().iso().greater(Joi.ref('collectedAt')).required(),
    donorId: Joi.string().uuid().allow(null),
  }),
  // ALLOCATED is only reachable through the allocate endpoint; EXPIRED doubles as "discarded".
  patch: Joi.object({
    status: Joi.string().valid('AVAILABLE', 'EXPIRED').required(),
  }),
  allocate: Joi.object({
    requestId: Joi.string().uuid().required(),
  }),
  query: Joi.object({
    institutionId: Joi.string().uuid(),
    bloodGroup: Joi.string().valid(...BLOOD_GROUPS),
    status: Joi.string().valid(...STATUSES),
  }),
  id: Joi.string().uuid().required(),
};

// Returns {value} or {error: {field, message}}, the same contract as validateDonor().
function validate(name, payload) {
  // eslint-disable-next-line security/detect-object-injection
  const { error, value } = schemas[name].validate(payload || {}, { abortEarly: true });
  if (error) {
    const detail = error.details[0];
    return { error: { field: String(detail.path[0] ?? 'id'), message: detail.message } };
  }
  return { value };
}

module.exports = { validate };
