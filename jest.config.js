module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 10000,
  collectCoverageFrom: [
    'content/**/*.js',
    'background/**/*.js',
    'popup/**/*.js',
    'options/**/*.js',
    '!**/*.test.js',
    '!**/node_modules/**'
  ],
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json-summary'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  testMatch: [
    '<rootDir>/tests/**/*.test.js'
  ],
  moduleFileExtensions: ['js', 'json'],
  verbose: true
};