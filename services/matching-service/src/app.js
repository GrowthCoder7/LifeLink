const express = require('express');
const { errorHandler, notFoundHandler } = require('@lifelink/shared/errors');
const routes = require('./routes/requests');

const app = express();
app.disable('x-powered-by');
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/requests', routes.requests);
app.use('/api/admin', routes.admin);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
