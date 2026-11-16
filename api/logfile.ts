import { addLogSink } from './logger.ts';

// The Deno server's log sink: one JSON-lines file per UTC day in LOG_DIR, 90 days. Off unless LOG_DIR is set.
const LOG_DIR = Deno.env.get('LOG_DIR');
const RETAIN_DAYS = 90;
const PRUNE_INTERVAL_MS = 86_400_000;

let fileFailed = false;

function writeFile(ts: string, line: string) {
  if (!LOG_DIR) return;
  try {
    Deno.writeTextFileSync(`${LOG_DIR}/app-${ts.slice(0, 10)}.jsonl`, line + '\n', { append: true });
    fileFailed = false;
  } catch (err) {
    // Said once per failure streak on stdout, never by recursing into the logger.
    if (!fileFailed) {
      console.error(JSON.stringify({ ts, level: 'error', message: 'log file write failed', error: String(err) }));
    }
    fileFailed = true;
  }
}

function pruneLogFiles() {
  if (!LOG_DIR) return;
  const cutoff = new Date(Date.now() - RETAIN_DAYS * 86_400_000).toISOString().slice(0, 10);
  try {
    for (const entry of Deno.readDirSync(LOG_DIR)) {
      const day = /^app-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(entry.name)?.[1];
      if (day && day < cutoff) Deno.removeSync(`${LOG_DIR}/${entry.name}`);
    }
  } catch (err) {
    const ts = new Date().toISOString();
    writeFile(ts, JSON.stringify({ ts, level: 'error', message: 'log prune failed', error: String(err) }));
  }
}

/** Creates LOG_DIR, adds the file sink and drops files past retention, now and daily. */
export function startLogFiles() {
  if (!LOG_DIR) return;
  Deno.mkdirSync(LOG_DIR, { recursive: true });
  addLogSink(writeFile);
  pruneLogFiles();
  const timer = setInterval(pruneLogFiles, PRUNE_INTERVAL_MS);
  Deno.unrefTimer(timer);
}
