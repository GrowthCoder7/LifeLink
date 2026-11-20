const logger = require('@lifelink/shared/logger');

if (!process.env.JWT_SECRET) {
  logger.error('JWT_SECRET is not set; refusing to start');
  process.exit(1);
}

const app = require('./app');

const port = Number(process.env.PORT) || 8080;
const name = process.env.SERVICE_NAME || 'lifelink-gateway';

app.listen(port, () => {
  logger.info(`${name} listening on port ${port}`);
});
