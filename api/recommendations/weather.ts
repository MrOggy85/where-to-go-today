import { THRESHOLDS } from './config.ts';
import type { WeatherSnapshot } from '../services/weather.ts';

export type WetClass = 'dry' | 'rainy';
export type TempClass = 'cold' | 'cool' | 'comfortable' | 'hot' | 'very_hot';
export type WindClass = 'calm' | 'windy';

export interface WeatherClass {
  wet: WetClass;
  temp: TempClass;
  wind: WindClass;
  /** Set when it is 30C+ with no meaningful cloud cover, per the confirmed defaults. */
  exposedHeat: boolean;
}

/**
 * Classifies conditions rather than doing meteorology. Everything downstream reasons
 * about these four buckets, so swapping the weather source changes nothing else.
 */
export function classifyWeather(s: WeatherSnapshot | null): WeatherClass | null {
  if (!s) return null;

  const rainy = (s.precipitationMm ?? 0) >= THRESHOLDS.rainMm ||
    (s.precipitationProbability ?? 0) >= THRESHOLDS.rainProbability ||
    (s.condition ?? '').toLowerCase().includes('rain');

  const t = s.temperatureC;
  const temp: TempClass = t >= THRESHOLDS.veryHotC
    ? 'very_hot'
    : t >= THRESHOLDS.hotC
    ? 'hot'
    : t <= THRESHOLDS.coldC
    ? 'cold'
    : t <= THRESHOLDS.coolC
    ? 'cool'
    : 'comfortable';

  // Unknown cloud cover on a 30C+ day is treated as exposed: better to nudge the family
  // indoors than to recommend a shadeless park in full sun.
  const clear = (s.cloudCoverPercent ?? 0) <= THRESHOLDS.clearCloudPercent;

  return {
    wet: rainy ? 'rainy' : 'dry',
    temp,
    wind: (s.windKph ?? 0) >= THRESHOLDS.windyKph ? 'windy' : 'calm',
    exposedHeat: temp === 'very_hot' && clear,
  };
}

export function describeWeather(c: WeatherClass): string {
  const parts: string[] = [c.wet === 'rainy' ? 'Rain expected' : 'Dry'];
  if (c.temp === 'very_hot') parts.push('Very hot');
  else if (c.temp === 'hot') parts.push('Hot');
  else if (c.temp === 'cold') parts.push('Cold');
  else if (c.temp === 'cool') parts.push('Cool');
  else parts.push('Comfortable');
  if (c.wind === 'windy') parts.push('Windy');
  return parts.join(' · ');
}
