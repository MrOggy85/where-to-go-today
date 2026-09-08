import { newId, nowIso, row, rows, run } from './db.ts';
import type { Photo, PhotoWithPlace } from './types.ts';

interface PhotoRow {
  id: string;
  household_id: string;
  place_id: string;
  visit_id: string | null;
  filename: string;
  content_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  captured_at: string | null;
  uploaded_at: string;
  uploaded_by_profile_id: string | null;
  place_name?: string;
}

function toPhoto(r: PhotoRow): PhotoWithPlace {
  return {
    id: r.id,
    householdId: r.household_id,
    placeId: r.place_id,
    visitId: r.visit_id ?? undefined,
    filename: r.filename,
    contentType: r.content_type,
    sizeBytes: r.size_bytes,
    width: r.width ?? undefined,
    height: r.height ?? undefined,
    capturedAt: r.captured_at ?? undefined,
    uploadedAt: r.uploaded_at,
    uploadedByProfileId: r.uploaded_by_profile_id ?? undefined,
    placeName: r.place_name ?? '',
  };
}

const SELECT_PHOTO = `
  SELECT ph.*, p.name AS place_name
    FROM photos ph JOIN places p ON p.id = ph.place_id
`;

export interface PhotoFilters {
  placeId?: string;
  visitId?: string;
}

/** Newest first: the grid is a reverse-chronological memory feed. */
export function listPhotos(householdId: string, f: PhotoFilters, limit: number): PhotoWithPlace[] {
  const where = ['ph.household_id = ?'];
  const params: unknown[] = [householdId];

  if (f.placeId) {
    where.push('ph.place_id = ?');
    params.push(f.placeId);
  }
  if (f.visitId) {
    where.push('ph.visit_id = ?');
    params.push(f.visitId);
  }

  return rows<PhotoRow>(
    `${SELECT_PHOTO} WHERE ${where.join(' AND ')} ORDER BY ph.uploaded_at DESC LIMIT ?`,
    ...params,
    limit,
  ).map(toPhoto);
}

export function getPhoto(householdId: string, id: string): PhotoWithPlace | null {
  const r = row<PhotoRow>(`${SELECT_PHOTO} WHERE ph.household_id = ? AND ph.id = ?`, householdId, id);
  return r ? toPhoto(r) : null;
}

export interface PhotoInput {
  placeId: string;
  visitId: string | null;
  filename: string;
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  capturedAt: string | null;
}

export function createPhoto(householdId: string, profileId: string | null, input: PhotoInput): Photo {
  const id = newId();
  run(
    `INSERT INTO photos (id, household_id, place_id, visit_id, filename, content_type, size_bytes,
                         width, height, captured_at, uploaded_at, uploaded_by_profile_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    householdId,
    input.placeId,
    input.visitId,
    input.filename,
    input.contentType,
    input.sizeBytes,
    input.width,
    input.height,
    input.capturedAt,
    nowIso(),
    profileId,
  );
  return getPhoto(householdId, id)!;
}

export function deletePhotoRow(householdId: string, id: string): boolean {
  return Number(run('DELETE FROM photos WHERE household_id = ? AND id = ?', householdId, id).changes) > 0;
}

/** Filenames whose rows are about to disappear, so their files can be removed too. */
export function filenamesForPlace(householdId: string, placeId: string): string[] {
  return rows<{ filename: string }>(
    'SELECT filename FROM photos WHERE household_id = ? AND place_id = ?',
    householdId,
    placeId,
  ).map((r) => r.filename);
}

export function countPhotosForPlace(householdId: string, placeId: string): number {
  const r = row<{ n: number }>(
    'SELECT COUNT(*) AS n FROM photos WHERE household_id = ? AND place_id = ?',
    householdId,
    placeId,
  );
  return r?.n ?? 0;
}
