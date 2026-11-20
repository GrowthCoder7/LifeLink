module.exports = {
  testEnvironment: 'node',
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.js', '!src/server.js'],
  coverageDirectory: 'coverage',
  coverageReporters: ['lcov', 'text'],
  globalSetup: '<rootDir>/../db/testSetup.js',
  // API suites share one test database, so run them one at a time.
  maxWorkers: 1,
};
