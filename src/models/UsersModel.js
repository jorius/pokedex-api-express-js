// utils
import { NotImplementedError } from '../utils/errors/NotImplementedError.js';

/**
 * Data access for application users (auxiliary auth API),
 * executed against config/Database.js's pool.
 */

const findByEmail = async (_email) => {
  // TODO
  throw new NotImplementedError('UsersModel.findByEmail');
};

const insert = async (_user) => {
  // TODO: INSERT user with hashed password.
  throw new NotImplementedError('UsersModel.insert');
};

export { findByEmail, insert };
