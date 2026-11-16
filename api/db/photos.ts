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
export async function listPhotos(householdId: string, f: PhotoFilters, limit: number): Promise<PhotoWithPlace[]> {
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

  return (await rows<PhotoRow>(
    `${SELECT_PHOTO} WHERE ${where.join(' AND ')} ORDER BY ph.uploaded_at DESC LIMIT ?`,
    ...params,
    limit,
  )).map(toPhoto);
}

export async function getPhoto(householdId: string, id: string): Promise<PhotoWithPlace | null> {
  const r = await row<PhotoRow>(`${SELECT_PHOTO} WHERE ph.household_id = ? AND ph.id = ?`, householdId, id);
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

export async function createPhoto(householdId: string, profileId: string | null, input: PhotoInput): Promise<Photo> {
  const id = newId();
  await run(
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
  return (await getPhoto(householdId, id))!;
}

export async function deletePhotoRow(householdId: string, id: string): Promise<boolean> {
  return Number((await run('DELETE FROM photos WHERE household_id = ? AND id = ?', householdId, id)).changes) > 0;
}

/** Filenames whose rows are about to disappear, so their files can be removed too. */
export async function filenamesForPlace(householdId: string, placeId: string): Promise<string[]> {
  return (await rows<{ filename: string }>(
    'SELECT filename FROM photos WHERE household_id = ? AND place_id = ?',
    householdId,
    placeId,
  )).map((r) => r.filename);
}

export async function countPhotosForPlace(householdId: string, placeId: string): Promise<number> {
  const r = await row<{ n: number }>(
    'SELECT COUNT(*) AS n FROM photos WHERE household_id = ? AND place_id = ?',
    householdId,
    placeId,
  );
  return r?.n ?? 0;
}
