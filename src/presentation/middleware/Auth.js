// packages
import jwt from 'jsonwebtoken';

// config
import { env } from '../../infrastructure/config/Env.js';
// utils
import { UnauthorizedError } from '../../domain/errors/UnauthorizedError.js';

/**
 * Verifies the Bearer access token (HS256, shared secret across the three
 * pokedex services). Algorithm pinning is part of the cross-service contract.
 *
 * createAuthenticate is a factory over the JWT env slice so it can be unit
 * tested with a test env (real jwtSecret defaults to '' outside a configured
 * process, which jwt.sign rejects); `authenticate` below is the production
 * instance bound to the real env, and is what routes import.
 *
 * On success this middleware sets `req.user = { id: string, email: string }`
 * (the JWT's sub/email claims). There is no Express.d.ts augmentation in this
 * JS repo — `req.user` is documented here as the contract instead.
 *
 * @typedef {object} AuthMiddlewareEnv
 * @property {string} jwtSecret
 * @property {string} jwtIssuer
 * @property {string} jwtAudience
 */

/**
 * @param {AuthMiddlewareEnv} authEnv
 * @returns {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => void}
 */
const createAuthenticate = (authEnv) => (req, _res, next) => {
  const header = req.headers.authorization ?? '';
  const match = header.trim().match(/^Bearer\s+(\S+)$/);
  if (!match) {
    next(new UnauthorizedError('A Bearer access token is required'));
    return;
  }
  const [, token] = match;
  try {
    const payload = jwt.verify(token, authEnv.jwtSecret, {
      algorithms: ['HS256'],
      issuer: authEnv.jwtIssuer,
      audience: authEnv.jwtAudience,
    });
    if (typeof payload.sub !== 'string' || !payload.sub || typeof payload.email !== 'string' || !payload.email) {
      next(new UnauthorizedError('Invalid or expired access token'));
      return;
    }
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired access token'));
  }
};

const authenticate = createAuthenticate(env);

export { authenticate, createAuthenticate };
