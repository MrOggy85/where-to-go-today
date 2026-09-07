import type { Place } from '../db/types.ts';
import type { WeatherSnapshot } from '../services/weather.ts';
import { classifyWeather, type WeatherClass } from './weather.ts';
import {
  DEFAULT_COOLDOWN_DAYS,
  MAX_REASONS,
  NEVER_VISITED_BOOST,
  PRIORITY_WEIGHT,
  RECENCY_STEPS,
  TRAVEL,
  WEATHER,
} from './config.ts';

export interface RecommendationContext {
  now: Date;
  weather: WeatherSnapshot | null;
  availableMinutes?: number;
  maxTravelMinutes?: number;
  preferredCategories?: string[];
}

export interface Recommendation {
  place: Place;
  /** Implementation detail; the UI shows reasons, not this. */
  score: number;
  reasons: string[];
}

export interface RecommendationResult {
  recommendations: Recommendation[];
  weatherClass: WeatherClass | null;
  /** How many places the eligibility filters removed, so the UI can say "3 filtered out". */
  excludedCount: number;
}

export function recommend(places: Place[], ctx: RecommendationContext, limit: number): RecommendationResult {
  const weatherClass = classifyWeather(ctx.weather);

  const eligible = places.filter((p) => isEligible(p, ctx, weatherClass));
  const scored = eligible.map((p) => scorePlace(p, ctx, weatherClass));

  // Ties broken by name so the list is stable between reloads on the same day.
  scored.sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name));

  return {
    recommendations: scored.slice(0, limit),
    weatherClass,
    excludedCount: places.length - eligible.length,
  };
}

/** Conservative: missing metadata means "unknown", never "exclude". */
function isEligible(p: Place, ctx: RecommendationContext, w: WeatherClass | null): boolean {
  if (p.status === 'archived') return false;

  if (ctx.maxTravelMinutes !== undefined) {
    const best = bestTravelMinutes(p);
    if (best !== null && best > ctx.maxTravelMinutes) return false;
  }

  if (ctx.availableMinutes !== undefined && p.typicalDurationMinutes !== undefined) {
    if (p.typicalDurationMinutes > ctx.availableMinutes) return false;
  }

  // Rain rules out outdoor-only places unless they are explicitly rain-friendly.
  if (w?.wet === 'rainy' && p.environment === 'outdoor' && !p.goodForRain) return false;

  return true;
}

function bestTravelMinutes(p: Place): number | null {
  const times = [p.driveMinutes, p.trainMinutes].filter((t): t is number => t !== undefined);
  return times.length ? Math.min(...times) : null;
}

export function daysSince(iso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
}

function scorePlace(place: Place, ctx: RecommendationContext, w: WeatherClass | null): Recommendation {
  let score = 0;
  // Grouped so the most decision-relevant reasons survive the MAX_REASONS cut.
  const weatherReasons: string[] = [];
  const recencyReasons: string[] = [];
  const travelReasons: string[] = [];
  const extraReasons: string[] = [];

  // ---- weather fit ----
  if (w) {
    if (w.wet === 'rainy') {
      if (place.environment === 'indoor') {
        score += WEATHER.rain.indoor;
        weatherReasons.push('Indoor', 'Rain expected');
      } else if (place.environment === 'mixed') {
        score += WEATHER.rain.mixed;
        weatherReasons.push('Has indoor space', 'Rain expected');
      } else if (place.goodForRain) {
        score += WEATHER.rain.rainFriendlyOutdoor;
        weatherReasons.push('Fine in the rain');
      }
    }

    if (w.temp === 'very_hot') {
      if (place.environment === 'indoor') {
        score += WEATHER.veryHot.indoor;
        weatherReasons.push('Indoor', 'Very hot today');
      } else {
        if (place.goodForHotWeather) {
          score += WEATHER.veryHot.goodForHot;
          weatherReasons.push('Good on a hot day');
        }
        if (place.shaded) {
          score += WEATHER.veryHot.shaded;
          weatherReasons.push('Shaded');
        } else if (w.exposedHeat && place.environment === 'outdoor') {
          score += WEATHER.veryHot.exposedOutdoor;
          weatherReasons.push('Hot and unshaded');
        }
      }
    } else if (w.temp === 'hot') {
      if (place.environment === 'indoor') score += WEATHER.hot.indoor;
      if (place.goodForHotWeather) {
        score += WEATHER.hot.goodForHot;
        weatherReasons.push('Good on a hot day');
      }
      if (place.shaded) score += WEATHER.hot.shaded;
    } else if (w.temp === 'cold') {
      // Cold alone never excludes an outdoor place, it only nudges the ranking.
      if (place.environment === 'indoor') {
        score += WEATHER.cold.indoor;
        weatherReasons.push('Indoor', 'Cold today');
      }
      if (place.goodForColdWeather) {
        score += WEATHER.cold.goodForCold;
        weatherReasons.push('Good in cold weather');
      }
    }

    if (w.wind === 'windy' && place.environment === 'outdoor' && !place.goodForWind) {
      score += WEATHER.windy.exposedOutdoor;
      weatherReasons.push('Exposed and windy');
    }

    if (w.wet === 'dry' && (w.temp === 'comfortable' || w.temp === 'cool')) {
      if (place.environment === 'outdoor') {
        score += WEATHER.pleasant.outdoor;
        weatherReasons.push('Good weather to be outside');
      } else if (place.environment === 'mixed') {
        score += WEATHER.pleasant.mixed;
      }
    }
  }

  // ---- recency / novelty ----
  if (!place.lastVisitedAt) {
    score += NEVER_VISITED_BOOST;
    recencyReasons.push('Never visited');
  } else {
    const days = daysSince(place.lastVisitedAt, ctx.now);
    const cooldown = place.preferredCooldownDays ?? DEFAULT_COOLDOWN_DAYS;
    const step = RECENCY_STEPS.find((s) => days / cooldown < s.maxFraction) ?? RECENCY_STEPS.at(-1)!;
    score += step.score;
    recencyReasons.push(describeLastVisit(days));
  }

  // ---- travel time fit ----
  const travel = bestTravelMinutes(place);
  if (travel !== null) {
    if (travel <= TRAVEL.veryClose.maxMinutes) score += TRAVEL.veryClose.score;
    else if (travel <= TRAVEL.close.maxMinutes) score += TRAVEL.close.score;
    else if (travel <= TRAVEL.normal.maxMinutes) score += TRAVEL.normal.score;
    else score += TRAVEL.far.score;
    travelReasons.push(describeTravel(place));
  }

  // ---- household priority ----
  if (place.priority > 1) {
    score += (place.priority - 1) * PRIORITY_WEIGHT;
    extraReasons.push(place.priority >= 3 ? 'Favourite' : 'We like this one');
  }

  if (place.status === 'want_to_go') extraReasons.push('On the want-to-go list');

  const reasons = dedupe([...weatherReasons, ...recencyReasons, ...travelReasons, ...extraReasons]);

  return { place, score: Math.round(score), reasons: reasons.slice(0, MAX_REASONS) };
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}

export function describeLastVisit(days: number): string {
  if (days <= 0) return 'Visited today';
  if (days === 1) return 'Visited yesterday';
  if (days < 14) return `Last visited ${days} days ago`;
  if (days < 60) return `Last visited ${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `Last visited ${Math.round(days / 30)} months ago`;
  return `Last visited ${Math.floor(days / 365)}+ years ago`;
}

function describeTravel(p: Place): string {
  const parts: string[] = [];
  if (p.driveMinutes !== undefined) parts.push(`${p.driveMinutes} min drive`);
  if (p.trainMinutes !== undefined) parts.push(`${p.trainMinutes} min by train`);
  return parts.join(' · ');
}
