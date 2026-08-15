/**
 * Translated to HTTP 400 by the error handler middleware.
 */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

export { ValidationError };
