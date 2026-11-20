const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const { getPool } = require('@lifelink/shared/db');
const { loginLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

// Compared against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('lifelink-dummy-password', 10);

function findUserByEmail(email) {
  return getPool()
    .query(
      `SELECT id, email, password_hash, role, institution_id, donor_id
       FROM app_user WHERE email = $1`,
      [email.toLowerCase()]
    )
    .then(({ rows }) => rows[0]);
}

function toPublicUser(row) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    institutionId: row.institution_id,
    donorId: row.donor_id,
  };
}

function signToken(user) {
  const claims = { email: user.email, role: user.role, institutionId: user.institutionId, donorId: user.donorId };
  return jwt.sign(claims, process.env.JWT_SECRET, { subject: user.id, expiresIn: '8h' });
}

router.post('/login', loginLimiter, express.json(), async (req, res, next) => {
  try {
    const { error, value } = loginSchema.validate(req.body || {});
    if (error) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const row = await findUserByEmail(value.email);
    const valid = await bcrypt.compare(value.password, row ? row.password_hash : DUMMY_HASH);
    if (!row || !valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const user = toPublicUser(row);
    return res.json({ token: signToken(user), user });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
