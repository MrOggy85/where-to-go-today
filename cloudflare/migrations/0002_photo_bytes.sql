-- Worker only. Photo bytes, keyed by the same opaque filename the `photos` row carries
-- (the Deno server keeps them as files under <data dir>/photos/ instead). Written and
-- removed only through the photo store, which the routes call; a missing row reads as a
-- missing file (410), exactly as on disk.
CREATE TABLE IF NOT EXISTS photo_bytes (
  filename TEXT PRIMARY KEY,
  bytes    BLOB NOT NULL
);
