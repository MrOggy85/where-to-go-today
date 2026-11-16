import { config } from '../config.ts';
import logger from '../logger.ts';

// PBKDF2-HMAC-SHA256 via Web Crypto. No native dependency, no build step, and strong
// enough for a single shared household password behind a rate-limited, country-filtered
// login. New hashes use `config.pbkdf2Iterations`: 100,000, the most Cloudflare Workers
// accepts. Older hashes carry their own count and still verify on Deno; on a Worker a
// count above 100,000 throws, which is logged so a failing login says why: reset the
// password to rehash it.
const KEY_BITS = 256;
const SALT_BYTES = 16;

function toBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(s: string) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

/** Encoded as `pbkdf2$<iterations>$<saltB64>$<hashB64>` so the cost can be raised later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iterations = config.pbkdf2Iterations;
  const hash = await derive(password, salt, iterations);
  return `pbkdf2$${iterations}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;

  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 1) return false;

  const expected = fromBase64(parts[3]);
  let actual: Uint8Array;
  try {
    actual = await derive(password, fromBase64(parts[2]), iterations);
  } catch (err) {
    logger.error('password check failed, reset the password to rehash it', {
      iterations,
      error: logger.serializeError(err),
    });
    return false;
  }
  return timingSafeEqual(expected, actual);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
