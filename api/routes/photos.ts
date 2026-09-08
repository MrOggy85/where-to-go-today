import type { Auth } from '../auth/session.ts';
import { getPlace } from '../db/places.ts';
import { getVisit } from '../db/visits.ts';
import { countPhotosForPlace, createPhoto, deletePhotoRow, getPhoto, listPhotos } from '../db/photos.ts';
import { CONTENT_TYPES, newFilename, photoPath, removePhoto, writePhoto } from '../photos/storage.ts';
import { clampInt, errorResponse, jsonResponse, optInt, optIsoDate, ValidationError } from '../db/validate.ts';

const PHOTOS_LIMIT_DEFAULT = 120;
const PHOTOS_LIMIT_MAX = 500;

/**
 * The client resizes and re-encodes before uploading, so these are generous ceilings meant
 * to stop a runaway request rather than to shape the image. Doing it client-side is what
 * lets an iPhone HEIC arrive as a JPEG without adding an image library to the server.
 */
const MAX_FILE_BYTES = 6 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
const MAX_FILES_PER_UPLOAD = 20;

/** Cap per place so one outing cannot fill the home server's disk. */
const MAX_PHOTOS_PER_PLACE = 300;

export function getPhotos(url: URL, auth: Auth): Response {
  const params = url.searchParams;
  const limit = clampInt(params.get('limit'), 1, PHOTOS_LIMIT_MAX, PHOTOS_LIMIT_DEFAULT);

  const placeId = params.get('placeId') ?? undefined;
  const visitId = params.get('visitId') ?? undefined;

  return jsonResponse({ photos: listPhotos(auth.householdId, { placeId, visitId }, limit) });
}

/**
 * The only way to read photo bytes. Scoped to the household first, so guessing an id from
 * another household returns 404 rather than an image.
 */
export async function getPhotoFile(auth: Auth, id: string): Promise<Response> {
  const photo = getPhoto(auth.householdId, id);
  if (!photo) return errorResponse('photo not found', 404);

  try {
    const bytes = await Deno.readFile(photoPath(photo.filename));
    return new Response(bytes, {
      headers: {
        'content-type': photo.contentType,
        'content-length': String(bytes.byteLength),
        // Immutable once written, but private: this is family data, never a shared cache's.
        'cache-control': 'private, max-age=31536000, immutable',
        'content-disposition': 'inline',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return errorResponse('photo file is missing', 410);
    throw e;
  }
}

/**
 * Multipart upload of one or more images against a place. `visitId` is optional: a photo
 * needs a place, not an outing.
 */
export async function postPlacePhotos(req: Request, auth: Auth, placeId: string): Promise<Response> {
  if (!getPlace(auth.householdId, placeId)) return errorResponse('place not found', 404);

  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_UPLOAD_BYTES) return errorResponse('upload too large', 413);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorResponse('expected a multipart form upload');
  }

  // A visit, when given, must belong to this household and to the same place.
  let visitId: string | null = null;
  const rawVisitId = form.get('visitId');
  if (typeof rawVisitId === 'string' && rawVisitId) {
    const visit = getVisit(auth.householdId, rawVisitId);
    if (!visit) return errorResponse('visit not found', 404);
    if (visit.placeId !== placeId) return errorResponse('visit belongs to a different place');
    visitId = visit.id;
  }

  const files = form.getAll('photos').filter((f): f is File => f instanceof File);
  if (!files.length) return errorResponse('no photos in the upload');
  if (files.length > MAX_FILES_PER_UPLOAD) return errorResponse(`at most ${MAX_FILES_PER_UPLOAD} photos at a time`);

  const existing = countPhotosForPlace(auth.householdId, placeId);
  if (existing + files.length > MAX_PHOTOS_PER_PLACE) {
    return errorResponse(`this place is limited to ${MAX_PHOTOS_PER_PLACE} photos`);
  }

  // Every file is checked before any of them is written, so a bad file at the end of a
  // batch rejects the whole upload instead of leaving half of it stored.
  for (const file of files) {
    if (!CONTENT_TYPES[file.type]) {
      return errorResponse(`${file.name || 'that file'} is not a JPEG, PNG or WebP`);
    }
    if (file.size > MAX_FILE_BYTES) return errorResponse(`${file.name || 'that file'} is too large`);
  }

  // Dimensions are measured client-side; the server has no decoder.
  const widths = numberList(form.get('widths'));
  const heights = numberList(form.get('heights'));

  const written: string[] = [];
  try {
    const created = [];
    for (const [i, file] of files.entries()) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const filename = newFilename(file.type);

      await writePhoto(filename, bytes);
      written.push(filename);

      created.push(createPhoto(auth.householdId, auth.profile?.id ?? null, {
        placeId,
        visitId,
        filename,
        contentType: file.type,
        sizeBytes: bytes.byteLength,
        width: widths[i] ?? null,
        height: heights[i] ?? null,
        capturedAt: capturedAt(form, i),
      }));
    }
    return jsonResponse({ photos: created }, 201);
  } catch (e) {
    // A file with no row would never be served or deleted, so unwind what was written.
    for (const filename of written) await removePhoto(filename);
    throw e;
  }
}

function numberList(value: FormDataEntryValue | null): (number | null)[] {
  if (typeof value !== 'string' || !value) return [];
  return value.split(',').map((v) => {
    try {
      return optInt(v, 'dimension', 1, 100_000);
    } catch {
      return null;
    }
  });
}

function capturedAt(form: FormData, index: number): string | null {
  const raw = form.get('capturedAt');
  if (typeof raw !== 'string' || !raw) return null;
  const parts = raw.split(',');
  try {
    return optIsoDate(parts[index], 'capturedAt');
  } catch (e) {
    if (e instanceof ValidationError) return null;
    throw e;
  }
}

export async function deletePhotoById(auth: Auth, id: string): Promise<Response> {
  const photo = getPhoto(auth.householdId, id);
  if (!photo) return errorResponse('photo not found', 404);

  deletePhotoRow(auth.householdId, id);
  // Row first: an orphaned file wastes space, an orphaned row breaks the grid.
  await removePhoto(photo.filename);
  return jsonResponse({ result: 'deleted' });
}
