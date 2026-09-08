import { dirname, fromFileUrl, join, resolve } from 'jsr:@std/path@1';
import { dbPath } from '../db/db.ts';

/**
 * Photo bytes live beside the SQLite file, so the one directory the deployment already
 * mounts and backs up covers both. Never served as static files: every read goes through
 * `GET /api/photos/:id/file`, which checks the session first.
 */
function resolveDir(): string {
  const configured = Deno.env.get('PHOTOS_DIR');
  if (configured) return resolve(configured);

  const db = dbPath();
  // An in-memory database has no directory to sit next to.
  if (db === ':memory:') return fromFileUrl(new URL('../.data/photos', import.meta.url));
  return join(dirname(resolve(db)), 'photos');
}

const dir = resolveDir();

Deno.mkdirSync(dir, { recursive: true });

export function photosDir() {
  return dir;
}

export const CONTENT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Opaque and random, never derived from the upload's own name. */
export function newFilename(contentType: string): string {
  return `${crypto.randomUUID()}.${CONTENT_TYPES[contentType] ?? 'jpg'}`;
}

export function photoPath(filename: string): string {
  // basename guards the join: a filename only ever comes from our own column, but a
  // traversal here would read outside the data directory.
  return join(dir, filename.replace(/[/\\]/g, ''));
}

export async function writePhoto(filename: string, bytes: Uint8Array) {
  await Deno.writeFile(photoPath(filename), bytes, { mode: 0o600 });
}

/** Missing files are not an error: the row is going away either way. */
export async function removePhoto(filename: string) {
  try {
    await Deno.remove(photoPath(filename));
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
}
