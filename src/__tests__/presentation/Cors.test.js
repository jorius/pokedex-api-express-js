// packages
import {
  describe, expect, it, jest,
} from '@jest/globals';

// middleware
import { cors } from '../../presentation/middleware/Cors.js';

const createMockReq = (method) => ({ method });

const createMockRes = () => {
  const res = {};
  res.setHeader = jest.fn().mockReturnValue(res);
  res.status = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
};

describe('cors middleware', () => {
  it('answers a preflight OPTIONS request with 204, the CORS headers, and does not call next', () => {
    const req = createMockReq('OPTIONS');
    const res = createMockRes();
    const next = jest.fn();

    cors(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('sets the CORS headers and calls next for a non-preflight request', () => {
    const req = createMockReq('GET');
    const res = createMockRes();
    const next = jest.fn();

    cors(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    expect(res.status).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });
});
