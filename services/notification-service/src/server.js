const app = require('./app');
const logger = require('@lifelink/shared/logger');

const port = Number(process.env.PORT) || 4004;
const name = process.env.SERVICE_NAME || 'notification-service';

app.listen(port, () => {
  logger.info(`${name} listening on port ${port}`);
});
