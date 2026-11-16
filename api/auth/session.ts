import { nowIso, row, run } from '../db/db.ts';
import { config } from '../config.ts';
import { getProfile } from '../db/households.ts';
import type { Profile } from '../db/types.ts';

export const COOKIE_NAME = 'wstd_session';
const SESSION_DAYS = 30;

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

export async function createSession(householdId: string): Promise<string> {
  const id = newToken();
  await run(
    'INSERT INTO sessions (id, household_id, profile_id, created_at, expires_at) VALUES (?, ?, NULL, ?, ?)',
    id,
    householdId,
    nowIso(),
    expiry(),
  );
  return id;
}

export async function selectProfile(sessionId: string, profileId: string) {
  await run('UPDATE sessions SET profile_id = ? WHERE id = ?', profileId, sessionId);
}

export async function destroySession(sessionId: string) {
  await run('DELETE FROM sessions WHERE id = ?', sessionId);
}

/** Reads the session cookie and resolves it, or returns null. Expired rows are rejected. */
export async function resolveAuth(req: Request): Promise<Auth | null> {
  const id = readCookie(req, COOKIE_NAME);
  if (!id) return null;

  const s = await row<SessionRow>('SELECT * FROM sessions WHERE id = ?', id);
  if (!s) return null;

  if (s.expires_at <= nowIso()) {
    await destroySession(s.id);
    return null;
  }

  return {
    sessionId: s.id,
    householdId: s.household_id,
    profile: s.profile_id ? await getProfile(s.household_id, s.profile_id) : null,
  };
}

const tags = new Map<string, string>();

/**
 * A short one-way tag for a session, for the logs. Lets a reader follow one session across requests and IPs without
 * the log ever holding the token: 48 bits of a SHA-256 of a 256-bit secret cannot be turned back into a cookie.
 */
export async function sessionTag(sessionId: string): Promise<string> {
  const cached = tags.get(sessionId);
  if (cached) return cached;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sessionId)));
  const tag = Array.from(digest.slice(0, 6), (b) => b.toString(16).padStart(2, '0')).join('');
  if (tags.size > 1000) tags.clear();
  tags.set(sessionId, tag);
  return tag;
}

export function sessionCookie(id: string) {
  const parts = [
    `${COOKIE_NAME}=${id}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_DAYS * 86_400}`,
  ];
  if (!config.dev) parts.push('Secure');
  return parts.join('; ');
}

export function clearedCookie() {
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (!config.dev) parts.push('Secure');
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

export async function purgeExpiredSessions() {
  await run('DELETE FROM sessions WHERE expires_at <= ?', nowIso());
}
