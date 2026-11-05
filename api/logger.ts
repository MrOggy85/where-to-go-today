type Level = 'info' | 'warn' | 'error';

// Optional second sink: one JSON-lines file per UTC day in LOG_DIR. The container's own log goes with the container,
// so a redeploy used to erase the only record of who logged in. Off unless LOG_DIR is set.
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
    // Said once per failure streak on stdout, never by recursing into the file sink.
    if (!fileFailed) {
      console.error(JSON.stringify({ ts, level: 'error', message: 'log file write failed', error: String(err) }));
    }
    fileFailed = true;
  }
}

// Never log: session cookies, passwords or hashes, note contents, exact home coordinates.
function emit(level: Level, message: string, fields?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  const line = JSON.stringify({ ts, level, message, ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
  writeFile(ts, line);
}

function serializeError(err: unknown) {
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack };
  return { message: String(err) };
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
    emit('error', 'log prune failed', { error: serializeError(err) });
  }
}

/** Creates LOG_DIR and drops files past retention, now and daily. */
export function startLogFiles() {
  if (!LOG_DIR) return;
  Deno.mkdirSync(LOG_DIR, { recursive: true });
  pruneLogFiles();
  const timer = setInterval(pruneLogFiles, PRUNE_INTERVAL_MS);
  Deno.unrefTimer(timer);
}

export default {
  info: (message: string, fields?: Record<string, unknown>) => emit('info', message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => emit('warn', message, fields),
  error: (message: string, fields?: Record<string, unknown>) => emit('error', message, fields),
  serializeError,
};
