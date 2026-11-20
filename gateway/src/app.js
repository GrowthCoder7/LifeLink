const express = require('express');
const { errorHandler, notFoundHandler } = require('@lifelink/shared/errors');
const { authenticate } = require('./middleware/auth');
const { authorize } = require('./middleware/rbac');
const { generalLimiter } = require('./middleware/rateLimit');
const authRoutes = require('./routes/auth');
const { buildProxies } = require('./routes/proxy');

const app = express();
app.disable('x-powered-by');

// The browser app runs on another origin (port 5173); answer CORS preflights before auth.
app.use((req, res, next) => {
  res.set({
    'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || 'http://localhost:5173',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  });
  return req.method === 'OPTIONS' ? res.sendStatus(204) : next();
});

app.use(generalLimiter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);

// No body parser before the proxy: request bodies stream straight through to the services.
app.use(authenticate, authorize, ...buildProxies());

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
