const { isPublic } = require('./auth');

const STAFF_VIEWERS = ['BLOODBANK_STAFF', 'HOSPITAL_STAFF', 'ADMIN'];
const ANY_ROLE = ['DONOR', 'HOSPITAL_STAFF', 'BLOODBANK_STAFF', 'ADMIN'];

// Route -> roles table (spec §7). Order matters: specific paths before generic ones.
const RULES = [
  { method: 'GET', pattern: /^\/api\/donors\/me$/, roles: ['DONOR'] },
  { method: 'GET', pattern: /^\/api\/donors$/, roles: ['HOSPITAL_STAFF', 'ADMIN'] },
  { method: 'GET', pattern: /^\/api\/inventory(\/expiring)?$/, roles: STAFF_VIEWERS },
  { method: 'POST', pattern: /^\/api\/inventory$/, roles: ['BLOODBANK_STAFF'] },
  { method: 'POST', pattern: /^\/api\/inventory\/[^/]+\/allocate$/, roles: ['BLOODBANK_STAFF', 'ADMIN'] },
  { method: 'PATCH', pattern: /^\/api\/inventory\/[^/]+$/, roles: ['BLOODBANK_STAFF'] },
  { method: 'POST', pattern: /^\/api\/requests$/, roles: ['HOSPITAL_STAFF'] },
  { method: 'GET', pattern: /^\/api\/requests(\/[^/]+)?$/, roles: ['HOSPITAL_STAFF', 'ADMIN'] },
  { method: 'GET', pattern: /^\/api\/admin\/stats$/, roles: ['ADMIN'] },
  { method: 'GET', pattern: /^\/api\/notifications$/, roles: ANY_ROLE },
  { method: 'PATCH', pattern: /^\/api\/notifications\/[^/]+\/read$/, roles: ANY_ROLE },
];

function allowedRoles(method, path) {
  const rule = RULES.find((r) => r.method === method && r.pattern.test(path));
  return rule ? rule.roles : null;
}

// Default deny: an authenticated route not listed in the table is forbidden.
function authorize(req, res, next) {
  if (isPublic(req)) {
    return next();
  }
  const roles = allowedRoles(req.method, req.path);
  if (!roles || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return next();
}

module.exports = { authorize, allowedRoles };
