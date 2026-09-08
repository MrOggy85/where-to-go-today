import type { Auth } from '../auth/session.ts';
import {
  createPlace,
  deletePlace,
  getPlace,
  listCategories,
  listPlaces,
  type PlaceFilters,
  type PlaceInput,
  updatePlace,
} from '../db/places.ts';
import { listVisitsForPlace } from '../db/visits.ts';
import { MAX_PRIORITY } from '../recommendations/config.ts';
import {
  COST_LEVELS,
  ENVIRONMENTS,
  errorResponse,
  jsonResponse,
  MAX_ADDRESS,
  MAX_NAME,
  MAX_NOTES,
  MAX_URL,
  oneOf,
  optBool,
  optCategories,
  optFloat,
  optInt,
  optOneOf,
  optStr,
  readJson,
  STATUSES,
  str,
  TRISTATES,
  ValidationError,
} from '../db/validate.ts';

// deno-lint-ignore no-explicit-any
type Body = Record<string, any>;

/** Only name, environment and status have defaults; a sparse place is a valid place. */
function parsePlace(body: Body): PlaceInput {
  return {
    name: str(body.name, 'name', MAX_NAME),
    status: body.status === undefined ? 'active' : oneOf(body.status, 'status', STATUSES),
    environment: oneOf(body.environment, 'environment', ENVIRONMENTS),
    categories: optCategories(body.categories),
    address: optStr(body.address, 'address', MAX_ADDRESS),
    latitude: optFloat(body.latitude, 'latitude', -90, 90),
    longitude: optFloat(body.longitude, 'longitude', -180, 180),
    google_maps_url: optUrl(body.googleMapsUrl, 'googleMapsUrl'),
    website_url: optUrl(body.websiteUrl, 'websiteUrl'),
    drive_minutes: optInt(body.driveMinutes, 'driveMinutes', 0, 1440),
    train_minutes: optInt(body.trainMinutes, 'trainMinutes', 0, 1440),
    typical_duration_hours: optFloat(body.typicalDurationHours, 'typicalDurationHours', 0, 24),
    cost_level: optOneOf(body.costLevel, 'costLevel', COST_LEVELS),
    good_for_rain: optBool(body.goodForRain, 'goodForRain'),
    good_for_hot_weather: optBool(body.goodForHotWeather, 'goodForHotWeather'),
    good_for_cold_weather: optBool(body.goodForColdWeather, 'goodForColdWeather'),
    good_for_wind: optBool(body.goodForWind, 'goodForWind'),
    shaded: optBool(body.shaded, 'shaded'),
    parking: optOneOf(body.parking, 'parking', TRISTATES),
    food_available: optOneOf(body.foodAvailable, 'foodAvailable', TRISTATES),
    toilets: optOneOf(body.toilets, 'toilets', TRISTATES),
    priority: optInt(body.priority, 'priority', 1, MAX_PRIORITY) ?? 1,
    notes: optStr(body.notes, 'notes', MAX_NOTES),
  };
}

function optUrl(value: unknown, field: string): string | null {
  const s = optStr(value, field, MAX_URL);
  if (s === null) return null;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    throw new ValidationError(`${field} must be a valid URL`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ValidationError(`${field} must be http or https`);
  }
  return url.toString();
}

export function getPlaces(url: URL, auth: Auth): Response {
  const params = url.searchParams;
  const filters: PlaceFilters = {};

  try {
    const status = params.get('status');
    if (status) filters.status = oneOf(status, 'status', STATUSES);

    const environment = params.get('environment');
    if (environment) filters.environment = oneOf(environment, 'environment', ENVIRONMENTS);

    const category = params.get('category');
    if (category) filters.category = category.slice(0, 40);

    const q = params.get('q');
    if (q) filters.q = q.slice(0, 100);

    if (params.get('neverVisited') === 'true') filters.neverVisited = true;

    const notVisitedInDays = params.get('notVisitedInDays');
    if (notVisitedInDays) filters.notVisitedInDays = optInt(notVisitedInDays, 'notVisitedInDays', 0, 3650) ?? undefined;

    const minPriority = params.get('minPriority');
    if (minPriority) filters.minPriority = optInt(minPriority, 'minPriority', 1, MAX_PRIORITY) ?? undefined;
  } catch (e) {
    if (e instanceof ValidationError) return errorResponse(e.message);
    throw e;
  }

  return jsonResponse({
    places: listPlaces(auth.householdId, filters),
    categories: listCategories(auth.householdId),
  });
}

export function getPlaceById(auth: Auth, id: string): Response {
  const place = getPlace(auth.householdId, id);
  if (!place) return errorResponse('place not found', 404);
  return jsonResponse({ place, visits: listVisitsForPlace(auth.householdId, id) });
}

export async function postPlaces(req: Request, auth: Auth): Promise<Response> {
  const parsed = await readJson<Body>(req);
  if (!parsed.ok) return parsed.resp;

  try {
    const place = createPlace(auth.householdId, auth.profile?.id ?? null, parsePlace(parsed.value));
    return jsonResponse({ place }, 201);
  } catch (e) {
    if (e instanceof ValidationError) return errorResponse(e.message);
    throw e;
  }
}

/** Full replace: the client always sends the whole place back from the edit form. */
export async function putPlace(req: Request, auth: Auth, id: string): Promise<Response> {
  const parsed = await readJson<Body>(req);
  if (!parsed.ok) return parsed.resp;

  try {
    const place = updatePlace(auth.householdId, id, parsePlace(parsed.value));
    if (!place) return errorResponse('place not found', 404);
    return jsonResponse({ place });
  } catch (e) {
    if (e instanceof ValidationError) return errorResponse(e.message);
    throw e;
  }
}

export function deletePlaceById(auth: Auth, id: string): Response {
  const result = deletePlace(auth.householdId, id);
  if (result === 'missing') return errorResponse('place not found', 404);
  return jsonResponse({ result });
}
