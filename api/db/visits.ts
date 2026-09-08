import { newId, nowIso, row, rows, run } from './db.ts';
import type { Visit } from './types.ts';

interface VisitRow {
  id: string;
  household_id: string;
  place_id: string;
  visited_at: string;
  note: string | null;
  rating: number | null;
  created_at: string;
  created_by_profile_id: string | null;
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

export function listVisits(householdId: string, limit: number): Visit[] {
  return rows<VisitRow>(
    'SELECT * FROM visits WHERE household_id = ? ORDER BY visited_at DESC LIMIT ?',
    householdId,
    limit,
  ).map(toVisit);
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

/** The date and note are corrections; a different outing is a new visit, not an edit. */
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
