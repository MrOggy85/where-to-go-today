import type { DatabaseSync } from 'node:sqlite';

/**
 * schema.sql only creates what is missing, so column changes need explicit steps. Each one
 * is idempotent and guarded on the current shape, so a fresh database is a no-op and an
 * existing one converges to the same layout.
 */
export function migrate(db: DatabaseSync) {
  const placeCols = columns(db, 'places');

  // Dropped attributes: the household never used them for a decision.
  if (placeCols.has('stroller_friendly')) db.exec('ALTER TABLE places DROP COLUMN stroller_friendly');
  if (placeCols.has('preferred_cooldown_days')) db.exec('ALTER TABLE places DROP COLUMN preferred_cooldown_days');

  // Typical visit length moved from minutes to hours.
  if (!placeCols.has('typical_duration_hours')) db.exec('ALTER TABLE places ADD COLUMN typical_duration_hours REAL');
  if (placeCols.has('typical_duration_minutes')) {
    db.exec(`UPDATE places SET typical_duration_hours = ROUND(typical_duration_minutes / 60.0, 2)
               WHERE typical_duration_minutes IS NOT NULL`);
    db.exec('ALTER TABLE places DROP COLUMN typical_duration_minutes');
  }

  // want_to_go is now derived from "active and never visited", so the stored value goes away.
  db.exec("UPDATE places SET status = 'active' WHERE status = 'want_to_go'");

  promoteCategories(db);
}

/**
 * Categories used to be free text on the join row. Promote each distinct name to a
 * `categories` record and repoint the join table at it, so a rename is one update.
 */
function promoteCategories(db: DatabaseSync) {
  if (!columns(db, 'place_categories').has('category')) return;

  const old = db.prepare(
    `SELECT pc.place_id AS placeId, pc.category AS name, p.household_id AS householdId
       FROM place_categories pc JOIN places p ON p.id = pc.place_id`,
  ).all() as { placeId: string; name: string; householdId: string }[];

  db.exec('ALTER TABLE place_categories RENAME TO place_categories_old');
  // The rename keeps the index, and its name, attached to the old table.
  db.exec('DROP INDEX IF EXISTS place_categories_category');
  // Same DDL as schema.sql, which skipped it because the old table already existed.
  db.exec(`CREATE TABLE place_categories (
    place_id    TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (place_id, category_id)
  )`);
  db.exec('CREATE INDEX place_categories_category ON place_categories(category_id)');

  const insertCategory = db.prepare(
    'INSERT INTO categories (id, household_id, name, created_at) VALUES (?, ?, ?, ?)',
  );
  const insertLink = db.prepare('INSERT OR IGNORE INTO place_categories (place_id, category_id) VALUES (?, ?)');
  const at = new Date().toISOString();

  // Keyed case-insensitively: the unique index would reject "Park" after "park".
  const ids = new Map<string, string>();
  for (const r of old) {
    const name = r.name.trim();
    if (!name) continue;
    const key = `${r.householdId}${name.toLowerCase()}`;
    let id = ids.get(key);
    if (!id) {
      id = crypto.randomUUID();
      ids.set(key, id);
      insertCategory.run(id, r.householdId, name, at);
    }
    insertLink.run(r.placeId, id);
  }

  db.exec('DROP TABLE place_categories_old');
}

function columns(db: DatabaseSync, table: string): Set<string> {
  const info = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(info.map((c) => c.name));
}
