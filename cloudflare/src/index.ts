import { handle, type Platform } from '../../api/app.ts';
import { useDriver } from '../../api/db/db.ts';
import { usePhotoStore, writePhoto } from '../../api/photos/storage.ts';
import { useLoginLimiter } from '../../api/auth/guard.ts';
import { purgeExpiredSessions } from '../../api/auth/session.ts';
import { configure } from '../../api/config.ts';
import logger, { addLogSink } from '../../api/logger.ts';
import { d1Driver } from './d1.ts';
import { d1PhotoStore, MAX_PHOTO_BYTES } from './d1photos.ts';
import { d1LoginLimiter, pruneLoginAttempts } from './limits.ts';
import { flushLines, pruneLines, queueLine, readLines } from './logstore.ts';

/**
 * The Cloudflare Worker: the same handler as the Deno server (`api/app.ts`), with D1 for
 * the database and the photo bytes, and the client bundle as Workers static assets.
 * `run_worker_first` is on, so no request (static files included) reaches anything before
 * the country filter and the throttle.
 */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Rate Limiting binding: every request, per client address. */
  REQUESTS: RateLimit;
  /** Comma-separated ISO countries, e.g. `JP`. Empty admits everyone (local dev only). */
  GEO_ALLOW_COUNTRIES?: string;
  /** Secret. Bearer token for `GET /api/ops/log`, the home server's access watcher. Unset disables it. */
  OPS_TOKEN?: string;
  /** For new password hashes. 100,000 at most: Workers refuses more. */
  PBKDF2_ITERATIONS?: string;
}

let ready = false;

/** Plugs the Worker's storage into the shared code, once per isolate. Bindings do not change between requests. */
function setup(env: Env) {
  if (ready) return;
  const iterations = Number(env.PBKDF2_ITERATIONS);
  configure({
    dev: false,
    pbkdf2Iterations: iterations > 0 && iterations <= 100_000 ? iterations : 100_000,
    maxPhotoBytes: MAX_PHOTO_BYTES,
  });
  useDriver(d1Driver(env.DB));
  usePhotoStore(d1PhotoStore(env.DB));
  useLoginLimiter(d1LoginLimiter(env.DB));
  addLogSink(queueLine);
  ready = true;
}

function countries(env: Env) {
  return (env.GEO_ALLOW_COUNTRIES ?? '').split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
}

const OPS_LIMIT_MAX = 1000;

async function sameSecret(a: string, b: string) {
  // Digests first, so the comparison is constant-time and the lengths always match.
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(x, y);
}

const OPS_PHOTO_NAME = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/**
 * The home server's two ways in, both only with the bearer token, neither existing
 * without OPS_TOKEN set:
 *
 * - `GET /api/ops/log?after=<id>&limit=<n>`: the stored log lines after a cursor, for the
 *   access watcher, which polls it in place of reading log files.
 * - `PUT /api/ops/photo?name=<filename>`: the bytes of a photo whose row already exists,
 *   for `migrate-data.sh`. A photo is too large for one SQL statement in an import file,
 *   so it comes through the same store the app writes with.
 */
async function ops(req: Request, url: URL, env: Env, ip: string): Promise<Response | null> {
  const route = url.pathname === '/api/ops/log' && req.method === 'GET'
    ? 'log'
    : url.pathname === '/api/ops/photo' && req.method === 'PUT'
    ? 'photo'
    : null;
  const token = env.OPS_TOKEN;
  if (!route || !token) return null;

  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ') || !await sameSecret(auth.slice(7), token)) {
    logger.warn('ops refused', { ip, path: url.pathname });
    return json({ error: 'unauthorized' }, 401);
  }

  if (route === 'log') {
    const after = Math.max(0, Number(url.searchParams.get('after') ?? '0') || 0);
    const limit = Math.min(OPS_LIMIT_MAX, Math.max(1, Number(url.searchParams.get('limit') ?? '500') || 500));
    const lines = await readLines(env.DB, after, limit);
    return json({ lines, next: lines.length ? lines[lines.length - 1].id : after });
  }

  const name = url.searchParams.get('name') ?? '';
  if (!OPS_PHOTO_NAME.test(name)) return json({ error: 'bad name' }, 400);
  const row = await env.DB.prepare('SELECT 1 AS ok FROM photos WHERE filename = ?').bind(name).first();
  if (!row) return json({ error: 'no photo row with that filename' }, 404);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > MAX_PHOTO_BYTES) return json({ error: 'size' }, 413);
  await writePhoto(name, bytes, req.headers.get('content-type') ?? 'image/jpeg');
  logger.info('ops photo stored', { ip, bytes: bytes.byteLength });
  return json({ stored: name, bytes: bytes.byteLength });
}

function platform(env: Env): Platform {
  const allowed = countries(env);
  return {
    // Set by Cloudflare's edge on every request and not overridable by the client.
    clientIp: (req) => req.headers.get('cf-connecting-ip') ?? '0.0.0.0',
    expectedHost: (_req, url) => url.host,
    geoAllowed(req) {
      if (!allowed.length) return true;
      // Cloudflare's own geolocation of the client. Fails closed: no country, no entry.
      const country = req.cf?.country;
      return typeof country === 'string' && allowed.includes(country.toUpperCase());
    },
    async requestAllowed(ip) {
      return (await env.REQUESTS.limit({ key: ip })).success;
    },
    serveAsset: (req) => env.ASSETS.fetch(req),
    // `/` is index.html; asking for /index.html itself gets a redirect to `/` from the asset server.
    servePage: (req, url) =>
      env.ASSETS.fetch(
        new Request(new URL('/', url), { method: req.method === 'HEAD' ? 'HEAD' : 'GET', headers: req.headers }),
      ),
    extraApi: (req, url) => ops(req, url, env, req.headers.get('cf-connecting-ip') ?? '0.0.0.0'),
  };
}

export default {
  async fetch(req, env, ctx): Promise<Response> {
    setup(env);
    try {
      return await handle(req, platform(env));
    } finally {
      ctx.waitUntil(flushLines(env.DB));
    }
  },

  /** Daily housekeeping, the Worker's version of the Deno server's timers. */
  async scheduled(_controller, env, ctx) {
    setup(env);
    ctx.waitUntil((async () => {
      await purgeExpiredSessions();
      await pruneLoginAttempts(env.DB);
      await pruneLines(env.DB);
      await flushLines(env.DB);
    })());
  },
} satisfies ExportedHandler<Env>;
