// packages
import jwt from 'jsonwebtoken';
import {
  describe, expect, it, jest,
} from '@jest/globals';

// middleware
import { createAuthenticate } from '../../presentation/middleware/Auth.js';
// utils
import { UnauthorizedError } from '../../domain/errors/UnauthorizedError.js';

const testEnv = {
  jwtSecret: 'test-secret-that-is-at-least-32-chars!!',
  jwtIssuer: 'pokedex-api',
  jwtAudience: 'pokedex-clients',
};

const authenticate = createAuthenticate(testEnv);

const createMockReq = (authorization) => ({
  headers: authorization === undefined ? {} : { authorization },
});

const mockRes = {};

const signValidToken = (overrides = {}) => jwt.sign(
  { email: 'ash@pallet.town' },
  testEnv.jwtSecret,
  {
    subject: 'user-1',
    issuer: testEnv.jwtIssuer,
    audience: testEnv.jwtAudience,
    expiresIn: '15m',
    ...overrides,
  },
);

describe('authenticate middleware', () => {
  it('rejects a request with no Authorization header', () => {
    const req = createMockReq(undefined);
    const next = jest.fn();

    authenticate(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('rejects a non-Bearer scheme', () => {
    const req = createMockReq('Basic dXNlcjpwYXNz');
    const next = jest.fn();

    authenticate(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('rejects a token signed with the wrong secret', () => {
    const token = jwt.sign({ email: 'ash@pallet.town' }, 'a-completely-different-secret-value', {
      subject: 'user-1', issuer: testEnv.jwtIssuer, audience: testEnv.jwtAudience, expiresIn: '15m',
    });
    const req = createMockReq(`Bearer ${token}`);
    const next = jest.fn();

    authenticate(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('rejects an expired token', () => {
    const token = signValidToken({ expiresIn: -10 });
    const req = createMockReq(`Bearer ${token}`);
    const next = jest.fn();

    authenticate(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('rejects an alg:none tampered token', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      sub: 'user-1', email: 'ash@pallet.town', iss: testEnv.jwtIssuer, aud: testEnv.jwtAudience,
    })).toString('base64url');
    const token = `${header}.${payload}.`;
    const req = createMockReq(`Bearer ${token}`);
    const next = jest.fn();

    authenticate(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('accepts a valid token and attaches req.user', () => {
    const token = signValidToken();
    const req = createMockReq(`Bearer ${token}`);
    const next = jest.fn();

    authenticate(req, mockRes, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toEqual({ id: 'user-1', email: 'ash@pallet.town' });
  });

  it('rejects a signed token missing the email claim', () => {
    const token = jwt.sign({}, testEnv.jwtSecret, {
      subject: 'user-1', issuer: testEnv.jwtIssuer, audience: testEnv.jwtAudience, expiresIn: '15m',
    });
    const req = createMockReq(`Bearer ${token}`);
    const next = jest.fn();

    authenticate(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    expect(req.user).toBeUndefined();
  });

  it('rejects a signed token missing the sub claim', () => {
    const token = jwt.sign({ email: 'ash@pallet.town' }, testEnv.jwtSecret, {
      issuer: testEnv.jwtIssuer, audience: testEnv.jwtAudience, expiresIn: '15m',
    });
    const req = createMockReq(`Bearer ${token}`);
    const next = jest.fn();

    authenticate(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    expect(req.user).toBeUndefined();
  });

  it('rejects a token signed with the wrong issuer', () => {
    const token = signValidToken({ issuer: 'a-different-issuer' });
    const req = createMockReq(`Bearer ${token}`);
    const next = jest.fn();

    authenticate(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('rejects a token signed with the wrong audience', () => {
    const token = signValidToken({ audience: 'a-different-audience' });
    const req = createMockReq(`Bearer ${token}`);
    const next = jest.fn();

    authenticate(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('rejects a Bearer header with trailing junk after the token', () => {
    const token = signValidToken();
    const req = createMockReq(`Bearer ${token} extra-junk`);
    const next = jest.fn();

    authenticate(req, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });
});
