// services
import * as AuthService from '../../application/services/AuthService.js';

// utils
import { ok } from '../utils/Response.js';

/**
 * Thin HTTP layer for the auxiliary auth API.
 */

const register = async (req, res, next) => {
  try {
    res.status(201).json(ok(await AuthService.register(req.body)));
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    res.json(ok(await AuthService.login(req.body)));
  } catch (error) {
    next(error);
  }
};

export { register, login };
