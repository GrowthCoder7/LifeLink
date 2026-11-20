const { migrate } = require('./migrate');

const TEST_DB_URL =
  process.env.DATABASE_URL_TEST || 'postgresql://lifelink:lifelink@localhost:55432/lifelink_test';

// Jest globalSetup: bring the disposable test database up to the latest schema.
module.exports = async function globalSetup() {
  process.env.DATABASE_URL_TEST = TEST_DB_URL;
  await migrate(TEST_DB_URL);
};

module.exports.TEST_DB_URL = TEST_DB_URL;
