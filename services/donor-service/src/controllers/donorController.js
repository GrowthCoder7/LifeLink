const bcrypt = require('bcryptjs');
const { AppError } = require('@lifelink/shared/errors');
const { BLOOD_GROUPS } = require('@lifelink/shared/eventSchemas');
const { validateDonor } = require('../validators/donorValidator');
const { isEligible, nextEligibleDate } = require('../validators/eligibility');
const donorModel = require('../models/donorModel');

const UNIQUE_VIOLATION = '23505';

function piiKey() {
  if (!process.env.PII_KEY) {
    throw new AppError(500, 'PII_KEY is not configured');
  }
  return process.env.PII_KEY;
}

function withEligibility(donor) {
  return { ...donor, eligible: isEligible(donor), nextEligibleDate: nextEligibleDate(donor) };
}

async function register(req, res, next) {
  try {
    const { value, error } = validateDonor(req.body);
    if (error) {
      throw new AppError(400, error.message, error.field);
    }
    const passwordHash = await bcrypt.hash(value.password, 10);
    const id = await donorModel.createDonorWithUser(value, passwordHash, piiKey());
    res.status(201).json({ id });
  } catch (err) {
    next(err.code === UNIQUE_VIOLATION ? new AppError(409, 'Email already registered', 'email') : err);
  }
}

async function me(req, res, next) {
  try {
    const donorId = req.get('x-donor-id');
    if (!donorId) {
      throw new AppError(403, 'Not a donor account');
    }
    const donor = await donorModel.findDonorWithPhone(donorId, piiKey());
    if (!donor) {
      throw new AppError(404, 'Donor not found');
    }
    res.json(withEligibility(donor));
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const { bloodGroup, eligible } = req.query;
    if (bloodGroup && !BLOOD_GROUPS.includes(bloodGroup)) {
      throw new AppError(400, 'Invalid blood group', 'bloodGroup');
    }
    const donors = (await donorModel.listDonors(bloodGroup)).map(withEligibility);
    res.json(eligible === 'true' ? donors.filter((d) => d.eligible) : donors);
  } catch (err) {
    next(err);
  }
}

module.exports = { register, me, list };
