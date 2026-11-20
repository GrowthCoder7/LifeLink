const Joi = require('joi');
const { BLOOD_GROUPS } = require('@lifelink/shared/eventSchemas');

const isoDate = () => Joi.date().iso().max('now').raw();

const donorSchema = Joi.object({
  full_name: Joi.string().trim().min(2).max(120).required(),
  email: Joi.string().trim().lowercase().email().required(),
  password: Joi.string().min(8).max(128).required(),
  phone: Joi.string().trim().pattern(/^\+?[0-9][0-9\s-]{6,19}$/).required()
    .messages({ 'string.pattern.base': '"phone" must be a valid phone number' }),
  blood_group: Joi.string().valid(...BLOOD_GROUPS).required(),
  date_of_birth: isoDate().required(),
  last_donation_date: isoDate().allow(null),
  organ_pledge: Joi.boolean().default(false),
  city: Joi.string().trim().max(80).allow('', null),
  lat: Joi.number().min(-90).max(90).allow(null),
  lng: Joi.number().min(-180).max(180).allow(null),
});

function validateDonor(payload) {
  const { error, value } = donorSchema.validate(payload || {}, { abortEarly: true });
  if (error) {
    const detail = error.details[0];
    return { error: { field: String(detail.path[0]), message: detail.message } };
  }
  return { value };
}

module.exports = { validateDonor, donorSchema };
