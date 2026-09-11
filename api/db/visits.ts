import { newId, nowIso, row, rows, run } from './db.ts';
import type { Visit, VisitWithPlace } from './types.ts';

/** Enough of a visit's photos for a list row to show a strip. The visit page has them all. */
const LIST_PHOTO_IDS = 10;

interface VisitRow {
  id: string;
  household_id: string;
  place_id: string;
  visited_at: string;
  note: string | null;
  rating: number | null;
  created_at: string;
  created_by_profile_id: string | null;
  /** Both present only on the visits-list SELECT. */
  place_name?: string;
  photo_ids?: string | null;
}

function toVisit(r: VisitRow): Visit {
  return {
    id: r.id,
    householdId: r.household_id,
    placeId: r.place_id,
    visitedAt: r.visited_at,
    note: r.note ?? undefined,
    rating: (r.rating ?? undefined) as Visit['rating'],
    createdAt: r.created_at,
    createdByProfileId: r.created_by_profile_id ?? undefined,
  };
}

export function listVisitsForPlace(householdId: string, placeId: string): Visit[] {
  return rows<VisitRow>(
    'SELECT * FROM visits WHERE household_id = ? AND place_id = ? ORDER BY visited_at DESC',
    householdId,
    placeId,
  ).map(toVisit);
}

function toVisitWithPlace(r: VisitRow): VisitWithPlace {
  return {
    ...toVisit(r),
    placeName: r.place_name ?? '',
    photoIds: r.photo_ids ? JSON.parse(r.photo_ids) as string[] : [],
  };
}

/**
 * The visits list. Archived places are included: the visit still happened.
 *
 * `id` breaks the sort tie because a backdated visit is stored at noon local, so a whole
 * day of them shares one timestamp and paging would otherwise skip or repeat rows.
 */
export function listVisits(householdId: string, limit: number, offset = 0): VisitWithPlace[] {
  return rows<VisitRow>(
    `SELECT v.*, p.name AS place_name,
       (SELECT json_group_array(id) FROM (
          SELECT ph.id AS id FROM photos ph
           WHERE ph.visit_id = v.id
           ORDER BY ph.uploaded_at DESC
           LIMIT ${LIST_PHOTO_IDS}
        )) AS photo_ids
       FROM visits v JOIN places p ON p.id = v.place_id
      WHERE v.household_id = ?
      ORDER BY v.visited_at DESC, v.id DESC
      LIMIT ? OFFSET ?`,
    householdId,
    limit,
    offset,
  ).map(toVisitWithPlace);
}

export function getVisit(householdId: string, id: string): Visit | null {
  const r = row<VisitRow>('SELECT * FROM visits WHERE household_id = ? AND id = ?', householdId, id);
  return r ? toVisit(r) : null;
}

export interface VisitInput {
  visitedAt: string;
  note: string | null;
  rating: number | null;
}

/** The date and note are corrections; somewhere else is a new visit, not an edit. */
export function updateVisit(householdId: string, id: string, input: VisitInput): Visit | null {
  if (!getVisit(householdId, id)) return null;

  run(
    'UPDATE visits SET visited_at = ?, note = ?, rating = ? WHERE household_id = ? AND id = ?',
    input.visitedAt,
    input.note,
    input.rating,
    householdId,
    id,
  );
  return getVisit(householdId, id);
}

export function createVisit(
  householdId: string,
  placeId: string,
  profileId: string | null,
  input: VisitInput,
): Visit {
  const id = newId();
  run(
    `INSERT INTO visits (id, household_id, place_id, visited_at, note, rating, created_at, created_by_profile_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    householdId,
    placeId,
    input.visitedAt,
    input.note,
    input.rating,
    nowIso(),
    profileId,
  );
  return toVisit(row<VisitRow>('SELECT * FROM visits WHERE id = ?', id)!);
}

export function deleteVisit(householdId: string, id: string): boolean {
  const result = run('DELETE FROM visits WHERE household_id = ? AND id = ?', householdId, id);
  return Number(result.changes) > 0;
}
