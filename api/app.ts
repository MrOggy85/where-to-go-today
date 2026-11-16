import logger from './logger.ts';
import { type Auth, resolveAuth, sessionTag } from './auth/session.ts';
import { originAllowed } from './auth/guard.ts';
import { errorResponse } from './db/validate.ts';
import { getHealth } from './routes/health.ts';
import { getMe, postLogin, postLogout, postProfile } from './routes/auth.ts';
import { deletePlaceById, getPlaceById, getPlaces, postPlaces, putPlace } from './routes/places.ts';
import { deleteVisitById, getPlaceVisits, getVisitById, getVisits, postPlaceVisit, putVisit } from './routes/visits.ts';
import { deletePhotoById, getPhotoFile, getPhotos, postPlacePhotos } from './routes/photos.ts';
import { deleteCategoryById, getCategories, postCategories, putCategory } from './routes/categories.ts';
import { getToday } from './routes/today.ts';

/**
 * The request handler both runtimes share. What differs between the Deno server
 * (`server.ts`) and the Worker (`cloudflare/src/index.ts`) is only how a request is
 * admitted and where static files come from; that is the `Platform` each passes in.
 */
export interface Platform {
  /** The client's address, as the ingress reports it. */
  clientIp(req: Request): string;
  /** The host the client addressed, for the same-origin check on writes. */
  expectedHost(req: Request, url: URL): string | null;
  /** Country filter. Runs before anything else, static files and the health check included. */
  geoAllowed(req: Request, ip: string): boolean;
  /** Per-IP throttle on every request. */
  requestAllowed(ip: string): Promise<boolean>;
  /** A file from the client bundle, by path. */
  serveAsset(req: Request, url: URL): Promise<Response>;
  /** The SPA's index.html, for any path that is not an asset. */
  servePage(req: Request, url: URL): Promise<Response>;
  /** Routes only this runtime has, tried before the shared api. null means not mine. */
  extraApi?(req: Request, url: URL): Promise<Response | null>;
}

// Anything not listed here falls through to the SPA and gets index.html with a 200.
const RESOURCE_FILE_ENDING = [
  '.ico',
  '.css',
  '.js',
  '.json',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.svg',
  '.map',
  '.webmanifest',
];

const STATIC_IMMUTABLE = 'public, max-age=31536000, immutable';
const STATIC_REVALIDATE = 'public, max-age=86400, must-revalidate';
const HTML_NO_CACHE = 'no-cache, must-revalidate';

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

function withCache(resp: Response, cacheControl: string) {
  const headers = new Headers(resp.headers);
  headers.set('cache-control', cacheControl);
  return new Response(resp.body, { status: resp.status, headers });
}

/** Matches `/api/places/:id` style paths and returns the captured id. */
function match(pathname: string, prefix: string, suffix = ''): string | null {
  if (!pathname.startsWith(`${prefix}/`)) return null;
  const rest = pathname.slice(prefix.length + 1);
  if (suffix) {
    if (!rest.endsWith(suffix)) return null;
    const id = rest.slice(0, -suffix.length);
    return id && !id.includes('/') ? decodeURIComponent(id) : null;
  }
  return rest && !rest.includes('/') ? decodeURIComponent(rest) : null;
}

async function routeApi(
  req: Request,
  url: URL,
  ip: string,
  platform: Platform,
): Promise<{ resp: Response; profileId: string | null; sessionId?: string }> {
  const path = url.pathname;
  const method = req.method;

  if (path === '/api/health' && method === 'GET') {
    return { resp: await getHealth(), profileId: null };
  }

  // Every write must come from our own origin.
  if (!SAFE_METHODS.includes(method) && !originAllowed(req, platform.expectedHost(req, url))) {
    return { resp: errorResponse('cross-origin request rejected', 403), profileId: null };
  }

  if (path === '/api/auth/login' && method === 'POST') {
    return { resp: await postLogin(req, ip), profileId: null };
  }

  const auth: Auth | null = await resolveAuth(req);

  if (path === '/api/auth/me' && method === 'GET') return done(await getMe(auth), auth);
  if (path === '/api/auth/logout' && method === 'POST') return done(await postLogout(auth), auth);

  // ---- everything below requires a session ----
  if (!auth) return { resp: errorResponse('authentication required', 401), profileId: null };

  if (path === '/api/auth/profile' && method === 'POST') return done(await postProfile(req, auth), auth);

  if (path === '/api/today' && method === 'GET') return done(await getToday(url, auth), auth);

  if (path === '/api/places' && method === 'GET') return done(await getPlaces(url, auth), auth);
  if (path === '/api/places' && method === 'POST') return done(await postPlaces(req, auth), auth);

  const placeVisitsId = match(path, '/api/places', '/visits');
  if (placeVisitsId) {
    if (method === 'GET') return done(await getPlaceVisits(auth, placeVisitsId), auth);
    if (method === 'POST') return done(await postPlaceVisit(req, auth, placeVisitsId), auth);
  }

  const placePhotosId = match(path, '/api/places', '/photos');
  if (placePhotosId && method === 'POST') return done(await postPlacePhotos(req, auth, placePhotosId), auth);

  const placeId = match(path, '/api/places');
  if (placeId) {
    if (method === 'GET') return done(await getPlaceById(auth, placeId), auth);
    if (method === 'PUT') return done(await putPlace(req, auth, placeId), auth);
    if (method === 'DELETE') return done(await deletePlaceById(auth, placeId), auth);
  }

  if (path === '/api/photos' && method === 'GET') return done(await getPhotos(url, auth), auth);

  const photoFileId = match(path, '/api/photos', '/file');
  if (photoFileId && method === 'GET') return done(await getPhotoFile(auth, photoFileId), auth);

  const photoId = match(path, '/api/photos');
  if (photoId && method === 'DELETE') return done(await deletePhotoById(auth, photoId), auth);

  if (path === '/api/categories' && method === 'GET') return done(await getCategories(auth), auth);
  if (path === '/api/categories' && method === 'POST') return done(await postCategories(req, auth), auth);

  const categoryId = match(path, '/api/categories');
  if (categoryId) {
    if (method === 'PUT') return done(await putCategory(req, auth, categoryId), auth);
    if (method === 'DELETE') return done(await deleteCategoryById(auth, categoryId), auth);
  }

  if (path === '/api/visits' && method === 'GET') return done(await getVisits(url, auth), auth);

  const visitId = match(path, '/api/visits');
  if (visitId) {
    if (method === 'GET') return done(await getVisitById(auth, visitId), auth);
    if (method === 'PUT') return done(await putVisit(req, auth, visitId), auth);
    if (method === 'DELETE') return done(await deleteVisitById(auth, visitId), auth);
  }

  return done(errorResponse('not found', 404), auth);
}

/** The URL parser resolves literal `..`, but percent-encoded ones survive to the path join. */
function isTraversal(pathname: string) {
  try {
    return decodeURIComponent(pathname).includes('..');
  } catch {
    return true;
  }
}

function done(resp: Response, auth: Auth | null) {
  return { resp, profileId: auth?.profile?.id ?? null, sessionId: auth?.sessionId };
}

const REFUSAL_LOG_MS = 3_600_000;
const refusalsLogged = new Map<string, number>();

/** One line per IP and reason per hour (per process or isolate), so a scan leaves a trace without flooding the log. */
function logRefusal(reason: 'geo' | 'rate', ip: string, req: Request, path: string) {
  const key = `${reason} ${ip}`;
  const now = Date.now();
  if ((refusalsLogged.get(key) ?? 0) > now) return;
  if (refusalsLogged.size > 10_000) refusalsLogged.clear();
  refusalsLogged.set(key, now + REFUSAL_LOG_MS);
  logger.warn('refused', { reason, ip, method: req.method, path });
}

export async function handle(req: Request, platform: Platform): Promise<Response> {
  const start = Date.now();
  const url = new URL(req.url);
  const requestId = crypto.randomUUID().slice(0, 8);
  const ip = platform.clientIp(req);

  // Before anything else, static files and the health check included: a refused client learns nothing.
  if (!platform.geoAllowed(req, ip)) {
    logRefusal('geo', ip, req, url.pathname);
    return new Response('403 Forbidden', { status: 403 });
  }
  if (!await platform.requestAllowed(ip)) {
    logRefusal('rate', ip, req, url.pathname);
    return new Response('429 Too Many Requests', { status: 429 });
  }

  try {
    if (url.pathname.startsWith('/api')) {
      const extra = platform.extraApi ? await platform.extraApi(req, url) : null;
      if (extra) return extra;

      const { resp, profileId, sessionId } = await routeApi(req, url, ip, platform);

      // Session cookies and note contents are deliberately absent from this line. `sid` is a one-way tag of the
      // session, so a session used from an unfamiliar network can be spotted without logging the token.
      logger.info('request', {
        sid: sessionId ? await sessionTag(sessionId) : null,
        requestId,
        method: req.method,
        path: url.pathname,
        status: resp.status,
        durationMs: Date.now() - start,
        profileId,
        ip,
      });
      return resp;
    }

    if (isTraversal(url.pathname)) return new Response('400 Bad Request', { status: 400 });

    if (RESOURCE_FILE_ENDING.some((ext) => url.pathname.endsWith(ext))) {
      const cacheControl = url.searchParams.has('v') ? STATIC_IMMUTABLE : STATIC_REVALIDATE;
      return withCache(await platform.serveAsset(req, url), cacheControl);
    }

    // Page loads, not assets: few for the family, and where a probe for /wp-login.php or /.env shows up.
    logger.info('page', { requestId, method: req.method, path: url.pathname, ip });
    return withCache(await platform.servePage(req, url), HTML_NO_CACHE);
  } catch (err) {
    logger.error('request failed', {
      requestId,
      method: req.method,
      path: url.pathname,
      status: 500,
      durationMs: Date.now() - start,
      error: logger.serializeError(err),
    });
    return new Response('Internal Server Error', { status: 500 });
  }
}
