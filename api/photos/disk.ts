import { dirname, fromFileUrl, join, resolve } from 'jsr:@std/path@1';
import type { PhotoStore } from './storage.ts';

/**
 * Photo bytes beside the SQLite file, so the one directory the deployment already mounts
 * and backs up covers both.
 */
function resolveDir(dbPath: string): string {
  const configured = Deno.env.get('PHOTOS_DIR');
  if (configured) return resolve(configured);

  // An in-memory database has no directory to sit next to.
  if (dbPath === ':memory:') return fromFileUrl(new URL('../.data/photos', import.meta.url));
  return join(dirname(resolve(dbPath)), 'photos');
}

export function diskPhotoStore(dbPath: string): PhotoStore {
  const dir = resolveDir(dbPath);
  Deno.mkdirSync(dir, { recursive: true });

  return {
    async read(filename) {
      try {
        const bytes = await Deno.readFile(join(dir, filename));
        return { body: bytes, size: bytes.byteLength };
      } catch (e) {
        if (e instanceof Deno.errors.NotFound) return null;
        throw e;
      }
    },
    async write(filename, bytes) {
      await Deno.writeFile(join(dir, filename), bytes, { mode: 0o600 });
    },
    async remove(filename) {
      try {
        await Deno.remove(join(dir, filename));
      } catch (e) {
        if (!(e instanceof Deno.errors.NotFound)) throw e;
      }
    },
  };
}
