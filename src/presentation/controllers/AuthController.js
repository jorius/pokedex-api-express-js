// services
import { createAuthService } from '../../application/services/AuthService.js';
// config
import { env } from '../../infrastructure/config/Env.js';
// repositories
import { refreshTokensRepository } from '../../infrastructure/repositories/RefreshTokensRepository.js';
import { usersRepository } from '../../infrastructure/repositories/UsersRepository.js';
// utils
import { ok } from '../utils/Response.js';

/**
 * Thin HTTP layer for the auxiliary auth API.
 */

const authService = createAuthService({ usersRepository, refreshTokensRepository, env });

const register = async (req, res, next) => {
  try {
    res.status(201).json(ok(await authService.register(req.body.email, req.body.password)));
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    res.json(ok(await authService.login(req.body.email, req.body.password)));
  } catch (error) {
    next(error);
  }
};

export { register, login };
