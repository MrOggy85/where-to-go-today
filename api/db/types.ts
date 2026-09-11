export type PlaceEnvironment = 'indoor' | 'outdoor' | 'mixed';
/** "Want to go" is not stored: it is `active` with no visits yet. */
export type PlaceStatus = 'active' | 'archived';
export type CostLevel = 'free' | 'low' | 'medium' | 'high';
export type Tristate = 'yes' | 'no' | 'unknown';

export interface Category {
  id: string;
  name: string;
}

/** A category plus how many places carry it, for the manage screen and delete warning. */
export interface CategoryWithCount extends Category {
  placeCount: number;
}

export interface Place {
  id: string;
  householdId: string;

  name: string;
  status: PlaceStatus;

  categories: Category[];
  /** Most recent photo ids, capped for list previews. The galleries fetch the full set. */
  photoIds: string[];
  environment: PlaceEnvironment;

  address?: string;
  latitude?: number;
  longitude?: number;

  googleMapsUrl?: string;
  websiteUrl?: string;

  driveMinutes?: number;
  trainMinutes?: number;
  typicalDurationHours?: number;
  costLevel?: CostLevel;

  goodForRain?: boolean;
  goodForHotWeather?: boolean;
  goodForColdWeather?: boolean;
  goodForWind?: boolean;
  shaded?: boolean;

  parking?: Tristate;
  foodAvailable?: Tristate;
  toilets?: Tristate;

  priority: number;

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

/** A list row: the visit plus everything it takes to render one without another query. */
export interface VisitWithPlace extends Visit {
  placeName: string;
  photoIds: string[];
}

export interface Photo {
  id: string;
  householdId: string;
  placeId: string;
  /** Absent when the photo belongs to the place but not to any one visit. */
  visitId?: string;

  filename: string;
  contentType: string;
  sizeBytes: number;
  width?: number;
  height?: number;

  capturedAt?: string;
  uploadedAt: string;
  uploadedByProfileId?: string;
}

/** Photo plus the place name, so the all-photos grid can label a tile without a join. */
export interface PhotoWithPlace extends Photo {
  placeName: string;
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
  typical_duration_hours: number | null;
  cost_level: string | null;
  good_for_rain: number | null;
  good_for_hot_weather: number | null;
  good_for_cold_weather: number | null;
  good_for_wind: number | null;
  shaded: number | null;
  parking: string | null;
  food_available: string | null;
  toilets: string | null;
  priority: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by_profile_id: string | null;
  last_visited_at: string | null;
  visit_count: number;
  /** JSON array of `{ id, name }`, built by the SELECT rather than a second query. */
  categories: string | null;
  /** JSON array of recent photo ids, for list-row thumbnails. */
  photo_ids: string | null;
}
