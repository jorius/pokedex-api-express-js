// packages
import {
  describe, expect, it, jest,
} from '@jest/globals';

// middleware
import { createErrorHandler } from '../../presentation/middleware/ErrorHandler.js';
// utils
import { NotFoundError } from '../../domain/errors/NotFoundError.js';

const silentLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockReq = {};
const mockNext = jest.fn();

describe('errorHandler', () => {
  it('translates an HttpError to its own status and name', () => {
    const logger = { ...silentLogger, error: jest.fn() };
    const errorHandler = createErrorHandler({ logger });
    const res = createMockRes();
    const error = new NotFoundError('Pokemon', '999');

    errorHandler(error, mockReq, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      data: null, error: 'NotFoundError', msg: error.message, meta: null,
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('honors a body-parser-style error (status + entity.parse.failed) as a 400, not a 500', () => {
    const logger = { ...silentLogger, error: jest.fn() };
    const errorHandler = createErrorHandler({ logger });
    const res = createMockRes();
    const error = Object.assign(new Error('Unexpected token in JSON'), {
      status: 400,
      type: 'entity.parse.failed',
      name: 'SyntaxError',
    });

    errorHandler(error, mockReq, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      data: null, error: 'SyntaxError', msg: 'Malformed request body', meta: null,
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('reports a generic Error as a non-leaky 500 and logs it server-side', () => {
    const logger = { ...silentLogger, error: jest.fn() };
    const errorHandler = createErrorHandler({ logger });
    const res = createMockRes();
    const error = new Error('connection refused: Postgres is down');

    errorHandler(error, mockReq, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      data: null, error: 'InternalServerError', msg: 'An unexpected error occurred', meta: null,
    });
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(error.stack));
  });

  it('always returns the standard envelope shape (data/error/msg/meta)', () => {
    const logger = { ...silentLogger, error: jest.fn() };
    const errorHandler = createErrorHandler({ logger });
    const res = createMockRes();

    errorHandler(new Error('boom'), mockReq, res, mockNext);

    const [body] = res.json.mock.calls[0];
    expect(Object.keys(body).sort()).toEqual(['data', 'error', 'meta', 'msg']);
    expect(body.data).toBeNull();
    expect(body.meta).toBeNull();
  });
});
