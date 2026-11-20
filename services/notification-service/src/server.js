const app = require('./app');
const logger = require('@lifelink/shared/logger');
const { getSmsProvider } = require('./providers/smsProvider');
const { startConsumers } = require('./consumers');

const port = Number(process.env.PORT) || 4004;
const name = process.env.SERVICE_NAME || 'notification-service';

getSmsProvider(); // fail fast on an unsupported SMS_PROVIDER
startConsumers();

app.listen(port, () => {
  logger.info(`${name} listening on port ${port}`);
});
