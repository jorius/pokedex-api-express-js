export default {
  testEnvironment: 'node',
  transform: {},
  collectCoverageFrom: [
    'src/application/**/*.js',
    'src/domain/**/*.js',
    'src/infrastructure/cache/**/*.js',
    'src/infrastructure/clients/**/*.js',
    'src/infrastructure/lifecycle/**/*.js',
    'src/infrastructure/config/Env.js',
    'src/presentation/middleware/Auth.js',
    'src/presentation/middleware/ErrorHandler.js',
    // Coverage scope implements spec §9: unit tests cover the application services,
    // domain, cache/client/lifecycle infrastructure, env validation and the two
    // HTTP middlewares. Deliberately NOT unit-measured (verified via live smoke
    // probes and the cross-service phase gate instead): repositories and database
    // wiring (need a live PostgreSQL), controllers/routes/App/Container/Server
    // (thin composition), swagger definitions, Response helper, and Logger.
    // Typedef-only modules (application/ports, domain/types) contain no executable code.
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
