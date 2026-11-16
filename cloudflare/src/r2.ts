import type { PhotoStore } from '../../api/photos/storage.ts';

/**
 * Photo bytes in a private R2 bucket under `photos/`. The bucket has no public access and
 * no custom domain: like the disk directory it replaces, it is read only through
 * `GET /api/photos/:id/file`, which checks the household first.
 */
export function r2PhotoStore(bucket: R2Bucket): PhotoStore {
  const key = (filename: string) => `photos/${filename}`;
  return {
    async read(filename) {
      const obj = await bucket.get(key(filename));
      return obj ? { body: obj.body, size: obj.size } : null;
    },
    async write(filename, bytes, contentType) {
      await bucket.put(key(filename), bytes, { httpMetadata: { contentType } });
    },
    async remove(filename) {
      // R2 deletes of a missing key succeed, matching the disk store's "not an error".
      await bucket.delete(key(filename));
    },
  };
}
