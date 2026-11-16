import type { PhotoStore } from '../../api/photos/storage.ts';

/** D1 stores at most 2,000,000 bytes per value; leave room for the row around it. */
export const MAX_PHOTO_BYTES = 1_900_000;

/**
 * Photo bytes in D1, in `photo_bytes`, one row per file, beside the rows that describe
 * them. The app shrinks a photo to 1600 px JPEG before upload (0.5-0.9 MB), so they fit,
 * and D1's Time Travel then restores photos along with everything else. Like the disk
 * directory it replaces, it is read only through `GET /api/photos/:id/file`, which checks
 * the household first.
 */
export function d1PhotoStore(db: D1Database): PhotoStore {
  return {
    async read(filename) {
      const r = await db.prepare('SELECT bytes FROM photo_bytes WHERE filename = ?').bind(filename)
        .first<{ bytes: ArrayBuffer | number[] }>();
      if (!r) return null;
      const bytes = r.bytes instanceof ArrayBuffer ? new Uint8Array(r.bytes) : Uint8Array.from(r.bytes);
      return { body: bytes, size: bytes.byteLength };
    },
    async write(filename, bytes) {
      if (bytes.byteLength > MAX_PHOTO_BYTES) throw new Error(`photo of ${bytes.byteLength} bytes is over D1's limit`);
      await db.prepare('INSERT OR REPLACE INTO photo_bytes (filename, bytes) VALUES (?, ?)').bind(filename, bytes)
        .run();
    },
    async remove(filename) {
      await db.prepare('DELETE FROM photo_bytes WHERE filename = ?').bind(filename).run();
    },
  };
}
