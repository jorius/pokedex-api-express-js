// packages
import dotenv from 'dotenv';

dotenv.config();

const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? '',
  pokeApiBaseUrl: process.env.POKEAPI_BASE_URL ?? 'https://pokeapi.co/api/v2',
  redisUrl: process.env.REDIS_URL ?? '',
  jwtSecret: process.env.JWT_SECRET ?? '',
  jwtIssuer: process.env.JWT_ISSUER ?? 'pokedex-api',
  jwtAudience: process.env.JWT_AUDIENCE ?? 'pokedex-clients',
  jwtAccessMinutes: Number(process.env.JWT_ACCESS_MINUTES ?? 15),
  jwtRefreshHours: Number(process.env.JWT_REFRESH_HOURS ?? 24),
  bcryptCost: Number(process.env.BCRYPT_COST ?? 12),
  cacheL1TtlSeconds: Number(process.env.CACHE_L1_TTL_SECONDS ?? 300),
  cacheL2TtlSeconds: Number(process.env.CACHE_L2_TTL_SECONDS ?? 3600),
  isProduction: (process.env.NODE_ENV ?? 'development') === 'production',
};

const positiveIntegerFields = [
  { key: 'jwtAccessMinutes', name: 'JWT_ACCESS_MINUTES' },
  { key: 'jwtRefreshHours', name: 'JWT_REFRESH_HOURS' },
  { key: 'bcryptCost', name: 'BCRYPT_COST' },
  { key: 'port', name: 'PORT' },
  { key: 'cacheL1TtlSeconds', name: 'CACHE_L1_TTL_SECONDS' },
  { key: 'cacheL2TtlSeconds', name: 'CACHE_L2_TTL_SECONDS' },
];

/**
 * Fail-fast boot check (folded in from an earlier review): refuse to start
 * with a weak JWT secret or garbage numeric settings rather than silently
 * signing weak tokens or booting with a nonsensical config. Not called at
 * import time — env is imported freely by tests with no JWT_SECRET set —
 * Server.js calls this once at boot.
 */
const validateEnv = (candidate) => {
  if (candidate.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be set to a string of at least 32 characters');
  }

  positiveIntegerFields.forEach(({ key, name }) => {
    const value = candidate[key];
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${name} must be a positive integer`);
    }
  });
};

export { env, validateEnv };
