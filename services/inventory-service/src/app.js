const express = require('express');
const { errorHandler, notFoundHandler } = require('@lifelink/shared/errors');
const inventoryRoutes = require('./routes/inventory');

const app = express();
app.disable('x-powered-by');
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/inventory', inventoryRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
