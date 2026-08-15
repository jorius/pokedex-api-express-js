// packages
import { describe, expect, it } from '@jest/globals';

// utils
import { ConflictError } from '../../domain/errors/ConflictError.js';
import { HttpError } from '../../domain/errors/HttpError.js';
import { UnauthorizedError } from '../../domain/errors/UnauthorizedError.js';

describe('domain errors', () => {
  it('UnauthorizedError carries status 401', () => {
    const error = new UnauthorizedError('nope');
    expect(error.status).toBe(401);
    expect(error.message).toBe('nope');
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error).toBeInstanceOf(HttpError);
  });

  it('UnauthorizedError defaults to message "Unauthorized"', () => {
    const error = new UnauthorizedError();
    expect(error.message).toBe('Unauthorized');
  });

  it('ConflictError carries status 409', () => {
    const error = new ConflictError('taken');
    expect(error.status).toBe(409);
    expect(error.message).toBe('taken');
    expect(error).toBeInstanceOf(ConflictError);
    expect(error).toBeInstanceOf(HttpError);
  });

  it('ConflictError defaults to message "Conflict"', () => {
    const error = new ConflictError();
    expect(error.message).toBe('Conflict');
  });
});
