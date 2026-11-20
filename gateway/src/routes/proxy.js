const { createProxyMiddleware } = require('http-proxy-middleware');
const logger = require('@lifelink/shared/logger');

const IDENTITY_HEADERS = {
  'x-user-id': 'id',
  'x-user-role': 'role',
  'x-institution-id': 'institutionId',
  'x-donor-id': 'donorId',
};

// Never trust identity headers from the browser; only the verified JWT sets them.
function forwardIdentity(proxyReq, req) {
  for (const [header, key] of Object.entries(IDENTITY_HEADERS)) {
    proxyReq.removeHeader(header);
    const value = req.user && req.user[key]; // eslint-disable-line security/detect-object-injection
    if (value) {
      proxyReq.setHeader(header, String(value));
    }
  }
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
    onProxyReq: forwardIdentity,
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
