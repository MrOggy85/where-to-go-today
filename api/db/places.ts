import { db, newId, nowIso, row, rows, run } from './db.ts';
import type { CostLevel, Place, PlaceEnvironment, PlaceRow, PlaceStatus, Tristate } from './types.ts';

// group_concat with a unit separator: categories are free text and may contain commas.
const SEP = String.fromCharCode(31);

const SELECT_PLACE = `
  SELECT p.*,
    (SELECT MAX(visited_at) FROM visits v WHERE v.place_id = p.id) AS last_visited_at,
    (SELECT COUNT(*) FROM visits v WHERE v.place_id = p.id) AS visit_count,
    (SELECT group_concat(category, char(31)) FROM place_categories c WHERE c.place_id = p.id) AS categories
  FROM places p
`;

function bool(v: number | null): boolean | undefined {
  return v === null ? undefined : v === 1;
}

function opt<T>(v: T | null): T | undefined {
  return v === null ? undefined : v;
}

export function toPlace(r: PlaceRow): Place {
  return {
    id: r.id,
    householdId: r.household_id,
    name: r.name,
    status: r.status as PlaceStatus,
    categories: r.categories ? r.categories.split(SEP).sort() : [],
    environment: r.environment as PlaceEnvironment,
    address: opt(r.address),
    latitude: opt(r.latitude),
    longitude: opt(r.longitude),
    googleMapsUrl: opt(r.google_maps_url),
    websiteUrl: opt(r.website_url),
    driveMinutes: opt(r.drive_minutes),
    trainMinutes: opt(r.train_minutes),
    typicalDurationHours: opt(r.typical_duration_hours),
    costLevel: opt(r.cost_level) as CostLevel | undefined,
    goodForRain: bool(r.good_for_rain),
    goodForHotWeather: bool(r.good_for_hot_weather),
    goodForColdWeather: bool(r.good_for_cold_weather),
    goodForWind: bool(r.good_for_wind),
    shaded: bool(r.shaded),
    parking: opt(r.parking) as Tristate | undefined,
    foodAvailable: opt(r.food_available) as Tristate | undefined,
    toilets: opt(r.toilets) as Tristate | undefined,
    priority: r.priority,
    notes: opt(r.notes),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    createdByProfileId: opt(r.created_by_profile_id),
    lastVisitedAt: opt(r.last_visited_at),
    visitCount: r.visit_count,
  };
}

export interface PlaceFilters {
  status?: PlaceStatus;
  environment?: PlaceEnvironment;
  category?: string;
  /** Case-insensitive substring match on name, address and notes. */
  q?: string;
  neverVisited?: boolean;
  /** Only places whose last visit is older than N days (never-visited included). */
  notVisitedInDays?: number;
  minPriority?: number;
}

export function listPlaces(householdId: string, f: PlaceFilters = {}): Place[] {
  const where = ['p.household_id = ?'];
  const params: unknown[] = [householdId];

  if (f.status) {
    where.push('p.status = ?');
    params.push(f.status);
  } else {
    // Archived places are out of the way by default but still reachable with status=archived.
    where.push("p.status != 'archived'");
  }

  if (f.environment) {
    where.push('p.environment = ?');
    params.push(f.environment);
  }

  if (f.category) {
    where.push('EXISTS (SELECT 1 FROM place_categories c WHERE c.place_id = p.id AND c.category = ?)');
    params.push(f.category.toLowerCase());
  }

  if (f.q) {
    where.push(
      "(p.name LIKE ? ESCAPE '\\' OR IFNULL(p.address,'') LIKE ? ESCAPE '\\' OR IFNULL(p.notes,'') LIKE ? ESCAPE '\\')",
    );
    const like = `%${f.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    params.push(like, like, like);
  }

  if (f.minPriority !== undefined) {
    where.push('p.priority >= ?');
    params.push(f.minPriority);
  }

  if (f.neverVisited) {
    where.push('NOT EXISTS (SELECT 1 FROM visits v WHERE v.place_id = p.id)');
  } else if (f.notVisitedInDays !== undefined) {
    where.push(
      "IFNULL((SELECT MAX(visited_at) FROM visits v WHERE v.place_id = p.id), '') < ?",
    );
    params.push(new Date(Date.now() - f.notVisitedInDays * 86_400_000).toISOString());
  }

  const sql = `${SELECT_PLACE} WHERE ${where.join(' AND ')} ORDER BY p.name COLLATE NOCASE ASC`;
  return rows<PlaceRow>(sql, ...params).map(toPlace);
}

export function getPlace(householdId: string, id: string): Place | null {
  const r = row<PlaceRow>(`${SELECT_PLACE} WHERE p.household_id = ? AND p.id = ?`, householdId, id);
  return r ? toPlace(r) : null;
}

/** Column values as they go into SQL: nulls, 0/1 for booleans. */
export interface PlaceInput {
  name: string;
  status: PlaceStatus;
  environment: PlaceEnvironment;
  categories: string[];
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
}

const COLUMNS = [
  'name',
  'status',
  'environment',
  'address',
  'latitude',
  'longitude',
  'google_maps_url',
  'website_url',
  'drive_minutes',
  'train_minutes',
  'typical_duration_hours',
  'cost_level',
  'good_for_rain',
  'good_for_hot_weather',
  'good_for_cold_weather',
  'good_for_wind',
  'shaded',
  'parking',
  'food_available',
  'toilets',
  'priority',
  'notes',
] as const;

function columnValues(input: PlaceInput) {
  return COLUMNS.map((c) => (input as unknown as Record<string, unknown>)[c] ?? null);
}

function replaceCategories(placeId: string, categories: string[]) {
  run('DELETE FROM place_categories WHERE place_id = ?', placeId);
  const stmt = db.prepare('INSERT OR IGNORE INTO place_categories (place_id, category) VALUES (?, ?)');
  for (const c of categories) stmt.run(placeId, c);
}

export function createPlace(householdId: string, profileId: string | null, input: PlaceInput): Place {
  const id = newId();
  const at = nowIso();

  const sql = `INSERT INTO places (id, household_id, ${
    COLUMNS.join(', ')
  }, created_at, updated_at, created_by_profile_id)
    VALUES (?, ?, ${COLUMNS.map(() => '?').join(', ')}, ?, ?, ?)`;

  db.exec('BEGIN');
  try {
    run(sql, id, householdId, ...columnValues(input), at, at, profileId);
    replaceCategories(id, input.categories);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  return getPlace(householdId, id)!;
}

export function updatePlace(householdId: string, id: string, input: PlaceInput): Place | null {
  const existing = getPlace(householdId, id);
  if (!existing) return null;

  const sql = `UPDATE places SET ${COLUMNS.map((c) => `${c} = ?`).join(', ')}, updated_at = ?
    WHERE household_id = ? AND id = ?`;

  db.exec('BEGIN');
  try {
    run(sql, ...columnValues(input), nowIso(), householdId, id);
    replaceCategories(id, input.categories);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  return getPlace(householdId, id);
}

export type DeleteResult = 'deleted' | 'archived' | 'missing';

/**
 * Places with visit history are archived, not destroyed: the diary is the point of the
 * app and a delete tap should never silently erase years of outings.
 */
export function deletePlace(householdId: string, id: string): DeleteResult {
  const existing = getPlace(householdId, id);
  if (!existing) return 'missing';

  if (existing.visitCount > 0) {
    run(
      "UPDATE places SET status = 'archived', updated_at = ? WHERE household_id = ? AND id = ?",
      nowIso(),
      householdId,
      id,
    );
    return 'archived';
  }

  run('DELETE FROM places WHERE household_id = ? AND id = ?', householdId, id);
  return 'deleted';
}

export function listCategories(householdId: string): string[] {
  return rows<{ category: string }>(
    `SELECT DISTINCT c.category FROM place_categories c
       JOIN places p ON p.id = c.place_id
      WHERE p.household_id = ?
      ORDER BY c.category`,
    householdId,
  ).map((r) => r.category);
}
