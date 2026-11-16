import type { Auth } from '../auth/session.ts';
import { getPlace } from '../db/places.ts';
import { createVisit, deleteVisit, getVisit, listVisits, listVisitsForPlace, updateVisit } from '../db/visits.ts';
import {
  clampInt,
  errorResponse,
  jsonResponse,
  MAX_NOTES,
  optInt,
  optIsoDate,
  optStr,
  readJson,
  ValidationError,
} from '../db/validate.ts';

const VISITS_LIMIT_DEFAULT = 50;
const VISITS_LIMIT_MAX = 200;
/** Far past any household's real history; only there to keep a silly offset out of SQL. */
const VISITS_OFFSET_MAX = 100_000;

export async function getPlaceVisits(auth: Auth, placeId: string): Promise<Response> {
  if (!await getPlace(auth.householdId, placeId)) return errorResponse('place not found', 404);
  return jsonResponse({ visits: await listVisitsForPlace(auth.householdId, placeId) });
}

/** The visits list. Paged by offset rather than a cursor; the order is fully deterministic. */
export async function getVisits(url: URL, auth: Auth): Promise<Response> {
  const limit = clampInt(url.searchParams.get('limit'), 1, VISITS_LIMIT_MAX, VISITS_LIMIT_DEFAULT);
  const offset = clampInt(url.searchParams.get('offset'), 0, VISITS_OFFSET_MAX, 0);
  return jsonResponse({ visits: await listVisits(auth.householdId, limit, offset) });
}

/**
 * The whole body is optional: "we went here today" is a POST with `{}`. Visits are
 * append-only, so recording the same place twice creates two rows rather than editing one.
 */
export async function postPlaceVisit(req: Request, auth: Auth, placeId: string): Promise<Response> {
  if (!await getPlace(auth.householdId, placeId)) return errorResponse('place not found', 404);

  const parsed = await readJson<{ visitedAt?: unknown; note?: unknown; rating?: unknown }>(req);
  if (!parsed.ok) return parsed.resp;

  try {
    const visit = await createVisit(auth.householdId, placeId, auth.profile?.id ?? null, {
      visitedAt: optIsoDate(parsed.value.visitedAt, 'visitedAt') ?? new Date().toISOString(),
      note: optStr(parsed.value.note, 'note', MAX_NOTES),
      rating: optInt(parsed.value.rating, 'rating', 1, 5),
    });
    return jsonResponse({ visit, place: await getPlace(auth.householdId, placeId) }, 201);
  } catch (e) {
    if (e instanceof ValidationError) return errorResponse(e.message);
    throw e;
  }
}

export async function getVisitById(auth: Auth, id: string): Promise<Response> {
  const visit = await getVisit(auth.householdId, id);
  if (!visit) return errorResponse('visit not found', 404);
  return jsonResponse({ visit, place: await getPlace(auth.householdId, visit.placeId) });
}

/**
 * Corrects the date or note of a recorded visit. The place is deliberately not editable:
 * somewhere else is a different visit.
 */
export async function putVisit(req: Request, auth: Auth, id: string): Promise<Response> {
  const existing = await getVisit(auth.householdId, id);
  if (!existing) return errorResponse('visit not found', 404);

  const parsed = await readJson<{ visitedAt?: unknown; note?: unknown; rating?: unknown }>(req);
  if (!parsed.ok) return parsed.resp;

  try {
    const visit = await updateVisit(auth.householdId, id, {
      visitedAt: optIsoDate(parsed.value.visitedAt, 'visitedAt') ?? existing.visitedAt,
      note: optStr(parsed.value.note, 'note', MAX_NOTES),
      rating: optInt(parsed.value.rating, 'rating', 1, 5),
    });
    return jsonResponse({ visit });
  } catch (e) {
    if (e instanceof ValidationError) return errorResponse(e.message);
    throw e;
  }
}

/** Photos survive: visit_id is ON DELETE SET NULL, so they stay on the place. */
export async function deleteVisitById(auth: Auth, id: string): Promise<Response> {
  if (!await deleteVisit(auth.householdId, id)) return errorResponse('visit not found', 404);
  return jsonResponse({ result: 'deleted' });
}
