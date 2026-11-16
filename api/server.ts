import { serveFile } from 'jsr:@std/http@1/file-server';
import { fromFileUrl } from 'jsr:@std/path@1';
import { handle, type Platform } from './app.ts';
import { MAX_REQUESTS, memoryLimiter, REQUEST_WINDOW_MS } from './auth/guard.ts';
import { geoAllowed } from './auth/geo.ts';

/** The Deno server: the shared handler behind `Deno.serve`, files from disk, in-memory throttles. */

const root = Deno.env.get('CLIENT_ROOT') ?? fromFileUrl(new URL('./client', import.meta.url));

// Opt-in, because an attacker can put anything in X-Forwarded-For and would otherwise get
// a fresh rate-limit bucket per request. Set TRUST_PROXY=1 only when a reverse proxy that
// overwrites the header sits in front.
const TRUST_PROXY = Deno.env.get('TRUST_PROXY') === '1';

const requests = memoryLimiter(REQUEST_WINDOW_MS, MAX_REQUESTS);

function platform(remoteAddr: string): Platform {
  return {
    clientIp(req) {
      if (!TRUST_PROXY) return remoteAddr;
      const forwarded = req.headers.get('x-forwarded-for');
      return forwarded ? forwarded.split(',')[0].trim() : remoteAddr;
    },
    // Behind the reverse proxy the request URL carries the internal host, so trust the
    // forwarded host first and fall back to the Host header.
    expectedHost: (req) => req.headers.get('x-forwarded-host') ?? req.headers.get('host'),
    geoAllowed: (_req, ip) => geoAllowed(ip),
    requestAllowed: (ip) => requests.hit(ip),
    serveAsset: (req, url) => serveFile(req, `${root}${url.pathname}`),
    async servePage(req) {
      try {
        return await serveFile(req, `${root}/index.html`);
      } catch {
        return new Response('404 File not found', { status: 404 });
      }
    },
  };
}

export function init(host: string, port: number) {
  return Deno.serve({ hostname: host, port }, (req, info) => handle(req, platform(info.remoteAddr.hostname)));
}
