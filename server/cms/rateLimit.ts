/**
 * Sliding-window rate limiter — in-memory, per-process.
 *
 * Used to throttle login attempts on `/api/cms/login`. The bucket key is a
 * `(client-ip, email)` tuple so a single attacker IP can be slowed down even
 * across many target accounts, AND a single account can be defended against
 * across many attacker IPs.
 *
 * Storage is a `Map<key, number[]>` of attempt timestamps. Old entries fall
 * out of the window lazily on each access; a periodic prune keeps the map
 * from growing unbounded for keys that go quiet.
 *
 * Why in-memory instead of Redis or a DB table?
 *   - The CMS deploys as a single Bun process (the SQLite trade-off applies
 *     equally to PG-backed deployments — admin login is rare, single-writer).
 *   - No external dep, no extra container.
 *   - Counter loss on restart is acceptable: an attacker who waits for a
 *     restart still has to start over from scratch on the next attempt set.
 */

export interface RateLimitDecision {
  ok: boolean
  /** When `ok === false`, ms until the oldest in-window attempt expires. */
  retryAfterMs: number
  /** Remaining slots in the current window (0 when blocked). */
  remaining: number
}

interface Bucket {
  /** Attempt timestamps in ms-since-epoch, oldest first. */
  attempts: number[]
}

export interface RateLimiterOptions {
  /** Maximum allowed attempts per window. */
  limit: number
  /** Sliding window duration in milliseconds. */
  windowMs: number
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>()
  private readonly options: RateLimiterOptions

  constructor(options: RateLimiterOptions) {
    if (options.limit < 1) throw new Error('RateLimiter: limit must be >= 1')
    if (options.windowMs < 1) throw new Error('RateLimiter: windowMs must be >= 1')
    this.options = options
  }

  /**
   * Record an attempt against `key` and return whether it is allowed under
   * the current sliding window. Always records — even on rejection — so a
   * sustained attacker doesn't get to retry the moment the oldest attempt
   * expires.
   *
   * Pass `now` explicitly in tests; production callers omit it.
   */
  consume(key: string, now: number = Date.now()): RateLimitDecision {
    const { limit, windowMs } = this.options
    const cutoff = now - windowMs

    let bucket = this.buckets.get(key)
    if (!bucket) {
      bucket = { attempts: [] }
      this.buckets.set(key, bucket)
    }

    // Drop attempts that have aged out of the window.
    if (bucket.attempts.length > 0 && bucket.attempts[0]! <= cutoff) {
      bucket.attempts = bucket.attempts.filter((t) => t > cutoff)
    }

    if (bucket.attempts.length >= limit) {
      const oldest = bucket.attempts[0]!
      return {
        ok: false,
        retryAfterMs: oldest + windowMs - now,
        remaining: 0,
      }
    }

    bucket.attempts.push(now)
    return {
      ok: true,
      retryAfterMs: 0,
      remaining: limit - bucket.attempts.length,
    }
  }

  /** Reset the bucket for `key` — call on successful login to give the user a fresh quota. */
  reset(key: string): void {
    this.buckets.delete(key)
  }

  /**
   * Drop empty / fully-aged-out buckets. Optional housekeeping; the per-call
   * filter in `consume()` already prevents stale data from affecting decisions.
   */
  prune(now: number = Date.now()): void {
    const cutoff = now - this.options.windowMs
    for (const [key, bucket] of this.buckets) {
      bucket.attempts = bucket.attempts.filter((t) => t > cutoff)
      if (bucket.attempts.length === 0) this.buckets.delete(key)
    }
  }

  /** Diagnostics — number of unique keys currently tracked. */
  size(): number {
    return this.buckets.size
  }
}

/**
 * Singleton rate limiter for the login endpoint.
 *
 * 5 attempts per 15-minute window per (ip, email) tuple. This blocks botnet
 * credential stuffing without burning legitimate users who fat-finger their
 * password a few times in a row.
 */
export const loginRateLimit = new RateLimiter({
  limit: 5,
  windowMs: 15 * 60 * 1000,
})
