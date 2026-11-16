/**
 * The one door to the database, shared by both runtimes. It knows nothing about where the
 * rows live: `api/db/sqlite.ts` plugs in node:sqlite for the Deno server, and
 * `cloudflare/src/d1.ts` plugs in D1 for the Worker. Everything in `api/db/` goes through
 * the helpers below and never touches a driver directly.
 */

export interface Statement {
  sql: string;
  params: unknown[];
}

export interface RunResult {
  changes: number;
}

export interface SqlDriver {
  all(sql: string, params: unknown[]): Promise<Record<string, unknown>[]>;
  first(sql: string, params: unknown[]): Promise<Record<string, unknown> | null>;
  run(sql: string, params: unknown[]): Promise<RunResult>;
  /** Runs every statement in one transaction: all of them land or none do. */
  batch(statements: Statement[]): Promise<void>;
}

let driver: SqlDriver | null = null;

export function useDriver(d: SqlDriver) {
  driver = d;
}

function current(): SqlDriver {
  if (!driver) throw new Error('no database driver configured');
  return driver;
}

/** Plain objects, never driver-specific ones, before handing to JSON logic. */
export async function rows<T>(sql: string, ...params: unknown[]): Promise<T[]> {
  const result = await current().all(sql, params);
  return result.map((r) => ({ ...r })) as T[];
}

export async function row<T>(sql: string, ...params: unknown[]): Promise<T | null> {
  const r = await current().first(sql, params);
  return r ? { ...r } as T : null;
}

export function run(sql: string, ...params: unknown[]): Promise<RunResult> {
  return current().run(sql, params);
}

/** A statement to hand to `batch`, so writes that belong together commit together. */
export function stmt(sql: string, ...params: unknown[]): Statement {
  return { sql, params };
}

export function batch(statements: Statement[]): Promise<void> {
  return current().batch(statements);
}

/** Verifies the database is readable, for the health endpoint. */
export async function pingDb() {
  await current().first('SELECT 1 AS ok', []);
}

export function nowIso() {
  return new Date().toISOString();
}

export function newId() {
  return crypto.randomUUID();
}
