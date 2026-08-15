// packages
import { createClient } from 'redis';

/**
 * @typedef {import('../config/Logger.js').LoggerLike} LoggerLike
 * @typedef {import('../../application/ports/CachePort.js').CachePort} CachePort
 */

/**
 * @typedef {object} RedisClientLike
 * @property {boolean} isReady
 * @property {boolean} isOpen
 * @property {(event: string, handler: (error: Error) => void) => unknown} on
 * @property {() => Promise<unknown>} connect
 * @property {() => Promise<unknown>} quit
 * @property {(key: string) => Promise<string|null>} get
 * @property {(key: string, value: string, options: { EX: number }) => Promise<unknown>} set
 */

/**
 * @typedef {object} RedisCacheOptions
 * @property {string} url
 * @property {LoggerLike} logger
 * @property {(options: { url: string }) => RedisClientLike} [clientFactory]
 * @property {number} [connectTimeoutMs]
 */

/**
 * @typedef {CachePort & { connect: () => Promise<void>, close: () => Promise<void> }} RedisCache
 */

/**
 * @param {{ url: string }} options
 * @returns {RedisClientLike}
 */
const defaultClientFactory = (options) => createClient({ url: options.url });

/**
 * L2 cache: Redis-backed, fully optional infrastructure. The owner may not
 * have Redis installed or running at all, so every failure mode — no url
 * configured, connection refused, or a command throwing mid-flight —
 * degrades silently to a no-op/null rather than throwing. Callers therefore
 * always fall through to L1 (MemoryCache) and, beyond that, the network.
 * Background reconnection is left entirely to the redis client's own
 * reconnectStrategy — this adapter never disables or replaces it, so
 * isReady-gated get/set resume serving automatically once Redis comes back.
 *
 * warnOnce fires at most once per RedisCache instance's lifetime: if Redis
 * recovers and then drops again later, that second outage is intentionally
 * not re-logged (avoids log spam across flaky connectivity).
 *
 * @param {RedisCacheOptions} options
 * @returns {RedisCache}
 */
const createRedisCache = ({
  url, logger, clientFactory = defaultClientFactory, connectTimeoutMs = 2000,
}) => {
  if (url === '') {
    return {
      connect: async () => undefined,
      close: async () => undefined,
      get: async () => null,
      set: async () => undefined,
    };
  }

  const client = clientFactory({ url });

  let warned = false;
  const warnOnce = (error) => {
    if (warned) return;
    warned = true;
    logger.warn(`Redis unavailable — running on L1 cache only (${error.message})`);
  };

  client.on('error', warnOnce);

  return {
    // node-redis v6's default reconnectStrategy retries forever, so connect()
    // may never settle when Redis is unreachable (e.g. ECONNREFUSED with no
    // listener). Bootstrap must not hang on that, so we race it against an
    // unref'd timeout: the connect attempt keeps running in the background
    // (its reconnectStrategy still drives future recovery) but we stop
    // waiting on it after connectTimeoutMs and report degraded if it hasn't
    // become ready by then.
    connect: async () => {
      try {
        const attempt = client.connect();
        attempt.catch(() => undefined); // observed here so it's never an unhandled rejection later
        await Promise.race([
          attempt.then(() => undefined),
          new Promise((resolve) => { setTimeout(resolve, connectTimeoutMs).unref?.(); }),
        ]);
      } catch (error) {
        warnOnce(error);
        return;
      }
      if (!client.isReady) warnOnce(new Error('connection not ready — continuing without Redis'));
    },
    close: async () => {
      if (client.isOpen) await client.quit();
    },
    get: async (key) => {
      if (!client.isReady) return null;
      try {
        return await client.get(key);
      } catch (error) {
        warnOnce(error);
        return null;
      }
    },
    // ttlSeconds > 0 is the caller's responsibility to guarantee (as with
    // MemoryCache); an invalid TTL is rejected by the redis client and
    // swallowed here exactly like any other command failure.
    set: async (key, value, ttlSeconds) => {
      if (!client.isReady) return;
      try {
        await client.set(key, value, { EX: ttlSeconds });
      } catch (error) {
        // Degraded — L1 still serves; do not propagate the failure.
        warnOnce(error);
      }
    },
  };
};

export { createRedisCache };
