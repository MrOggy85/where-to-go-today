import { pingDb } from '../db/db.ts';
import { jsonResponse } from '../db/validate.ts';

/** Verifies the app can reach its storage. Deliberately unauthenticated and data-free. */
export function getHealth(): Response {
  try {
    pingDb();
    return jsonResponse({ ok: true });
  } catch {
    return jsonResponse({ ok: false, error: 'database unavailable' }, 503);
  }
}
