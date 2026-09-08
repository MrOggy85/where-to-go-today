import type { DatabaseSync } from 'node:sqlite';

/**
 * schema.sql only creates what is missing, so column changes need explicit steps. Each one
 * is idempotent and guarded on the current shape, so a fresh database is a no-op and an
 * existing one converges to the same layout.
 */
export function migrate(db: DatabaseSync) {
  const columns = placeColumns(db);

  // Dropped attributes: the household never used them for a decision.
  if (columns.has('stroller_friendly')) db.exec('ALTER TABLE places DROP COLUMN stroller_friendly');
  if (columns.has('preferred_cooldown_days')) db.exec('ALTER TABLE places DROP COLUMN preferred_cooldown_days');

  // Typical visit length moved from minutes to hours.
  if (!columns.has('typical_duration_hours')) db.exec('ALTER TABLE places ADD COLUMN typical_duration_hours REAL');
  if (columns.has('typical_duration_minutes')) {
    db.exec(`UPDATE places SET typical_duration_hours = ROUND(typical_duration_minutes / 60.0, 2)
               WHERE typical_duration_minutes IS NOT NULL`);
    db.exec('ALTER TABLE places DROP COLUMN typical_duration_minutes');
  }

  // want_to_go is now derived from "active and never visited", so the stored value goes away.
  db.exec("UPDATE places SET status = 'active' WHERE status = 'want_to_go'");
}

function placeColumns(db: DatabaseSync): Set<string> {
  const info = db.prepare('PRAGMA table_info(places)').all() as { name: string }[];
  return new Set(info.map((c) => c.name));
}
