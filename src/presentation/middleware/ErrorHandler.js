// config
import { logger } from '../../infrastructure/config/Logger.js';
// utils
import { HttpError } from '../../domain/errors/HttpError.js';
import { fail } from '../utils/Response.js';

/**
 * Centralized error handling: HttpError subclasses carry a status (404 not found,
 * 400 malformed payload, 409 conflict, 401 unauthorized) and translate straight
 * through; body-parser errors (malformed JSON from express.json()) carry a bare
 * numeric status/statusCode without being an HttpError and are honored the same
 * way; anything else is a 500, logged server-side and reported generically so
 * internal error details never leak to the client.
 *
 * createErrorHandler is a factory over the logger so it can be unit tested
 * without the real console-backed logger; `errorHandler` below is the
 * production instance bound to the real logger, and is what App.js uses.
 */

const isBodyParserStatus = (value) => typeof value === 'number' && value >= 400 && value < 500;

/**
 * @param {object} deps
 * @param {import('../../infrastructure/config/Logger.js').LoggerLike} deps.logger
 */
const createErrorHandler = ({ logger: log }) => (error, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json(fail(error.name, error.message));
    return;
  }

  const rawStatus = error.status ?? error.statusCode;
  if (isBodyParserStatus(rawStatus)) {
    res.status(rawStatus).json(fail(error.name, 'Malformed request body'));
    return;
  }

  log.error(error.stack ?? error.message);
  res.status(500).json(fail('InternalServerError', 'An unexpected error occurred'));
};

const errorHandler = createErrorHandler({ logger });

export { errorHandler, createErrorHandler };
