const app = require('./app');
const logger = require('@lifelink/shared/logger');

const port = Number(process.env.PORT) || 4001;
const name = process.env.SERVICE_NAME || 'donor-service';

app.listen(port, () => {
  logger.info(`${name} listening on port ${port}`);
});
