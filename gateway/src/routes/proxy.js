const { createProxyMiddleware } = require('http-proxy-middleware');
const logger = require('@lifelink/shared/logger');

const IDENTITY_HEADERS = {
  'x-user-id': 'id',
  'x-user-role': 'role',
  'x-institution-id': 'institutionId',
  'x-donor-id': 'donorId',
};

// Never trust identity headers from the browser; only the verified JWT sets them. This runs as
// middleware on req.headers (copied by the proxy when it builds the request) rather than in
// onProxyReq: with "Expect: 100-continue" the outgoing headers are already sent by then.
function forwardIdentity(req, res, next) {
  for (const [header, key] of Object.entries(IDENTITY_HEADERS)) {
    delete req.headers[header]; // eslint-disable-line security/detect-object-injection
    const value = req.user && req.user[key]; // eslint-disable-line security/detect-object-injection
    if (value) {
      req.headers[header] = String(value); // eslint-disable-line security/detect-object-injection
    }
  }
  next();
}

function onError(err, req, res) {
  logger.error('proxy error', { path: req.originalUrl, error: err.message });
  if (!res.headersSent) {
    res.status(502).json({ error: 'Service unavailable' });
  }
}

function serviceProxy(context, target) {
  return createProxyMiddleware(context, {
    target,
    changeOrigin: true,
    logLevel: 'silent',
    onError,
  });
}

function buildProxies(env = process.env) {
  return [
    serviceProxy('/api/donors', env.DONOR_SERVICE_URL || 'http://localhost:4001'),
    serviceProxy('/api/inventory', env.INVENTORY_SERVICE_URL || 'http://localhost:4002'),
    serviceProxy(['/api/requests', '/api/matches', '/api/admin'], env.MATCHING_SERVICE_URL || 'http://localhost:4003'),
    serviceProxy('/api/notifications', env.NOTIFICATION_SERVICE_URL || 'http://localhost:4004'),
  ];
}

module.exports = { buildProxies, forwardIdentity };
