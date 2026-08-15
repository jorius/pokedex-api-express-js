export default {
  testEnvironment: 'node',
  transform: {},
  collectCoverageFrom: [
    'src/application/**/*.js',
    'src/domain/**/*.js',
    'src/infrastructure/cache/**/*.js',
    'src/infrastructure/clients/**/*.js',
    'src/infrastructure/lifecycle/**/*.js',
    'src/presentation/middleware/Auth.js',
    'src/presentation/middleware/ErrorHandler.js',
    // Typedef-only modules: JSDoc @typedef declarations with a bare `export {};`,
    // no executable statements. They are type documentation, not code, and
    // trivially skew coverage to 0% for files that can never be "tested".
    '!src/application/ports/**',
    '!src/domain/types/**',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
