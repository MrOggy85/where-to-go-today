import { dirname, join } from 'jsr:@std/path@1';
import { sqlitePath } from '../db/sqlite.ts';
import logger from '../logger.ts';

// Country allowlist for the Deno server's public ingress (a Worker uses Cloudflare's own country, cloudflare/src). Off unless GEO_ALLOW_COUNTRIES is set (e.g. `JP`), so `make dev` and
// any deployment that is not public are unaffected.
const COUNTRIES = (Deno.env.get('GEO_ALLOW_COUNTRIES') ?? '')
  .split(',')
  .map((c) => c.trim().toUpperCase())
  .filter(Boolean);

export const geoEnabled = COUNTRIES.length > 0;

// Lives beside the database, inside the one volume that is already writable and backed up.
const FILE = Deno.env.get('GEO_FILE') ?? join(dirname(sqlitePath()), 'geo-allow.json');

const MAX_AGE_MS = 7 * 86_400_000;
const CHECK_INTERVAL_MS = 6 * 3_600_000;
const FETCH_TIMEOUT_MS = 120_000;

// Registration data, not geolocation: a range is in the list because the registry assigned it to an organisation in
// that country. Close enough for home and mobile ISPs. APNIC only, so the allowlist works for Asia-Pacific countries.
const APNIC = 'https://ftp.apnic.net/stats/apnic/delegated-apnic-latest';
// iCloud Private Relay exits through Akamai/Cloudflare/Fastly ranges registered in the US. Without Apple's own
// list, an iPhone with Private Relay on is refused by an allowlist it is physically inside.
const ICLOUD_RELAY = 'https://mask-api.icloud.com/egress-ip-ranges.csv';

type Range = [bigint, bigint];
type Table = { fetchedAt: string; v4: Range[]; v6: Range[] };

// Always allowed whatever the list says: the tailnet (CGNAT range and Tailscale's ULA) and loopback.
const ALWAYS: { v4: Range[]; v6: Range[] } = {
  v4: [cidr('100.64.0.0/10')!, cidr('127.0.0.0/8')!],
  v6: [cidr('fd7a:115c:a1e0::/48')!, cidr('::1/128')!],
};

let table: Table | null = null;
let refreshing = false;

function parseV4(s: string): bigint | null {
  const parts = s.split('.');
  if (parts.length !== 4) return null;
  let n = 0n;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p) || Number(p) > 255) return null;
    n = (n << 8n) | BigInt(p);
  }
  return n;
}

function parseV6(s: string): bigint | null {
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const groups = (h: string) => {
    if (!h) return [];
    const out: string[] = [];
    for (const g of h.split(':')) {
      if (g.includes('.')) {
        const v4 = parseV4(g);
        if (v4 === null) return null;
        out.push((v4 >> 16n).toString(16), (v4 & 0xffffn).toString(16));
      } else out.push(g);
    }
    return out;
  };
  const head = groups(halves[0]);
  const tail = halves.length === 2 ? groups(halves[1]) : [];
  if (!head || !tail) return null;
  const fill = 8 - head.length - tail.length;
  if (halves.length === 2 ? fill < 1 : fill !== 0) return null;
  let n = 0n;
  for (const g of [...head, ...Array(fill).fill('0'), ...tail]) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
    n = (n << 16n) | BigInt(parseInt(g, 16));
  }
  return n;
}

/** Returns the address family and value, or null for anything that is not an IP. */
function parseIp(raw: string): { v: 4 | 6; n: bigint } | null {
  const s = raw.trim().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(s);
  const v4 = parseV4(mapped ? mapped[1] : s);
  if (v4 !== null) return { v: 4, n: v4 };
  const v6 = s.includes(':') ? parseV6(s) : null;
  return v6 === null ? null : { v: 6, n: v6 };
}

function cidr(s: string): Range | null {
  const [addr, len] = s.split('/');
  const ip = parseIp(addr);
  if (!ip) return null;
  const bits = ip.v === 4 ? 32n : 128n;
  const prefix = len === undefined ? bits : BigInt(len);
  if (prefix < 0n || prefix > bits) return null;
  const host = (1n << (bits - prefix)) - 1n;
  return [ip.n & ~host, ip.n | host];
}

/** Sorted and merged, so a lookup is one binary search. */
function merge(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + 1n) {
      if (r[1] > last[1]) last[1] = r[1];
    } else out.push([r[0], r[1]]);
  }
  return out;
}

function contains(ranges: Range[], n: bigint) {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (n < ranges[mid][0]) hi = mid - 1;
    else if (n > ranges[mid][1]) lo = mid + 1;
    else return true;
  }
  return false;
}

/**
 * Whether a client may reach the app at all. Fails closed: with the allowlist on but no list loaded, only the tailnet
 * and loopback get in.
 */
export function geoAllowed(raw: string): boolean {
  if (!geoEnabled) return true;
  const ip = parseIp(raw);
  if (!ip) return false;
  const always = ip.v === 4 ? ALWAYS.v4 : ALWAYS.v6;
  if (contains(always, ip.n)) return true;
  if (!table) return false;
  return contains(ip.v === 4 ? table.v4 : table.v6, ip.n);
}

async function fetchText(url: string) {
  const resp = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!resp.ok) throw new Error(`${url}: HTTP ${resp.status}`);
  return await resp.text();
}

/** `apnic|JP|ipv4|1.0.16.0|4096|20110412|allocated`: ipv4 carries an address count, ipv6 a prefix length. */
function fromApnic(text: string, v4: Range[], v6: Range[]) {
  for (const line of text.split('\n')) {
    const f = line.split('|');
    if (f.length < 7 || !COUNTRIES.includes(f[1])) continue;
    if (f[6] !== 'allocated' && f[6] !== 'assigned') continue;
    if (f[2] === 'ipv4') {
      const start = parseV4(f[3]);
      if (start !== null) v4.push([start, start + BigInt(f[4]) - 1n]);
    } else if (f[2] === 'ipv6') {
      const r = cidr(`${f[3]}/${f[4]}`);
      if (r) v6.push(r);
    }
  }
}

/** `172.224.226.0/27,GB,GB-EN,London,` */
function fromICloudRelay(text: string, v4: Range[], v6: Range[]) {
  for (const line of text.split('\n')) {
    const [range, country] = line.split(',');
    if (!range || !COUNTRIES.includes(country)) continue;
    const r = cidr(range);
    if (r) (range.includes(':') ? v6 : v4).push(r);
  }
}

function serialize(t: Table) {
  const str = (rs: Range[]) => rs.map(([a, b]) => [a.toString(), b.toString()]);
  return JSON.stringify({ fetchedAt: t.fetchedAt, countries: COUNTRIES, v4: str(t.v4), v6: str(t.v6) });
}

function load(): Table | null {
  try {
    const raw = JSON.parse(Deno.readTextFileSync(FILE));
    if ([...raw.countries].sort().join() !== [...COUNTRIES].sort().join()) return null;
    const big = (rs: [string, string][]): Range[] => rs.map(([a, b]) => [BigInt(a), BigInt(b)]);
    return { fetchedAt: raw.fetchedAt, v4: big(raw.v4), v6: big(raw.v6) };
  } catch {
    return null;
  }
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const v4: Range[] = [];
    const v6: Range[] = [];
    fromApnic(await fetchText(APNIC), v4, v6);
    // Optional: a relay list outage must not take the registry ranges down with it.
    try {
      fromICloudRelay(await fetchText(ICLOUD_RELAY), v4, v6);
    } catch (err) {
      logger.warn('geo: icloud relay list unavailable', { error: logger.serializeError(err) });
    }

    const next: Table = { fetchedAt: new Date().toISOString(), v4: merge(v4), v6: merge(v6) };
    const size = next.v4.length + next.v6.length;
    // A truncated download parses fine and would quietly lock most of the country out.
    const previous = table ? table.v4.length + table.v6.length : 0;
    if (size === 0 || size < previous / 2) {
      throw new Error(`refusing a list of ${size} ranges (previous ${previous})`);
    }

    Deno.writeTextFileSync(`${FILE}.tmp`, serialize(next));
    Deno.renameSync(`${FILE}.tmp`, FILE);
    table = next;
    logger.info('geo: allowlist refreshed', { countries: COUNTRIES, v4: next.v4.length, v6: next.v6.length });
  } catch (err) {
    // The previous list stays in force. The monitor notices when the file grows old.
    logger.error('geo: allowlist refresh failed', { error: logger.serializeError(err) });
  } finally {
    refreshing = false;
  }
}

function stale() {
  return !table || Date.now() - Date.parse(table.fetchedAt) > MAX_AGE_MS;
}

export function startGeoRefresh() {
  if (!geoEnabled) return;
  table = load();
  if (table) logger.info('geo: allowlist loaded', { countries: COUNTRIES, fetchedAt: table.fetchedAt });
  else logger.warn('geo: no allowlist on disk, only the tailnet is admitted until it is fetched');
  if (stale()) refresh();
  const timer = setInterval(() => stale() && refresh(), CHECK_INTERVAL_MS);
  Deno.unrefTimer(timer);
}
