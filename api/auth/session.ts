import { newId, nowIso, row, run } from '../db/db.ts';
import { getProfile } from '../db/households.ts';
import type { Profile } from '../db/types.ts';

export const COOKIE_NAME = 'wstd_session';
const SESSION_DAYS = 30;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

const SECURE = Deno.env.get('DEV') !== '1';

export interface Auth {
  sessionId: string;
  householdId: string;
  profile: Profile | null;
}

interface SessionRow {
  id: string;
  household_id: string;
  profile_id: string | null;
  expires_at: string;
}

function expiry() {
  return new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
}

function newToken() {
  // 256 bits of entropy, url-safe. crypto.randomUUID is only 122 bits.
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function createSession(householdId: string): string {
  const id = newToken();
  run(
    'INSERT INTO sessions (id, household_id, profile_id, created_at, expires_at) VALUES (?, ?, NULL, ?, ?)',
    id,
    householdId,
    nowIso(),
    expiry(),
  );
  return id;
}

export function selectProfile(sessionId: string, profileId: string) {
  run('UPDATE sessions SET profile_id = ? WHERE id = ?', profileId, sessionId);
}

export function destroySession(sessionId: string) {
  run('DELETE FROM sessions WHERE id = ?', sessionId);
}

/** Reads the session cookie and resolves it, or returns null. Expired rows are rejected. */
export function resolveAuth(req: Request): Auth | null {
  const id = readCookie(req, COOKIE_NAME);
  if (!id) return null;

  const s = row<SessionRow>('SELECT * FROM sessions WHERE id = ?', id);
  if (!s) return null;

  if (s.expires_at <= nowIso()) {
    destroySession(s.id);
    return null;
  }

  return {
    sessionId: s.id,
    householdId: s.household_id,
    profile: s.profile_id ? getProfile(s.household_id, s.profile_id) : null,
  };
}

export function sessionCookie(id: string) {
  const parts = [
    `${COOKIE_NAME}=${id}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_DAYS * 86_400}`,
  ];
  if (SECURE) parts.push('Secure');
  return parts.join('; ');
}

export function clearedCookie() {
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (SECURE) parts.push('Secure');
  return parts.join('; ');
}

export function withCookie(resp: Response, cookie: string) {
  const headers = new Headers(resp.headers);
  headers.append('set-cookie', cookie);
  return new Response(resp.body, { status: resp.status, headers });
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

export function purgeExpiredSessions() {
  run('DELETE FROM sessions WHERE expires_at <= ?', nowIso());
}

export function startSessionCleanup() {
  purgeExpiredSessions();
  const timer = setInterval(purgeExpiredSessions, CLEANUP_INTERVAL_MS);
  Deno.unrefTimer(timer);
}
