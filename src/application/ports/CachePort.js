/**
 * String-valued cache with per-entry TTL. Implemented by MemoryCache (L1)
 * and RedisCache (L2); values are JSON strings so both tiers are symmetric.
 *
 * @typedef {object} CachePort
 * @property {(key: string) => Promise<string|null>} get
 * @property {(key: string, value: string, ttlSeconds: number) => Promise<void>} set
 */

export {};
