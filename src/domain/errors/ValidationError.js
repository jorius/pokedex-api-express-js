// utils
import { HttpError } from './HttpError.js';

/**
 * Translated to HTTP 400 by the error handler middleware.
 */
class ValidationError extends HttpError {
  constructor(message) {
    super(message, 400);
  }
}

export { ValidationError };
