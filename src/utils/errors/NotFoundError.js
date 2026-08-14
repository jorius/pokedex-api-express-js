/**
 * Translated to HTTP 404 by the error handler middleware.
 */
class NotFoundError extends Error {
  constructor(resource, key) {
    super(`${resource} with key '${key}' was not found`);
    this.name = 'NotFoundError';
    this.status = 404;
  }
}

export { NotFoundError };
