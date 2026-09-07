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
