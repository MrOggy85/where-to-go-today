import type { SqlDriver } from '../../api/db/db.ts';

/** D1 refuses `undefined` and has no boolean type; everything else binds as it is. */
function bindable(v: unknown) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

/** The Worker's database driver. A D1 batch is one transaction, which is what `batch` promises. */
export function d1Driver(db: D1Database): SqlDriver {
  const prepare = (sql: string, params: unknown[]) => db.prepare(sql).bind(...params.map(bindable));
  return {
    async all(sql, params) {
      return (await prepare(sql, params).all<Record<string, unknown>>()).results;
    },
    first: (sql, params) => prepare(sql, params).first<Record<string, unknown>>(),
    async run(sql, params) {
      const r = await prepare(sql, params).run();
      return { changes: r.meta.changes ?? 0 };
    },
    async batch(statements) {
      if (!statements.length) return;
      await db.batch(statements.map((s) => prepare(s.sql, s.params)));
    },
  };
}
