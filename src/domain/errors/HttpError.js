/**
 * Base error carrying an HTTP status, translated by the error handler middleware.
 */
class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.name = new.target.name;
    this.status = status;
  }
}

export { HttpError };
