export default {
  testEnvironment: 'node',
  transform: {},
  collectCoverageFrom: ['src/**/*.js', '!src/__tests__/**'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
