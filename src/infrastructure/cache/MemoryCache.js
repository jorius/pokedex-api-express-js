/**
 * L1 cache: per-process TTL map. Lazy expiry (checked on read) — no timers,
 * so it never keeps the event loop alive.
 *
 * Expired-but-unread entries stay in the Map until their key is next read
 * (unbounded growth in theory), but the key space is bounded by PokeAPI's
 * page/detail routes, so no max-size/LRU eviction is needed here.
 *
 * @returns {import('../../application/ports/CachePort.js').CachePort}
 */
const createMemoryCache = () => {
  const entries = new Map();

  return {
    get: async (key) => {
      const entry = entries.get(key);
      if (!entry) return null;
      if (Date.now() >= entry.expiresAt) {
        entries.delete(key);
        return null;
      }
      return entry.value;
    },
    set: async (key, value, ttlSeconds) => {
      entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    },
  };
};

export { createMemoryCache };
