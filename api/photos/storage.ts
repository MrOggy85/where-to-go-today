/**
 * Where photo bytes live, behind one small interface so neither runtime's storage leaks
 * into the routes: `api/photos/disk.ts` keeps them beside the SQLite file for the Deno
 * server, `cloudflare/src/r2.ts` keeps them in an R2 bucket for the Worker. Never served
 * as static files either way: every read goes through `GET /api/photos/:id/file`, which
 * checks the session first.
 */
export interface PhotoStore {
  /** null when the bytes are gone; the row may still exist. */
  read(filename: string): Promise<{ body: BodyInit; size: number } | null>;
  write(filename: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** Missing files are not an error: the row is going away either way. */
  remove(filename: string): Promise<void>;
}

let store: PhotoStore | null = null;

export function usePhotoStore(s: PhotoStore) {
  store = s;
}

function current(): PhotoStore {
  if (!store) throw new Error('no photo store configured');
  return store;
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

/**
 * A filename only ever comes from our own column, but stripping separators keeps a bad
 * value from reaching outside the photo directory or bucket prefix.
 */
export function safeName(filename: string): string {
  return filename.replace(/[/\\]/g, '');
}

export const readPhoto = (filename: string) => current().read(safeName(filename));
export const writePhoto = (filename: string, bytes: Uint8Array, contentType: string) =>
  current().write(safeName(filename), bytes, contentType);
export const removePhoto = (filename: string) => current().remove(safeName(filename));
