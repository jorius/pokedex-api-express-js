// utils
import { fail } from '../utils/Response.js';

/**
 * Centralized error handling: known errors carry a `status` (404 not found,
 * 400 malformed payload, 501 not implemented); anything else is a 500.
 */
const errorHandler = (error, _req, res, next) => {
  const status = error.status ?? 500;
  const msg = status === 500 ? 'An unexpected error occurred' : error.message;

  res.status(status).json(fail(error.name ?? 'InternalServerError', msg));
};

export { errorHandler };
