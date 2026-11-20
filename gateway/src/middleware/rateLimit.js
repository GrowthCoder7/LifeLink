const rateLimit = require('express-rate-limit');

const options = { standardHeaders: 'draft-7', legacyHeaders: false };

// The notification bell polls every 5 s on every page; counting it would push a single tab past
// 300 / 15 min once the page's own 5 s polling is added, so the bell poll is not counted.
const isBellPoll = (req) => req.method === 'GET' && req.path === '/api/notifications';

const generalLimiter = rateLimit({ ...options, windowMs: 15 * 60 * 1000, limit: 300, skip: isBellPoll });
const loginLimiter = rateLimit({ ...options, windowMs: 60 * 1000, limit: 10 });

module.exports = { generalLimiter, loginLimiter };
