/**
 * Every tunable number the recommendation engine uses. Adjust weights here rather than
 * editing engine.ts, so the scoring stays one readable table.
 */

/** PROJECT.md section 13: in range when drive OR train time is at most this. */
export const NORMAL_TRAVEL_MINUTES = 45;

/**
 * Recency, keyed on days since the last visit. Piecewise so the curve is readable: just
 * visited is a strong penalty, roughly a season away is a boost.
 */
export const RECENCY_STEPS: { maxDays: number; score: number; label: string }[] = [
  { maxDays: 2, score: -30, label: 'Just visited' },
  { maxDays: 9, score: -18, label: 'Visited very recently' },
  { maxDays: 32, score: -8, label: 'Visited fairly recently' },
  { maxDays: 90, score: 2, label: 'Not visited in a while' },
  { maxDays: Infinity, score: 12, label: 'Not visited in a long time' },
];

/** Confirmed default: never-visited places get only a small boost. */
export const NEVER_VISITED_BOOST = 6;

/** Multiplied by (priority - 1); priority 1 is normal and scores zero. */
export const PRIORITY_WEIGHT = 8;
export const MAX_PRIORITY = 5;

export const TRAVEL = {
  veryClose: { maxMinutes: 15, score: 8 },
  close: { maxMinutes: 30, score: 5 },
  normal: { maxMinutes: NORMAL_TRAVEL_MINUTES, score: 2 },
  far: { score: -10 },
};

export const WEATHER = {
  rain: { indoor: 15, mixed: 6, rainFriendlyOutdoor: 8 },
  veryHot: { indoor: 12, goodForHot: 8, shaded: 6, exposedOutdoor: -10 },
  hot: { indoor: 5, goodForHot: 5, shaded: 3 },
  cold: { indoor: 6, goodForCold: 6 },
  windy: { exposedOutdoor: -5 },
  pleasant: { outdoor: 6, mixed: 3 },
};

/** Thresholds for classifying a snapshot. */
export const THRESHOLDS = {
  rainProbability: 50,
  rainMm: 0.5,
  veryHotC: 30,
  hotC: 28,
  coldC: 5,
  coolC: 14,
  /** "No meaningful cloud cover" for the 30C+ rule. */
  clearCloudPercent: 40,
  windyKph: 30,
};

/** Reasons shown per card. Enough to explain, short enough to scan on a phone. */
export const MAX_REASONS = 4;

/** How many recommendations the Today endpoint returns by default. */
export const DEFAULT_LIMIT = 5;
export const MAX_LIMIT = 50;
