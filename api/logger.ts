export type Level = 'info' | 'warn' | 'error';

/**
 * A second destination for every line, besides stdout. The container's own log goes with
 * the container, so a redeploy used to erase the only record of who logged in: the Deno
 * server adds one JSON-lines file per UTC day (`api/logfile.ts`), the Worker a D1 table
 * (`cloudflare/src/logstore.ts`). Both keep the same line, so the home server's access
 * watcher reads either. A sink must not throw and must not log through this module.
 */
export type LogSink = (ts: string, line: string) => void;

const sinks: LogSink[] = [];

export function addLogSink(sink: LogSink) {
  sinks.push(sink);
}

// Never log: session cookies, passwords or hashes, note contents, exact home coordinates.
function emit(level: Level, message: string, fields?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  const line = JSON.stringify({ ts, level, message, ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
  for (const sink of sinks) sink(ts, line);
}

function serializeError(err: unknown) {
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack };
  return { message: String(err) };
}

export default {
  info: (message: string, fields?: Record<string, unknown>) => emit('info', message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => emit('warn', message, fields),
  error: (message: string, fields?: Record<string, unknown>) => emit('error', message, fields),
  serializeError,
};
