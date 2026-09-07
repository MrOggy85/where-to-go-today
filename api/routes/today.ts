import type { Auth } from '../auth/session.ts';
import { listPlaces } from '../db/places.ts';
import { clampInt, errorResponse, jsonResponse } from '../db/validate.ts';
import { recommend } from '../recommendations/engine.ts';
import { describeWeather } from '../recommendations/weather.ts';
import { DEFAULT_LIMIT, MAX_LIMIT } from '../recommendations/config.ts';
import { manualSnapshot } from '../services/weather.ts';

function optFlag(params: URLSearchParams, name: string): boolean | undefined {
  const v = params.get(name);
  if (v === null) return undefined;
  return v === 'true' || v === '1';
}

/**
 * The product endpoint. Everything is optional: with no query params it answers "what
 * should we do today?" from place data alone, which is what the home screen loads.
 */
export function getToday(url: URL, auth: Auth): Response {
  const params = url.searchParams;

  const tempParam = params.get('temperatureC');
  const temperatureC = tempParam === null ? undefined : Number(tempParam);
  if (temperatureC !== undefined && (!Number.isFinite(temperatureC) || temperatureC < -60 || temperatureC > 60)) {
    return errorResponse('temperatureC is out of range');
  }

  const weather = manualSnapshot({
    temperatureC,
    rain: optFlag(params, 'rain'),
    windy: optFlag(params, 'windy'),
    sunny: optFlag(params, 'sunny'),
  });

  const availableMinutes = params.has('availableMinutes')
    ? clampInt(params.get('availableMinutes'), 15, 1440, 1440)
    : undefined;
  const maxTravelMinutes = params.has('maxTravelMinutes')
    ? clampInt(params.get('maxTravelMinutes'), 0, 1440, 45)
    : undefined;
  const limit = clampInt(params.get('limit'), 1, MAX_LIMIT, DEFAULT_LIMIT);

  // Archived places are dropped by the engine's eligibility filter, not here, so the
  // excluded count stays meaningful.
  const places = listPlaces(auth.householdId, {});

  const result = recommend(places, {
    now: new Date(),
    weather,
    availableMinutes,
    maxTravelMinutes,
  }, limit);

  return jsonResponse({
    weather: weather
      ? { ...weather, summary: result.weatherClass ? describeWeather(result.weatherClass) : null }
      : null,
    recommendations: result.recommendations,
    totalPlaces: places.length,
    excludedCount: result.excludedCount,
  });
}
