// packages
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import {
  beforeEach, describe, expect, it,
} from '@jest/globals';

// services
import { createAuthService } from '../../application/services/AuthService.js';
// utils
import { ConflictError } from '../../domain/errors/ConflictError.js';
import { UnauthorizedError } from '../../domain/errors/UnauthorizedError.js';
import { ValidationError } from '../../domain/errors/ValidationError.js';

const testEnv = {
  jwtSecret: 'test-secret-that-is-at-least-32-chars!!',
  jwtIssuer: 'pokedex-api',
  jwtAudience: 'pokedex-clients',
  jwtAccessMinutes: 15,
  jwtRefreshHours: 24,
  bcryptCost: 4, // fast for tests; production uses 12 (spec §4)
};

const createFakeUsersRepository = () => {
  const rows = [];
  return {
    rows,
    create: async (email, passwordHash) => {
      const user = {
        id: crypto.randomUUID(), email, passwordHash, createdAt: new Date(), updatedAt: new Date(),
      };
      rows.push(user);
      return user;
    },
    findByEmail: async (email) => rows.find((user) => user.email === email) ?? null,
    findById: async (id) => rows.find((user) => user.id === id) ?? null,
  };
};

const createFakeRefreshTokensRepository = () => {
  const rows = [];
  return {
    rows,
    create: async (record) => {
      const stored = {
        id: crypto.randomUUID(), createdAt: new Date(), revokedAt: null, replacedById: null, ...record,
      };
      rows.push(stored);
      return stored;
    },
    findByTokenHash: async (tokenHash) => rows.find((row) => row.tokenHash === tokenHash) ?? null,
    revoke: async (id, replacedById) => {
      const row = rows.find((entry) => entry.id === id);
      if (row) {
        row.revokedAt = new Date();
        row.replacedById = replacedById ?? null;
      }
    },
    revokeFamily: async (familyId) => {
      rows.filter((row) => row.familyId === familyId && row.revokedAt === null)
        .forEach((row) => Object.assign(row, { revokedAt: new Date() }));
    },
  };
};

describe('AuthService', () => {
  let usersRepository;
  let refreshTokensRepository;
  let service;

  beforeEach(() => {
    usersRepository = createFakeUsersRepository();
    refreshTokensRepository = createFakeRefreshTokensRepository();
    service = createAuthService({ usersRepository, refreshTokensRepository, env: testEnv });
  });

  it('registers a user with a bcrypt $2b$ hash and returns a session', async () => {
    const session = await service.register('Ash@Example.com', 'pikachu123');

    expect(session.user.email).toBe('ash@example.com');
    expect(usersRepository.rows[0].passwordHash).toMatch(/^\$2b\$/);
    expect(session.accessToken).toBeTruthy();
    expect(session.refreshToken).toBeTruthy();
  });

  it('rejects duplicate emails with ConflictError', async () => {
    await service.register('ash@example.com', 'pikachu123');

    await expect(service.register('ash@example.com', 'pikachu123')).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects invalid email or short password with ValidationError', async () => {
    await expect(service.register('not-an-email', 'pikachu123')).rejects.toBeInstanceOf(ValidationError);
    await expect(service.register('ash@example.com', 'short')).rejects.toBeInstanceOf(ValidationError);
  });

  it('logs in with correct credentials and issues a verifiable JWT', async () => {
    await service.register('ash@example.com', 'pikachu123');
    const session = await service.login('ash@example.com', 'pikachu123');

    const payload = jwt.verify(session.accessToken, testEnv.jwtSecret, {
      issuer: testEnv.jwtIssuer,
      audience: testEnv.jwtAudience,
    });

    expect(payload.sub).toBe(session.user.id);
    expect(payload.email).toBe(session.user.email);
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(15 * 60);
    expect(payload.jti).toBeTruthy();
  });

  it('rejects wrong password and unknown user identically', async () => {
    await service.register('ash@example.com', 'pikachu123');

    await expect(service.login('ash@example.com', 'wrong-password')).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(service.login('nobody@example.com', 'pikachu123')).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rotates the refresh token: old revoked, new one in same family with same expiry', async () => {
    const session = await service.register('ash@example.com', 'pikachu123');
    const original = refreshTokensRepository.rows[0];

    const rotated = await service.refresh(session.refreshToken);
    const successor = refreshTokensRepository.rows.find((row) => row.id !== original.id);

    expect(rotated.refreshToken).not.toBe(session.refreshToken);
    expect(original.revokedAt).not.toBeNull();
    expect(original.replacedById).toBe(successor?.id);
    expect(successor?.familyId).toBe(original.familyId);
    expect(successor?.expiresAt.getTime()).toBe(original.expiresAt.getTime());
  });

  it('revokes the whole family on refresh token reuse', async () => {
    const session = await service.register('ash@example.com', 'pikachu123');
    const original = refreshTokensRepository.rows[0];
    const rotated = await service.refresh(session.refreshToken);
    const successor = refreshTokensRepository.rows.find((row) => row.id !== original.id);

    await expect(service.refresh(session.refreshToken)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(successor?.revokedAt).not.toBeNull();

    await expect(service.refresh(rotated.refreshToken)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects an expired refresh token', async () => {
    const session = await service.register('ash@example.com', 'pikachu123');
    refreshTokensRepository.rows[0].expiresAt = new Date(Date.now() - 1000);

    await expect(service.refresh(session.refreshToken)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('logout revokes the token family', async () => {
    const session = await service.register('ash@example.com', 'pikachu123');

    await service.logout(session.refreshToken);

    await expect(service.refresh(session.refreshToken)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('logout with unknown token is a silent no-op', async () => {
    await expect(service.logout('nonexistent')).resolves.toBeUndefined();
  });

  it('stores only the SHA-256 hash of the refresh token, never the token itself', async () => {
    const session = await service.register('ash@example.com', 'pikachu123');
    const expectedHash = crypto.createHash('sha256').update(session.refreshToken).digest('hex');

    expect(refreshTokensRepository.rows[0].tokenHash).toBe(expectedHash);
  });

  it('signs the access token with HS256', async () => {
    const session = await service.register('ash@example.com', 'pikachu123');
    const decoded = jwt.decode(session.accessToken, { complete: true });

    expect(decoded.header.alg).toBe('HS256');
  });

  it('issues a 43-character base64url refresh token', async () => {
    const session = await service.register('ash@example.com', 'pikachu123');

    expect(session.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('rejects an empty refresh token with ValidationError', async () => {
    await expect(service.refresh('')).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects login for an unknown user via the dummy-hash timing-equalizer branch', async () => {
    await expect(service.login('nobody@example.com', 'whatever123')).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects a non-string password with ValidationError before reaching bcrypt', async () => {
    await service.register('ash@example.com', 'pikachu123');

    await expect(service.login('ash@example.com', 12345678)).rejects.toBeInstanceOf(ValidationError);
  });
});
