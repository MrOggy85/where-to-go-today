import {
  type Auth,
  clearedCookie,
  createSession,
  destroySession,
  selectProfile,
  sessionCookie,
  withCookie,
} from '../auth/session.ts';
import { loginAllowed, resetLoginAttempts } from '../auth/guard.ts';
import { verifyPassword } from '../auth/password.ts';
import { getHousehold, getProfile, listProfiles } from '../db/households.ts';
import { errorResponse, jsonResponse, readJson } from '../db/validate.ts';
import logger from '../logger.ts';

const MAX_PASSWORD = 200;

/** Profiles are only listed after the password check, so names do not leak pre-auth. */
export function getMe(auth: Auth | null): Response {
  if (!auth) return jsonResponse({ authenticated: false }, 200);

  return jsonResponse({
    authenticated: true,
    household: { id: auth.householdId },
    profile: auth.profile,
    profiles: listProfiles(auth.householdId),
  });
}

export async function postLogin(req: Request, ip: string): Promise<Response> {
  if (!loginAllowed(ip)) return errorResponse('too many attempts, try again later', 429);

  const parsed = await readJson<{ password?: unknown }>(req);
  if (!parsed.ok) return parsed.resp;

  const password = parsed.value.password;
  if (typeof password !== 'string' || !password || password.length > MAX_PASSWORD) {
    return errorResponse('invalid credentials', 401);
  }

  const household = getHousehold();
  if (!household) return errorResponse('no household configured, run make seed', 503);

  if (!await verifyPassword(password, household.passwordHash)) {
    logger.warn('login failed', { ip });
    return errorResponse('invalid credentials', 401);
  }

  resetLoginAttempts(ip);

  // Fresh session id on every login: nothing carries over from a previous one.
  const sessionId = createSession(household.id);
  logger.info('login succeeded', { ip });

  return withCookie(
    jsonResponse({ authenticated: true, household: { id: household.id }, profiles: listProfiles(household.id) }),
    sessionCookie(sessionId),
  );
}

export async function postProfile(req: Request, auth: Auth): Promise<Response> {
  const parsed = await readJson<{ profileId?: unknown }>(req);
  if (!parsed.ok) return parsed.resp;

  const profileId = parsed.value.profileId;
  if (typeof profileId !== 'string') return errorResponse('profileId is required');

  const profile = getProfile(auth.householdId, profileId);
  if (!profile) return errorResponse('unknown profile', 404);

  selectProfile(auth.sessionId, profile.id);
  return jsonResponse({ profile });
}

export function postLogout(auth: Auth | null): Response {
  if (auth) destroySession(auth.sessionId);
  return withCookie(jsonResponse({ authenticated: false }), clearedCookie());
}
