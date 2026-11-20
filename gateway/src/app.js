const express = require('express');
const { errorHandler, notFoundHandler } = require('@lifelink/shared/errors');

const app = express();
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
