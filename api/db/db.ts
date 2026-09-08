import { DatabaseSync } from 'node:sqlite';
import { dirname, fromFileUrl, resolve } from 'jsr:@std/path@1';
import { migrate } from './migrate.ts';

// Resolved from this module rather than Deno.cwd() so `make dev`, `deno task start` and
// the seed script all open the same file regardless of where they were launched.
const DEFAULT_DB_PATH = fromFileUrl(new URL('../.data/app.sqlite3', import.meta.url));

const path = Deno.env.get('DB_PATH') ?? DEFAULT_DB_PATH;

if (path !== ':memory:') {
  Deno.mkdirSync(dirname(resolve(path)), { recursive: true });
}

export const db = new DatabaseSync(path);

db.exec(Deno.readTextFileSync(fromFileUrl(new URL('./schema.sql', import.meta.url))));
migrate(db);

export function dbPath() {
  return path;
}

/** Verifies the database is readable, for the health endpoint. */
export function pingDb() {
  db.prepare('SELECT 1 AS ok').get();
}

export function nowIso() {
  return new Date().toISOString();
}

export function newId() {
  return crypto.randomUUID();
}

/** node:sqlite returns null-prototype objects; spread them before handing to JSON logic. */
export function rows<T>(sql: string, ...params: unknown[]): T[] {
  // deno-lint-ignore no-explicit-any
  const result = db.prepare(sql).all(...params as any[]) as Record<string, unknown>[];
  return result.map((r) => ({ ...r })) as T[];
}

export function row<T>(sql: string, ...params: unknown[]): T | null {
  // deno-lint-ignore no-explicit-any
  const r = db.prepare(sql).get(...params as any[]) as Record<string, unknown> | undefined;
  return r ? { ...r } as T : null;
}

export function run(sql: string, ...params: unknown[]) {
  // deno-lint-ignore no-explicit-any
  return db.prepare(sql).run(...params as any[]);
}
