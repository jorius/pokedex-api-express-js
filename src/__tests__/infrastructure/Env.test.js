// packages
import { describe, expect, it } from '@jest/globals';

// config
import { validateEnv } from '../../infrastructure/config/Env.js';

const validEnv = {
  jwtSecret: 'a-secret-that-is-definitely-32-chars!!',
  jwtAccessMinutes: 15,
  jwtRefreshHours: 24,
  bcryptCost: 12,
  port: 3001,
  cacheL1TtlSeconds: 300,
  cacheL2TtlSeconds: 3600,
};

describe('validateEnv', () => {
  it('accepts a valid configuration', () => {
    expect(() => validateEnv(validEnv)).not.toThrow();
  });

  it('rejects a short or empty JWT secret', () => {
    expect(() => validateEnv({ ...validEnv, jwtSecret: '' })).toThrow(/JWT_SECRET/);
    expect(() => validateEnv({ ...validEnv, jwtSecret: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('rejects NaN or non-positive numeric settings', () => {
    expect(() => validateEnv({ ...validEnv, bcryptCost: Number.NaN })).toThrow(/BCRYPT_COST/);
    expect(() => validateEnv({ ...validEnv, jwtAccessMinutes: 0 })).toThrow(/JWT_ACCESS_MINUTES/);
    expect(() => validateEnv({ ...validEnv, port: -1 })).toThrow(/PORT/);
  });
});
