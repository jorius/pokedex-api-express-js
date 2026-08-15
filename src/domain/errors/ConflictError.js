// utils
import { HttpError } from './HttpError.js';

/**
 * Translated to HTTP 409 by the error handler middleware.
 */
class ConflictError extends HttpError {
  constructor(message = 'Conflict') {
    super(message, 409);
  }
}

export { ConflictError };
