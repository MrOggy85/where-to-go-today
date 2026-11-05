const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

const attempts = new Map<string, { count: number; resetAt: number }>();

/** Per-IP login throttle. In-memory is fine: one process, one household. */
export function loginAllowed(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);

  if (!entry || entry.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  entry.count++;
  return entry.count <= MAX_ATTEMPTS;
}

export function resetLoginAttempts(ip: string) {
  attempts.delete(ip);
}

// Every request, not just logins. Generous enough for a photo grid loading at once, far below what a scanner sends.
const REQUEST_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 600;
const PRUNE_AT = 10_000;

const requests = new Map<string, { count: number; resetAt: number }>();

/** Per-IP request throttle. Expired buckets are swept only once the map grows, so a quiet day costs nothing. */
export function requestAllowed(ip: string): boolean {
  const now = Date.now();
  if (requests.size > PRUNE_AT) {
    for (const [key, entry] of requests) if (entry.resetAt <= now) requests.delete(key);
  }

  const entry = requests.get(ip);
  if (!entry || entry.resetAt <= now) {
    requests.set(ip, { count: 1, resetAt: now + REQUEST_WINDOW_MS });
    return true;
  }

  entry.count++;
  return entry.count <= MAX_REQUESTS;
}

/**
 * CSRF defence for state-changing requests. The app is same-origin by design, so any
 * write carrying a foreign Origin is rejected. A missing Origin (curl, older clients)
 * is allowed because browsers always send it on cross-site writes.
 */
export function originAllowed(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;

  // Behind the reverse proxy the request URL carries the internal host, so trust the
  // forwarded host first and fall back to the Host header.
  const expected = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!expected) return false;

  try {
    return new URL(origin).host === expected;
  } catch {
    return false;
  }
}

// Opt-in, because an attacker can put anything in X-Forwarded-For and would otherwise get
// a fresh rate-limit bucket per request. Set TRUST_PROXY=1 only when a reverse proxy that
// overwrites the header sits in front.
const TRUST_PROXY = Deno.env.get('TRUST_PROXY') === '1';

export function getClientIp(req: Request, fallback: string): string {
  if (!TRUST_PROXY) return fallback;
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return fallback;
}
