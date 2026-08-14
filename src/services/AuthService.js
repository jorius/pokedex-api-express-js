// utils
import { NotImplementedError } from '../utils/errors/NotImplementedError.js';

/**
 * User registration and authentication (JWT issuance) via models/UsersModel.
 */

const register = async (_payload) => {
  // TODO: uniqueness check, hash password, persist, issue token.
  throw new NotImplementedError('AuthService.register');
};

const login = async (_credentials) => {
  // TODO: verify credentials, issue JWT signed with env.jwtSecret.
  throw new NotImplementedError('AuthService.login');
};

export { register, login };
