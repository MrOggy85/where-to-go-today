import { init } from './server.ts';
import { startSessionCleanup } from './auth/session.ts';
import { dbPath } from './db/db.ts';
import { getHousehold } from './db/households.ts';
import logger from './logger.ts';

const DEV = Deno.env.get('DEV') === '1';
const HOST = Deno.env.get('HOST') || '0.0.0.0';
const PORT = Number(Deno.env.get('PORT') || '8777');

function startClientWatcher() {
  const cmd = new Deno.Command(Deno.execPath(), {
    cwd: '../client',
    // Must match client/package.json's build script. --allow-sys cannot be narrowed:
    // esbuild's platform detection reads os.cpus().
    args: [
      'run',
      '--allow-env',
      '--allow-read',
      '--allow-run',
      '--allow-sys',
      '--allow-write=../api/client',
      'build-watch.ts',
    ],
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const child = cmd.spawn();
  child.status.then((status) => logger.info('client watcher exited', { code: status.code }));
  return child;
}

// Guarded on the file existing so the API can be run on its own before `make install`.
const hasClient = (() => {
  try {
    return Deno.statSync('../client/build-watch.ts').isFile;
  } catch {
    return false;
  }
})();

if (DEV && hasClient) {
  const watcher = startClientWatcher();
  // Both signals, or a `kill` on the server leaves the esbuild watcher holding the
  // working tree with nothing to serve it.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    Deno.addSignalListener(signal, () => {
      watcher.kill('SIGTERM');
      Deno.exit();
    });
  }
} else if (DEV) {
  logger.warn('client/build-watch.ts not found, serving API only');
}

startSessionCleanup();

if (!getHousehold()) {
  logger.warn('no household configured, login will fail until you run: make seed');
}

init(HOST, PORT);

logger.info('server started', { host: HOST, port: PORT, db: dbPath() });
