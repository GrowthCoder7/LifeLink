const logger = require('@lifelink/shared/logger');

if (!process.env.PII_KEY) {
  logger.error('PII_KEY is not set; refusing to start');
  process.exit(1);
}

const app = require('./app');

const port = Number(process.env.PORT) || 4001;
const name = process.env.SERVICE_NAME || 'donor-service';

app.listen(port, () => {
  logger.info(`${name} listening on port ${port}`);
});
