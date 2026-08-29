import { redis } from "../redis";

// Thin wrapper so callers don't repeat JSON.stringify/parse and TTL logic.
// Cache failures degrade to "treat as a miss" rather than breaking the
// request — Redis being down should slow things down, not take the app down.

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // Swallow — caching is an optimization, not a correctness requirement.
  }
}

export async function cacheDel(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch {
    // no-op
  }
}
