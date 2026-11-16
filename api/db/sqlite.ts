import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { dirname, fromFileUrl, resolve } from 'jsr:@std/path@1';
import { migrate } from './migrate.ts';
import type { SqlDriver } from './db.ts';

// Resolved from this module rather than Deno.cwd() so `make dev`, `deno task start` and
// the seed script all open the same file regardless of where they were launched.
const DEFAULT_DB_PATH = fromFileUrl(new URL('../.data/app.sqlite3', import.meta.url));

export function sqlitePath() {
  return Deno.env.get('DB_PATH') ?? DEFAULT_DB_PATH;
}

/**
 * The Deno server's driver: one SQLite file, opened once, schema applied and migrated on
 * open. node:sqlite is synchronous, so a batch cannot interleave with another request.
 */
export function openSqlite(path = sqlitePath()): SqlDriver {
  if (path !== ':memory:') {
    Deno.mkdirSync(dirname(resolve(path)), { recursive: true });
  }

  const db = new DatabaseSync(path);
  db.exec(Deno.readTextFileSync(fromFileUrl(new URL('./schema.sql', import.meta.url))));
  migrate(db);

  const p = (params: unknown[]) => params as SQLInputValue[];

  return {
    all: (sql, params) => Promise.resolve(db.prepare(sql).all(...p(params)) as Record<string, unknown>[]),
    first: (sql, params) => Promise.resolve((db.prepare(sql).get(...p(params)) as Record<string, unknown>) ?? null),
    run: (sql, params) => Promise.resolve({ changes: Number(db.prepare(sql).run(...p(params)).changes) }),
    batch: (statements) => {
      db.exec('BEGIN');
      try {
        for (const s of statements) db.prepare(s.sql).run(...p(s.params));
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        return Promise.reject(e);
      }
      return Promise.resolve();
    },
  };
}
