// utils
import { fail } from '../utils/Response.js';

/**
 * JWT guard for protected routes. Public routes simply do not use this middleware.
 */
const requireAuth = (req, res, next) => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    res.status(401).json(fail('Unauthorized', 'Missing bearer token'));
    return;
  }

  // TODO: verify JWT signature/expiry and attach req.user.
  next();
};

export { requireAuth };
