/** A fixed-window counter per key. `hit` counts one attempt and says whether it is allowed. */
export interface Limiter {
  hit(key: string): Promise<boolean>;
  reset(key: string): Promise<void>;
}

const PRUNE_AT = 10_000;

/**
 * In-memory, which is fine for one process and one household: the Deno server. A Worker
 * runs in many isolates at once, so it plugs in shared limiters instead (`cloudflare/src`).
 * Expired buckets are swept only once the map grows, so a quiet day costs nothing.
 */
export function memoryLimiter(windowMs: number, max: number): Limiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    hit(key) {
      const now = Date.now();
      if (buckets.size > PRUNE_AT) {
        for (const [k, e] of buckets) if (e.resetAt <= now) buckets.delete(k);
      }
      const entry = buckets.get(key);
      if (!entry || entry.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return Promise.resolve(true);
      }
      entry.count++;
      return Promise.resolve(entry.count <= max);
    },
    reset(key) {
      buckets.delete(key);
      return Promise.resolve();
    },
  };
}

// Per-IP login throttle: 10 attempts per 15 minutes.
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_ATTEMPTS = 10;

// Every request, not just logins. Generous enough for a photo grid loading at once, far below what a scanner sends.
export const REQUEST_WINDOW_MS = 60 * 1000;
export const MAX_REQUESTS = 600;

let loginLimiter: Limiter = memoryLimiter(LOGIN_WINDOW_MS, LOGIN_MAX_ATTEMPTS);

export function useLoginLimiter(l: Limiter) {
  loginLimiter = l;
}

export const loginAllowed = (ip: string) => loginLimiter.hit(ip);
export const resetLoginAttempts = (ip: string) => loginLimiter.reset(ip);

/**
 * CSRF defence for state-changing requests. The app is same-origin by design, so any
 * write carrying a foreign Origin is rejected. A missing Origin (curl, older clients)
 * is allowed because browsers always send it on cross-site writes.
 *
 * `expectedHost` is the host the client addressed, as the entry point knows it: behind
 * the Funnel sidecar that is the forwarded host, on a Worker the request URL's own.
 */
export function originAllowed(req: Request, expectedHost: string | null): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  if (!expectedHost) return false;

  try {
    return new URL(origin).host === expectedHost;
  } catch {
    return false;
  }
}
