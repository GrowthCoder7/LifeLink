const app = require('./app');
const logger = require('@lifelink/shared/logger');

const port = Number(process.env.PORT) || 4002;
const name = process.env.SERVICE_NAME || 'inventory-service';

app.listen(port, () => {
  logger.info(`${name} listening on port ${port}`);
});
