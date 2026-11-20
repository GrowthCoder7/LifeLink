const rateLimit = require('express-rate-limit');

const options = { standardHeaders: 'draft-7', legacyHeaders: false };

const generalLimiter = rateLimit({ ...options, windowMs: 15 * 60 * 1000, limit: 300 });
const loginLimiter = rateLimit({ ...options, windowMs: 60 * 1000, limit: 10 });

module.exports = { generalLimiter, loginLimiter };
