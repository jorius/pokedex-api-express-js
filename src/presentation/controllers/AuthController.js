// container
import { authService } from '../../Container.js';
// utils
import { ok } from '../utils/Response.js';

/**
 * Thin HTTP layer for the auxiliary auth API.
 */

const register = async (req, res, next) => {
  try {
    res.status(201).json(ok(await authService.register(req.body?.email, req.body?.password)));
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    res.json(ok(await authService.login(req.body?.email, req.body?.password)));
  } catch (error) {
    next(error);
  }
};

const refresh = async (req, res, next) => {
  try {
    res.json(ok(await authService.refresh(req.body?.refreshToken)));
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    await authService.logout(req.body?.refreshToken);
    res.json(ok(null, 'Logged out'));
  } catch (error) {
    next(error);
  }
};

export {
  register, login, refresh, logout,
};
