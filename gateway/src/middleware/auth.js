const jwt = require('jsonwebtoken');

const PUBLIC_ROUTES = [
  { method: 'POST', path: '/api/auth/login' },
  { method: 'GET', path: '/api/health' },
  { method: 'POST', path: '/api/donors' },
];

function isPublic(req) {
  return PUBLIC_ROUTES.some((route) => route.method === req.method && route.path === req.path);
}

function unauthorized(res) {
  return res.status(401).json({ error: 'Unauthorized' });
}

function authenticate(req, res, next) {
  if (isPublic(req)) {
    return next();
  }
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return unauthorized(res);
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      institutionId: payload.institutionId,
      donorId: payload.donorId,
    };
    return next();
  } catch {
    return unauthorized(res);
  }
}

module.exports = { authenticate, isPublic };
