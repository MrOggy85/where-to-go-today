import { db, newId, nowIso, row, rows, run } from './db.ts';
import type { Category, CategoryWithCount } from './types.ts';

/** Thrown when a name collides with an existing category in the same household. */
export class DuplicateCategoryError extends Error {}

export function listCategories(householdId: string): CategoryWithCount[] {
  return rows<CategoryWithCount>(
    `SELECT c.id, c.name,
            (SELECT COUNT(*) FROM place_categories pc WHERE pc.category_id = c.id) AS placeCount
       FROM categories c
      WHERE c.household_id = ?
      ORDER BY c.name COLLATE NOCASE ASC`,
    householdId,
  );
}

export function getCategory(householdId: string, id: string): Category | null {
  return row<Category>('SELECT id, name FROM categories WHERE household_id = ? AND id = ?', householdId, id);
}

/** Case-insensitive, so "Park" is found when "park" already exists. */
function findByName(householdId: string, name: string, exceptId?: string): Category | null {
  const where = exceptId ? 'AND id != ?' : '';
  const params: unknown[] = [householdId, name];
  if (exceptId) params.push(exceptId);
  return row<Category>(
    `SELECT id, name FROM categories WHERE household_id = ? AND name = ? COLLATE NOCASE ${where}`,
    ...params,
  );
}

export function createCategory(householdId: string, name: string): Category {
  if (findByName(householdId, name)) throw new DuplicateCategoryError(`"${name}" already exists`);

  const id = newId();
  run(
    'INSERT INTO categories (id, household_id, name, created_at) VALUES (?, ?, ?, ?)',
    id,
    householdId,
    name,
    nowIso(),
  );
  return { id, name };
}

export function renameCategory(householdId: string, id: string, name: string): Category | null {
  if (!getCategory(householdId, id)) return null;
  if (findByName(householdId, name, id)) throw new DuplicateCategoryError(`"${name}" already exists`);

  run('UPDATE categories SET name = ? WHERE household_id = ? AND id = ?', name, householdId, id);
  return { id, name };
}

/**
 * Deleting untags the places that carry it rather than refusing: the places themselves are
 * untouched, and the confirm sheet has already shown how many are affected.
 */
export function deleteCategory(householdId: string, id: string): { untagged: number } | null {
  if (!getCategory(householdId, id)) return null;

  const untagged = rows('SELECT place_id FROM place_categories WHERE category_id = ?', id).length;
  // place_categories.category_id cascades, so the links go with the row.
  run('DELETE FROM categories WHERE household_id = ? AND id = ?', householdId, id);
  return { untagged };
}

/**
 * Filters a client-supplied list down to ids this household actually owns. Unknown ids are
 * dropped rather than trusted, so a stale form cannot tag a place with someone else's row.
 */
export function ownedCategoryIds(householdId: string, ids: string[]): string[] {
  if (!ids.length) return [];

  const placeholders = ids.map(() => '?').join(', ');
  const found = rows<{ id: string }>(
    `SELECT id FROM categories WHERE household_id = ? AND id IN (${placeholders})`,
    householdId,
    ...ids,
  );
  const owned = new Set(found.map((r) => r.id));
  return ids.filter((id) => owned.has(id));
}

export function replaceCategories(placeId: string, categoryIds: string[]) {
  run('DELETE FROM place_categories WHERE place_id = ?', placeId);
  const stmt = db.prepare('INSERT OR IGNORE INTO place_categories (place_id, category_id) VALUES (?, ?)');
  for (const id of categoryIds) stmt.run(placeId, id);
}
