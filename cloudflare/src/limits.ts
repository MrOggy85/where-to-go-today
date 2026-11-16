import { type Limiter, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS } from '../../api/auth/guard.ts';

/**
 * The login throttle, shared by every isolate: 10 attempts per address per 15 minutes,
 * counted in D1 in one statement so two concurrent attempts cannot both read a stale count.
 * Strict where it matters, unlike the Rate Limiting binding, which is per location and
 * approximate and only counts in 10 or 60 second windows.
 */
export function d1LoginLimiter(db: D1Database): Limiter {
  return {
    async hit(ip) {
      const now = Date.now();
      const r = await db.prepare(
        `INSERT INTO login_attempts (ip, count, reset_at) VALUES (?1, 1, ?2)
         ON CONFLICT(ip) DO UPDATE SET
           count    = CASE WHEN reset_at <= ?3 THEN 1 ELSE count + 1 END,
           reset_at = CASE WHEN reset_at <= ?3 THEN ?2 ELSE reset_at END
         RETURNING count`,
      ).bind(ip, now + LOGIN_WINDOW_MS, now).first<{ count: number }>();
      return (r?.count ?? 1) <= LOGIN_MAX_ATTEMPTS;
    },
    async reset(ip) {
      await db.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip).run();
    },
  };
}

export async function pruneLoginAttempts(db: D1Database) {
  await db.prepare('DELETE FROM login_attempts WHERE reset_at <= ?').bind(Date.now()).run();
}
