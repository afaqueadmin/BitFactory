/// <filename>src/lib/cache.ts</filename>
/**
 * Cache abstraction layer for wallet data
 *
 * Supports in-memory cache (default) and Redis adapter (future)
 * TTL: 10 minutes by default (configurable via WALLET_CACHE_TTL env var)
 *
 * Cache key format: wallet_${userId}_${currency}
 *
 * Usage:
 * ```typescript
 * import { walletCache } from '@/lib/cache';
 *
 * // Get
 * const cached = walletCache.get(`wallet_${userId}_BTC`);
 *
 * // Set
 * walletCache.set(`wallet_${userId}_BTC`, paymentSettings);
 *
 * // Invalidate
 * walletCache.invalidate(`wallet_${userId}_BTC`);
 * ```
 */

export interface ICacheBackend {
  get(key: string): unknown | null;
  set(key: string, data: unknown, ttlSeconds?: number): void;
  invalidate(key: string): void;
  invalidatePattern(pattern: RegExp): void;
}

/**
 * In-memory cache implementation
 */
class InMemoryCache implements ICacheBackend {
  private cache: Map<string, { data: unknown; expiresAt: number }> = new Map();
  private ttl: number; // milliseconds

  constructor(ttlSeconds: number = 600) {
    if (ttlSeconds <= 0) {
      throw new Error("TTL must be positive");
    }
    this.ttl = ttlSeconds * 1000;
  }

  get(key: string): unknown | null {
    const entry = this.cache.get(key);
    if (!entry) {
      console.log(`[Cache] MISS: ${key}`);
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      console.log(`[Cache] EXPIRED: ${key}`);
      this.cache.delete(key);
      return null;
    }

    console.log(`[Cache] HIT: ${key}`);
    return entry.data;
  }

  set(key: string, data: unknown, ttlSeconds?: number): void {
    const effectiveTtl = (ttlSeconds || this.ttl / 1000) * 1000;
    const expiresAt = Date.now() + effectiveTtl;
    this.cache.set(key, { data, expiresAt });
    console.log(
      `[Cache] SET: ${key} (expires in ${ttlSeconds || this.ttl / 1000}s)`,
    );
  }

  invalidate(key: string): void {
    const deleted = this.cache.delete(key);
    if (deleted) {
      console.log(`[Cache] INVALIDATED: ${key}`);
    }
  }

  invalidatePattern(pattern: RegExp): void {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    console.log(
      `[Cache] INVALIDATED PATTERN: ${pattern.source} (${count} entries)`,
    );
  }

  /**
   * Clear all cached data (useful for testing or on deployment restart)
   */
  clear(): void {
    this.cache.clear();
    console.log("[Cache] CLEARED all entries");
  }

  /**
   * Get cache stats for monitoring
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

/**
 * Redis cache adapter (stub for future implementation)
 * To enable Redis, set CACHE_BACKEND=redis in .env
 */
class RedisCache implements ICacheBackend {
  // TODO: Implement Redis adapter
  // For now, constructor will throw if Redis is selected without implementation

  constructor(_ttlSeconds: number = 600) {
    throw new Error(
      "Redis cache backend not yet implemented. Use CACHE_BACKEND=memory",
    );
  }

  get(_key: string): unknown | null {
    throw new Error("Not implemented");
  }

  set(_key: string, _data: unknown, _ttlSeconds?: number): void {
    throw new Error("Not implemented");
  }

  invalidate(_key: string): void {
    throw new Error("Not implemented");
  }

  invalidatePattern(_pattern: RegExp): void {
    throw new Error("Not implemented");
  }
}

/**
 * Factory function to create cache backend
 *
 * Environment variables:
 * - CACHE_BACKEND: 'memory' (default) or 'redis'
 * - WALLET_CACHE_TTL: TTL in seconds (default: 600 = 10 minutes)
 */
function createCacheBackend(): ICacheBackend {
  const backend = process.env.CACHE_BACKEND || "memory";
  const ttl = parseInt(process.env.WALLET_CACHE_TTL || "600", 10);

  console.log(`[Cache] Initializing ${backend} backend with TTL ${ttl}s`);

  if (backend === "redis") {
    return new RedisCache(ttl);
  }

  return new InMemoryCache(ttl);
}

// Export singleton instance
export const walletCache = createCacheBackend();
