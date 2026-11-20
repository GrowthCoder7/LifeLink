const Joi = require('joi');
const { BLOOD_GROUPS, COMPONENTS, URGENCIES } = require('@lifelink/shared/eventSchemas');

const requestSchema = Joi.object({
  bloodGroup: Joi.string().valid(...BLOOD_GROUPS).required(),
  component: Joi.string().valid(...COMPONENTS).required(),
  quantity: Joi.number().integer().min(1).max(10).required(),
  urgency: Joi.string().valid(...URGENCIES).required(),
});

const idSchema = Joi.string().uuid().required();

function toResult({ error, value }, fallbackField) {
  if (error) {
    const detail = error.details[0];
    return { error: { field: String(detail.path[0] ?? fallbackField), message: detail.message } };
  }
  return { value };
}

// Returns {value} or {error: {field, message}}, the same contract as validateDonor().
function validateRequest(payload) {
  return toResult(requestSchema.validate(payload || {}), 'body');
}

function validateId(id) {
  return toResult(idSchema.validate(id), 'id');
}

module.exports = { validateRequest, validateId };
