const path = require('path');

// rootDir is the repo root so coverage includes shared/ (exercised through this service's tests)
// and lcov paths are repo-relative, which is what SonarCloud needs; roots keeps tests local.
const repoRoot = path.resolve(__dirname, '../..');

module.exports = {
  rootDir: repoRoot,
  roots: ['<rootDir>/services/inventory-service'],
  testEnvironment: 'node',
  collectCoverage: true,
  // V8 coverage: babel-istanbul skips shared/ even when it is in collectCoverageFrom.
  coverageProvider: 'v8',
  collectCoverageFrom: ['services/inventory-service/src/**/*.js', '!services/inventory-service/src/server.js', 'shared/*.js', '!shared/jest.config.js'],
  coverageDirectory: '<rootDir>/services/inventory-service/coverage',
  coverageReporters: [['lcov', { projectRoot: repoRoot }], 'text'],
  // Load @lifelink/shared from its real folder (not the node_modules symlink) so it is measured.
  moduleNameMapper: { '^@lifelink/shared/(.*)$': '<rootDir>/shared/$1' },
  globalSetup: '<rootDir>/db/testSetup.js',
  // API suites share one test database, so run them one at a time.
  maxWorkers: 1,
};
