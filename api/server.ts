import { serveFile } from 'jsr:@std/http@1/file-server';
import { fromFileUrl } from 'jsr:@std/path@1';
import logger from './logger.ts';
import { type Auth, resolveAuth } from './auth/session.ts';
import { getClientIp, originAllowed } from './auth/guard.ts';
import { errorResponse } from './db/validate.ts';
import { getHealth } from './routes/health.ts';
import { getMe, postLogin, postLogout, postProfile } from './routes/auth.ts';
import { deletePlaceById, getPlaceById, getPlaces, postPlaces, putPlace } from './routes/places.ts';
import { deleteVisitById, getPlaceVisits, getVisitById, getVisits, postPlaceVisit, putVisit } from './routes/visits.ts';
import { deletePhotoById, getPhotoFile, getPhotos, postPlacePhotos } from './routes/photos.ts';
import { deleteCategoryById, getCategories, postCategories, putCategory } from './routes/categories.ts';
import { getToday } from './routes/today.ts';

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

const root = Deno.env.get('CLIENT_ROOT') ?? fromFileUrl(new URL('./client', import.meta.url));

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

async function routeApi(req: Request, url: URL, ip: string): Promise<{ resp: Response; profileId: string | null }> {
  const path = url.pathname;
  const method = req.method;

  if (path === '/api/health' && method === 'GET') {
    return { resp: getHealth(), profileId: null };
  }

  // Every write must come from our own origin.
  if (!SAFE_METHODS.includes(method) && !originAllowed(req)) {
    return { resp: errorResponse('cross-origin request rejected', 403), profileId: null };
  }

  if (path === '/api/auth/login' && method === 'POST') {
    return { resp: await postLogin(req, ip), profileId: null };
  }

  const auth: Auth | null = resolveAuth(req);

  if (path === '/api/auth/me' && method === 'GET') return done(getMe(auth), auth);
  if (path === '/api/auth/logout' && method === 'POST') return done(postLogout(auth), auth);

  // ---- everything below requires a session ----
  if (!auth) return { resp: errorResponse('authentication required', 401), profileId: null };

  if (path === '/api/auth/profile' && method === 'POST') return done(await postProfile(req, auth), auth);

  if (path === '/api/today' && method === 'GET') return done(getToday(url, auth), auth);

  if (path === '/api/places' && method === 'GET') return done(getPlaces(url, auth), auth);
  if (path === '/api/places' && method === 'POST') return done(await postPlaces(req, auth), auth);

  const placeVisitsId = match(path, '/api/places', '/visits');
  if (placeVisitsId) {
    if (method === 'GET') return done(getPlaceVisits(auth, placeVisitsId), auth);
    if (method === 'POST') return done(await postPlaceVisit(req, auth, placeVisitsId), auth);
  }

  const placePhotosId = match(path, '/api/places', '/photos');
  if (placePhotosId && method === 'POST') return done(await postPlacePhotos(req, auth, placePhotosId), auth);

  const placeId = match(path, '/api/places');
  if (placeId) {
    if (method === 'GET') return done(getPlaceById(auth, placeId), auth);
    if (method === 'PUT') return done(await putPlace(req, auth, placeId), auth);
    if (method === 'DELETE') return done(await deletePlaceById(auth, placeId), auth);
  }

  if (path === '/api/photos' && method === 'GET') return done(getPhotos(url, auth), auth);

  const photoFileId = match(path, '/api/photos', '/file');
  if (photoFileId && method === 'GET') return done(await getPhotoFile(auth, photoFileId), auth);

  const photoId = match(path, '/api/photos');
  if (photoId && method === 'DELETE') return done(await deletePhotoById(auth, photoId), auth);

  if (path === '/api/categories' && method === 'GET') return done(getCategories(auth), auth);
  if (path === '/api/categories' && method === 'POST') return done(await postCategories(req, auth), auth);

  const categoryId = match(path, '/api/categories');
  if (categoryId) {
    if (method === 'PUT') return done(await putCategory(req, auth, categoryId), auth);
    if (method === 'DELETE') return done(deleteCategoryById(auth, categoryId), auth);
  }

  if (path === '/api/visits' && method === 'GET') return done(getVisits(url, auth), auth);

  const visitId = match(path, '/api/visits');
  if (visitId) {
    if (method === 'GET') return done(getVisitById(auth, visitId), auth);
    if (method === 'PUT') return done(await putVisit(req, auth, visitId), auth);
    if (method === 'DELETE') return done(deleteVisitById(auth, visitId), auth);
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
  return { resp, profileId: auth?.profile?.id ?? null };
}

export function init(host: string, port: number) {
  return Deno.serve({ hostname: host, port }, async (req, info) => {
    const start = Date.now();
    const url = new URL(req.url);
    const requestId = crypto.randomUUID().slice(0, 8);
    const ip = getClientIp(req, info.remoteAddr.hostname);

    try {
      if (url.pathname.startsWith('/api')) {
        const { resp, profileId } = await routeApi(req, url, ip);

        // Session cookies and note contents are deliberately absent from this line.
        logger.info('request', {
          requestId,
          method: req.method,
          path: url.pathname,
          status: resp.status,
          durationMs: Date.now() - start,
          profileId,
        });
        return resp;
      }

      if (isTraversal(url.pathname)) return new Response('400 Bad Request', { status: 400 });

      for (const ext of RESOURCE_FILE_ENDING) {
        if (url.pathname.endsWith(ext)) {
          const cacheControl = url.searchParams.has('v') ? STATIC_IMMUTABLE : STATIC_REVALIDATE;
          return withCache(await serveFile(req, `${root}${url.pathname}`), cacheControl);
        }
      }

      try {
        return withCache(await serveFile(req, `${root}/index.html`), HTML_NO_CACHE);
      } catch {
        return new Response('404 File not found', { status: 404 });
      }
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
  });
}
