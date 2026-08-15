// packages
import {
  afterEach, beforeEach, describe, expect, it, jest,
} from '@jest/globals';

// cache
import { createMemoryCache } from '../../infrastructure/cache/MemoryCache.js';

describe('MemoryCache', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns null on miss', async () => {
    const cache = createMemoryCache();
    expect(await cache.get('missing')).toBeNull();
  });

  it('returns stored value before TTL expires', async () => {
    const cache = createMemoryCache();
    await cache.set('key', 'value', 60);
    jest.advanceTimersByTime(59_000);
    expect(await cache.get('key')).toBe('value');
  });

  it('expires entries after TTL', async () => {
    const cache = createMemoryCache();
    await cache.set('key', 'value', 60);
    jest.advanceTimersByTime(61_000);
    expect(await cache.get('key')).toBeNull();
  });

  it('overwriting a key resets its TTL', async () => {
    const cache = createMemoryCache();
    await cache.set('key', 'first', 60);
    jest.advanceTimersByTime(50_000);
    await cache.set('key', 'second', 60);
    jest.advanceTimersByTime(50_000);
    expect(await cache.get('key')).toBe('second');
  });

  it('expires exactly at the TTL boundary', async () => {
    const cache = createMemoryCache();
    await cache.set('key', 'value', 60);
    jest.advanceTimersByTime(60_000);
    expect(await cache.get('key')).toBeNull();
  });

  it('never caches when ttlSeconds is 0', async () => {
    const cache = createMemoryCache();
    await cache.set('key', 'value', 0);
    expect(await cache.get('key')).toBeNull();
  });
});
