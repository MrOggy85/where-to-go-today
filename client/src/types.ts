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

/** A list row: the visit plus everything it takes to render one without another request. */
export interface VisitWithPlace extends Visit {
  placeName: string;
  photoIds: string[];
}

export interface Photo {
  id: string;
  placeId: string;
  /** Absent when the photo belongs to the place but not to any one visit. */
  visitId?: string;
  placeName: string;
  contentType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  capturedAt?: string;
  uploadedAt: string;
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
