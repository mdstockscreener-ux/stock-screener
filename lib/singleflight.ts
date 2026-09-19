/**
 * Coalesces concurrent calls sharing the same key into one in-flight
 * promise. The Stock Analysis page fires its fundamentals/technicals/news
 * routes in parallel, and news internally needs the same fundamentals and
 * technicals data those other two routes are independently fetching — on a
 * cold cache (no row for the symbol yet today) every one of them reads
 * "not cached" before any of them has written, so without this they'd each
 * independently hit BharatStock for the same data. That's the exact
 * daily-quota waste sql/*_cache.sql exists to prevent (plan doc §7 — Free
 * tier is 50 calls/day).
 *
 * Scoped to one warm server process, same limit as lib/nseProxy.ts's
 * session cache — doesn't dedupe across separate serverless instances, but
 * still collapses the common case: one page load, one warm instance.
 */

const inFlight = new Map<string, Promise<unknown>>();

export function singleflight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) {
    console.log(`[singleflight] joining in-flight request: ${key}`);
    return existing as Promise<T>;
  }

  const promise = fn().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}
