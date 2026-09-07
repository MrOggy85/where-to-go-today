/**
 * Weather is external data and lives behind this interface so the recommendation engine
 * never sees a provider's response shape.
 *
 * v1 ships only the manual provider: the Today page has rain/heat/wind pickers the user
 * sets themselves. A forecast provider (Open-Meteo or similar) can implement the same
 * interface later without touching the engine.
 */
export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface WeatherSnapshot {
  temperatureC: number;
  precipitationProbability?: number;
  precipitationMm?: number;
  windKph?: number;
  cloudCoverPercent?: number;
  condition?: string;
  /** Where the numbers came from, so the UI can say "you set this". */
  source: 'manual' | 'forecast';
  observedAt: string;
}

export interface WeatherProvider {
  getForecast(location: GeoPoint, at: Date): Promise<WeatherSnapshot>;
}

export interface ManualWeatherInput {
  temperatureC?: number;
  rain?: boolean;
  windy?: boolean;
  /** Set when the user says it is sunny; drives the 30C+ "too hot" rule. */
  sunny?: boolean;
}

/**
 * Builds a snapshot from the user's own picks. Returns null when nothing was picked, so
 * the engine can score without weather rather than invent a forecast.
 */
export function manualSnapshot(input: ManualWeatherInput): WeatherSnapshot | null {
  const picked = input.temperatureC !== undefined || input.rain !== undefined ||
    input.windy !== undefined || input.sunny !== undefined;
  if (!picked) return null;

  return {
    temperatureC: input.temperatureC ?? 20,
    precipitationProbability: input.rain === undefined ? undefined : input.rain ? 100 : 0,
    windKph: input.windy === undefined ? undefined : input.windy ? 35 : 5,
    cloudCoverPercent: input.sunny === undefined ? undefined : input.sunny ? 0 : 80,
    condition: input.rain ? 'rain' : input.sunny ? 'clear' : undefined,
    source: 'manual',
    observedAt: new Date().toISOString(),
  };
}
