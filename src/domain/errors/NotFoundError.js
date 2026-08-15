// utils
import { HttpError } from './HttpError.js';

/**
 * Translated to HTTP 404 by the error handler middleware.
 */
class NotFoundError extends HttpError {
  constructor(resource, key) {
    super(`${resource} with key '${key}' was not found`, 404);
  }
}

export { NotFoundError };
