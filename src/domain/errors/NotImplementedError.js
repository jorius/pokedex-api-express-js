// utils
import { HttpError } from './HttpError.js';

/**
 * Scaffolding marker — thrown by stubs until the real logic is implemented (TDD).
 */
class NotImplementedError extends HttpError {
  constructor(feature) {
    super(`${feature} is not implemented yet`, 501);
  }
}

export { NotImplementedError };
