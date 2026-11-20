const app = require('./app');
const logger = require('@lifelink/shared/logger');

const port = Number(process.env.PORT) || 8080;
const name = process.env.SERVICE_NAME || 'lifelink-gateway';

app.listen(port, () => {
  logger.info(`${name} listening on port ${port}`);
});
