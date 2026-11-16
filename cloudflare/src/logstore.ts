/**
 * The Worker's log sink. Every line still goes to Workers Logs through console.log; this
 * keeps a copy in D1 for 90 days, because the home server's access watcher reads these
 * lines (logins, refusals, `request` with `ip` and `sid`) and Workers Logs neither keeps
 * them that long nor offers a documented query API.
 *
 * The logger is synchronous and D1 is not, so lines queue here and the entry point
 * flushes them with `ctx.waitUntil` once the response is on its way. The queue is capped
 * so a flood of refusals cannot turn into a flood of writes.
 */
const RETAIN_DAYS = 90;
const MAX_QUEUED = 100;

const queued: { ts: string; line: string }[] = [];
let dropped = 0;

export function queueLine(ts: string, line: string) {
  if (queued.length < MAX_QUEUED) queued.push({ ts, line });
  else dropped++;
}

export async function flushLines(db: D1Database) {
  const lines = queued.splice(0);
  if (dropped) {
    const ts = new Date().toISOString();
    lines.push({ ts, line: JSON.stringify({ ts, level: 'warn', message: 'log lines dropped', count: dropped }) });
    dropped = 0;
  }
  if (!lines.length) return;
  const insert = db.prepare('INSERT INTO log_lines (ts, line) VALUES (?, ?)');
  try {
    await db.batch(lines.map((l) => insert.bind(l.ts, l.line)));
  } catch (err) {
    // Never through the logger: that would queue another line for the store that just failed.
    console.error(JSON.stringify({ level: 'error', message: 'log store write failed', error: String(err) }));
  }
}

/** Lines after a cursor, oldest first. The cursor is the row id, so nothing is skipped or read twice. */
export async function readLines(db: D1Database, after: number, limit: number) {
  const r = await db.prepare('SELECT id, line FROM log_lines WHERE id > ? ORDER BY id LIMIT ?')
    .bind(after, limit).all<{ id: number; line: string }>();
  return r.results;
}

export async function pruneLines(db: D1Database) {
  const cutoff = new Date(Date.now() - RETAIN_DAYS * 86_400_000).toISOString();
  await db.prepare('DELETE FROM log_lines WHERE ts < ?').bind(cutoff).run();
}
