import type { Auth } from '../auth/session.ts';
import { getPlace } from '../db/places.ts';
import { createVisit, deleteVisit, listVisits, listVisitsForPlace } from '../db/visits.ts';
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

export function getPlaceVisits(auth: Auth, placeId: string): Response {
  if (!getPlace(auth.householdId, placeId)) return errorResponse('place not found', 404);
  return jsonResponse({ visits: listVisitsForPlace(auth.householdId, placeId) });
}

export function getVisits(url: URL, auth: Auth): Response {
  const limit = clampInt(url.searchParams.get('limit'), 1, VISITS_LIMIT_MAX, VISITS_LIMIT_DEFAULT);
  return jsonResponse({ visits: listVisits(auth.householdId, limit) });
}

/**
 * The whole body is optional: "we went here today" is a POST with `{}`. Visits are
 * append-only, so recording the same place twice creates two rows rather than editing one.
 */
export async function postPlaceVisit(req: Request, auth: Auth, placeId: string): Promise<Response> {
  if (!getPlace(auth.householdId, placeId)) return errorResponse('place not found', 404);

  const parsed = await readJson<{ visitedAt?: unknown; note?: unknown; rating?: unknown }>(req);
  if (!parsed.ok) return parsed.resp;

  try {
    const visit = createVisit(auth.householdId, placeId, auth.profile?.id ?? null, {
      visitedAt: optIsoDate(parsed.value.visitedAt, 'visitedAt') ?? new Date().toISOString(),
      note: optStr(parsed.value.note, 'note', MAX_NOTES),
      rating: optInt(parsed.value.rating, 'rating', 1, 5),
    });
    return jsonResponse({ visit, place: getPlace(auth.householdId, placeId) }, 201);
  } catch (e) {
    if (e instanceof ValidationError) return errorResponse(e.message);
    throw e;
  }
}

export function deleteVisitById(auth: Auth, id: string): Response {
  if (!deleteVisit(auth.householdId, id)) return errorResponse('visit not found', 404);
  return jsonResponse({ result: 'deleted' });
}
