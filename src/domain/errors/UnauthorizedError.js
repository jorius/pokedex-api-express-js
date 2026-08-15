// utils
import { HttpError } from './HttpError.js';

/**
 * Translated to HTTP 401 by the error handler middleware.
 */
class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

export { UnauthorizedError };
