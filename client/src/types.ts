export type PlaceEnvironment = 'indoor' | 'outdoor' | 'mixed';
/** "Want to go" is not stored: it is `active` with no visits yet. */
export type PlaceStatus = 'active' | 'archived';
export type CostLevel = 'free' | 'low' | 'medium' | 'high';
export type Tristate = 'yes' | 'no' | 'unknown';

export interface Category {
  id: string;
  name: string;
}

/** The manage screen and the delete warning both need the usage count. */
export interface CategoryWithCount extends Category {
  placeCount: number;
}

export interface Place {
  id: string;
  householdId: string;
  name: string;
  status: PlaceStatus;
  categories: Category[];
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
  lastVisitedAt?: string;
  visitCount: number;
}

export interface Visit {
  id: string;
  placeId: string;
  visitedAt: string;
  note?: string;
  rating?: number;
  createdAt: string;
  createdByProfileId?: string;
}

export interface Profile {
  id: string;
  name: string;
}

export interface Me {
  authenticated: boolean;
  household?: { id: string };
  profile?: Profile | null;
  profiles?: Profile[];
}

export interface Recommendation {
  place: Place;
  score: number;
  reasons: string[];
}

export interface WeatherSummary {
  temperatureC: number;
  source: string;
  summary: string | null;
}

export interface TodayResponse {
  weather: WeatherSummary | null;
  recommendations: Recommendation[];
  totalPlaces: number;
  excludedCount: number;
}

/** What the Today page's manual weather picker holds. `undefined` means "not set". */
export interface WeatherPicks {
  temperatureC?: number;
  rain?: boolean;
  sunny?: boolean;
  windy?: boolean;
}
