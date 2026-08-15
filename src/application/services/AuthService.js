// packages
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// utils
import { ConflictError } from '../../domain/errors/ConflictError.js';
import { UnauthorizedError } from '../../domain/errors/UnauthorizedError.js';
import { ValidationError } from '../../domain/errors/ValidationError.js';

/**
 * Authentication rules — IDENTICAL contract across all three pokedex services
 * (spec §4): bcrypt $2b$ (plain mode, shared cost), HS256 access tokens with a
 * shared secret, opaque refresh tokens stored as SHA-256 hashes, rotate-on-use
 * with 24h absolute expiry and family-wide revocation on reuse.
 *
 * @typedef {object} AuthEnv
 * @property {string} jwtSecret
 * @property {string} jwtIssuer
 * @property {string} jwtAudience
 * @property {number} jwtAccessMinutes
 * @property {number} jwtRefreshHours
 * @property {number} bcryptCost
 *
 * @typedef {object} AuthServiceDeps
 * @property {import('../ports/UsersRepositoryPort.js').UsersRepositoryPort} usersRepository
 * @property {import('../ports/RefreshTokensRepositoryPort.js').RefreshTokensRepositoryPort} refreshTokensRepository
 * @property {AuthEnv} env
 *
 * @typedef {object} AuthServicePort
 * @property {(rawEmail: string, password: string) => Promise<import('../../domain/types/User.types.js').AuthSession>} register
 * @property {(rawEmail: string, password: string) => Promise<import('../../domain/types/User.types.js').AuthSession>} login
 * @property {(refreshToken: string) => Promise<import('../../domain/types/User.types.js').AuthSession>} refresh
 * @property {(refreshToken: string) => Promise<void>} logout
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

/**
 * @param {AuthServiceDeps} deps
 * @returns {AuthServicePort}
 */
const createAuthService = ({ usersRepository, refreshTokensRepository, env }) => {
  // Precomputed once so login() can always run a real bcrypt.compare, even for unknown users
  // (see login below) — equalizes unknown-user vs wrong-password response timing.
  const dummyHash = bcrypt.hashSync('timing-equalizer', env.bcryptCost);

  const toPublic = (user) => ({ id: user.id, email: user.email });

  const signAccessToken = (user) => jwt.sign({ email: user.email }, env.jwtSecret, {
    subject: user.id,
    expiresIn: env.jwtAccessMinutes * 60,
    issuer: env.jwtIssuer,
    audience: env.jwtAudience,
    jwtid: crypto.randomUUID(),
  });

  const issueSession = async (user, familyId, expiresAt) => {
    const refreshToken = crypto.randomBytes(32).toString('base64url');
    const record = await refreshTokensRepository.create({
      userId: user.id, tokenHash: sha256(refreshToken), familyId, expiresAt,
    });
    return { session: { user: toPublic(user), accessToken: signAccessToken(user), refreshToken }, record };
  };

  const startSession = async (user) => {
    const { session } = await issueSession(
      user,
      crypto.randomUUID(),
      new Date(Date.now() + env.jwtRefreshHours * 3600 * 1000),
    );
    return session;
  };

  const register = async (rawEmail, password) => {
    if (typeof rawEmail !== 'string') throw new ValidationError('A valid email is required');
    const email = rawEmail.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email)) throw new ValidationError('A valid email is required');
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      throw new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    if (await usersRepository.findByEmail(email)) throw new ConflictError('Email is already registered');
    const passwordHash = await bcrypt.hash(password, env.bcryptCost);
    const user = await usersRepository.create(email, passwordHash);
    return startSession(user);
  };

  const login = async (rawEmail, password) => {
    if (typeof rawEmail !== 'string') throw new ValidationError('A valid email is required');
    if (typeof password !== 'string') throw new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    const email = rawEmail.trim().toLowerCase();
    const user = await usersRepository.findByEmail(email);
    // Always run bcrypt.compare — against the dummy hash when the user is unknown — so an
    // unknown-user login and a wrong-password login take the same time (spec §4). This MUST
    // be mirrored by the sibling .NET and Express services.
    const matches = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);
    if (!user || !matches) throw new UnauthorizedError('Invalid credentials');
    return startSession(user);
  };

  const refresh = async (refreshToken) => {
    if (typeof refreshToken !== 'string' || !refreshToken) throw new ValidationError('refreshToken is required');
    const record = await refreshTokensRepository.findByTokenHash(sha256(refreshToken));
    if (!record) throw new UnauthorizedError('Invalid refresh token');
    if (record.revokedAt) {
      // Reuse of a rotated token = theft signal: kill the whole family (spec §4).
      await refreshTokensRepository.revokeFamily(record.familyId);
      throw new UnauthorizedError('Refresh token reuse detected');
    }
    if (record.expiresAt.getTime() <= Date.now()) throw new UnauthorizedError('Refresh token expired');
    const user = await usersRepository.findById(record.userId);
    if (!user) throw new UnauthorizedError('Invalid refresh token');
    const { session, record: newRecord } = await issueSession(user, record.familyId, record.expiresAt);
    await refreshTokensRepository.revoke(record.id, newRecord.id);
    return session;
  };

  const logout = async (refreshToken) => {
    if (typeof refreshToken !== 'string' || !refreshToken) return;
    const record = await refreshTokensRepository.findByTokenHash(sha256(refreshToken));
    if (record) await refreshTokensRepository.revokeFamily(record.familyId);
  };

  return {
    register, login, refresh, logout,
  };
};

export { createAuthService };
