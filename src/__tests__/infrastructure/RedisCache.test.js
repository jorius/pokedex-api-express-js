// packages
import {
  afterEach, beforeEach, describe, expect, it, jest,
} from '@jest/globals';

// cache
import { createRedisCache } from '../../infrastructure/cache/RedisCache.js';

const createFakeClient = (overrides = {}) => {
  const handlers = {};
  return {
    handlers,
    isReady: true,
    isOpen: true,
    on: jest.fn((event, handler) => { handlers[event] = handler; }),
    connect: jest.fn(async () => undefined),
    quit: jest.fn(async () => undefined),
    get: jest.fn(async () => 'cached'),
    set: jest.fn(async () => undefined),
    ...overrides,
  };
};

const silentLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

describe('RedisCache', () => {
  it('is a no-op when no url is configured', async () => {
    const cache = createRedisCache({ url: '', logger: silentLogger, clientFactory: () => { throw new Error('must not create client'); } });
    await cache.connect();
    await cache.set('k', 'v', 60);
    expect(await cache.get('k')).toBeNull();
  });

  it('reads and writes through the redis client when ready', async () => {
    const client = createFakeClient();
    const cache = createRedisCache({ url: 'redis://localhost:6379', logger: silentLogger, clientFactory: () => client });
    await cache.connect();
    await cache.set('k', 'v', 60);
    expect(client.set).toHaveBeenCalledWith('k', 'v', { EX: 60 });
    expect(await cache.get('k')).toBe('cached');
  });

  it('degrades instead of throwing when connect rejects immediately, warning exactly once', async () => {
    const client = createFakeClient({
      isReady: false,
      connect: jest.fn(async () => { throw new Error('ECONNREFUSED'); }),
    });
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const cache = createRedisCache({ url: 'redis://localhost:6379', logger, clientFactory: () => client });
    await cache.connect();
    expect(await cache.get('k')).toBeNull();
    await cache.set('k', 'v', 60);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('degrades to null when a command throws mid-flight', async () => {
    const client = createFakeClient({ get: jest.fn(async () => { throw new Error('boom'); }) });
    const cache = createRedisCache({ url: 'redis://localhost:6379', logger: silentLogger, clientFactory: () => client });
    await cache.connect();
    expect(await cache.get('k')).toBeNull();
  });

  describe('bootstrap timeout', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('does not hang connect() when redis never settles (default reconnectStrategy retries forever)', async () => {
      let rejectInBackground = () => undefined;
      const neverSettlingConnect = jest.fn(() => new Promise((_resolve, reject) => { rejectInBackground = reject; }));
      const client = createFakeClient({ isReady: false, connect: neverSettlingConnect });
      const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
      const cache = createRedisCache({
        url: 'redis://localhost:6379', logger, clientFactory: () => client, connectTimeoutMs: 2000,
      });

      const connectPromise = cache.connect();
      await jest.advanceTimersByTimeAsync(2000);
      await connectPromise;

      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(await cache.get('k')).toBeNull();

      // Settle the background attempt afterwards so it doesn't leak an unhandled rejection.
      rejectInBackground(new Error('background ECONNREFUSED'));
    });
  });

  it('warns exactly once and never throws when the client emits a spontaneous background error', async () => {
    const client = createFakeClient();
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    createRedisCache({ url: 'redis://localhost:6379', logger, clientFactory: () => client });

    const { handlers } = client;
    expect(() => handlers.error(new Error('connection reset'))).not.toThrow();

    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('close quits an open client', async () => {
    const client = createFakeClient();
    const cache = createRedisCache({ url: 'redis://localhost:6379', logger: silentLogger, clientFactory: () => client });
    await cache.connect();
    await cache.close();
    expect(client.quit).toHaveBeenCalledTimes(1);
  });

  it('close does not quit a client that was never opened', async () => {
    const client = createFakeClient({ isOpen: false });
    const cache = createRedisCache({ url: 'redis://localhost:6379', logger: silentLogger, clientFactory: () => client });
    await cache.close();
    expect(client.quit).not.toHaveBeenCalled();
  });

  it('close is safe when no url is configured', async () => {
    const noUrl = createRedisCache({ url: '', logger: silentLogger });
    await expect(noUrl.close()).resolves.toBeUndefined();
  });
});
