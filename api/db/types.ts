export type PlaceEnvironment = 'indoor' | 'outdoor' | 'mixed';
export type PlaceStatus = 'want_to_go' | 'active' | 'archived';
export type CostLevel = 'free' | 'low' | 'medium' | 'high';
export type Tristate = 'yes' | 'no' | 'unknown';

export interface Place {
  id: string;
  householdId: string;

  name: string;
  status: PlaceStatus;

  categories: string[];
  environment: PlaceEnvironment;

  address?: string;
  latitude?: number;
  longitude?: number;

  googleMapsUrl?: string;
  websiteUrl?: string;

  driveMinutes?: number;
  trainMinutes?: number;
  typicalDurationMinutes?: number;
  costLevel?: CostLevel;

  goodForRain?: boolean;
  goodForHotWeather?: boolean;
  goodForColdWeather?: boolean;
  goodForWind?: boolean;
  shaded?: boolean;

  parking?: Tristate;
  strollerFriendly?: Tristate;
  foodAvailable?: Tristate;
  toilets?: Tristate;

  priority: number;
  preferredCooldownDays?: number;

  notes?: string;

  createdAt: string;
  updatedAt: string;
  createdByProfileId?: string;

  /** Derived with MAX(visits.visited_at); absent when never visited. */
  lastVisitedAt?: string;
  visitCount: number;
}

export interface Visit {
  id: string;
  householdId: string;
  placeId: string;

  visitedAt: string;

  note?: string;
  rating?: 1 | 2 | 3 | 4 | 5;

  createdAt: string;
  createdByProfileId?: string;
}

export interface Profile {
  id: string;
  name: string;
}

export interface Session {
  id: string;
  householdId: string;
  profileId: string | null;
  expiresAt: string;
}

/** Raw `places` row shape as node:sqlite returns it. */
export interface PlaceRow {
  id: string;
  household_id: string;
  name: string;
  status: string;
  environment: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  google_maps_url: string | null;
  website_url: string | null;
  drive_minutes: number | null;
  train_minutes: number | null;
  typical_duration_minutes: number | null;
  cost_level: string | null;
  good_for_rain: number | null;
  good_for_hot_weather: number | null;
  good_for_cold_weather: number | null;
  good_for_wind: number | null;
  shaded: number | null;
  parking: string | null;
  stroller_friendly: string | null;
  food_available: string | null;
  toilets: string | null;
  priority: number;
  preferred_cooldown_days: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by_profile_id: string | null;
  last_visited_at: string | null;
  visit_count: number;
  categories: string | null;
}
