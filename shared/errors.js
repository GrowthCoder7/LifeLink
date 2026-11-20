const logger = require('./logger');

class AppError extends Error {
  constructor(status, message, field = null) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.field = field;
  }
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }
  const status = err.status || 500;
  if (status >= 500) {
    logger.error(err.message, { stack: err.stack });
  }
  const body = { error: err.message || 'Internal Server Error' };
  if (err.field) {
    body.field = err.field;
  }
  return res.status(status).json(body);
}

module.exports = { AppError, errorHandler, notFoundHandler };
