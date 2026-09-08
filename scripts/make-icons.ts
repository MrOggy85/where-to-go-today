/**
 * Generates the home-screen and favicon PNGs from the same mark as client/static/icon.svg.
 *
 *   deno run --allow-write=client/static scripts/make-icons.ts
 *
 * Run by hand via `make icons`; the output is committed. No image library: a PNG is a
 * signature, an IHDR chunk, zlib-compressed scanlines in IDAT and an IEND, with a CRC32
 * per chunk. CompressionStream('deflate') already emits the zlib wrapper that IDAT wants,
 * so the only thing missing from the platform is the CRC.
 */
import { fromFileUrl } from 'jsr:@std/path@1';

const OUT = fromFileUrl(new URL('../client/static/', import.meta.url));

// Matches --canvas and --accent in client/src/tokens.css.
const CANVAS: RGB = [250, 249, 247];
const ACCENT: RGB = [180, 83, 58];

type RGB = [number, number, number];

/* ---------- PNG encoding ---------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes);
  body.set(data, typeBytes.length);

  const out = new Uint8Array(body.length + 8);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(body, 4);
  view.setUint32(out.length - 4, crc32(body));
  return out;
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** `rgb` holds width*height*3 bytes; PNG colour type 2 (truecolour), 8 bits per channel. */
async function encodePng(rgb: Uint8Array, size: number): Promise<Uint8Array> {
  // One filter byte (0 = none) per scanline.
  const raw = new Uint8Array(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    raw.set(rgb.subarray(y * size * 3, (y + 1) * size * 3), y * (size * 3 + 1) + 1);
  }

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, size);
  view.setUint32(4, size);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  // 10-12 stay zero: deflate, adaptive filtering, no interlace.

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', await deflate(raw)),
    chunk('IEND', new Uint8Array(0)),
  ];

  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    png.set(p, offset);
    offset += p.length;
  }
  return png;
}

/* ---------- the mark ---------- */

// The compass needle, in fractions of the icon box. Same kite as the Compass glyph in
// client/src/icons.tsx, scaled up so the icon and the nav item read as one mark.
const NEEDLE: [number, number][] = [
  [0.7025, 0.2975],
  [0.6013, 0.6013],
  [0.2975, 0.7025],
  [0.3988, 0.3988],
];

const RING_R = 0.36;
const RING_HALF_STROKE = 0.028;

function inPolygon(px: number, py: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Terracotta field with a cream compass. Drawn as coverage tests at 4x and
 * box-downsampled, which is cheaper to write than analytic anti-aliasing and just as
 * clean at these sizes.
 */
function shade(x: number, y: number, s: number): RGB {
  // Normalised to the unit box so the geometry above is resolution independent.
  const u = x / s;
  const v = y / s;

  const d = Math.hypot(u - 0.5, v - 0.5);
  if (Math.abs(d - RING_R) <= RING_HALF_STROKE) return CANVAS;
  if (inPolygon(u, v, NEEDLE)) return CANVAS;

  return ACCENT;
}

function render(size: number): Uint8Array {
  const ss = 4; // supersample factor
  const out = new Uint8Array(size * size * 3);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const [pr, pg, pb] = shade(x + (sx + 0.5) / ss, y + (sy + 0.5) / ss, size);
          r += pr;
          g += pg;
          b += pb;
        }
      }
      const n = ss * ss;
      const i = (y * size + x) * 3;
      out[i] = Math.round(r / n);
      out[i + 1] = Math.round(g / n);
      out[i + 2] = Math.round(b / n);
    }
  }
  return out;
}

/* ---------- output ---------- */

const points = NEEDLE.map(([x, y]) => `${(x * 100).toFixed(2)},${(y * 100).toFixed(2)}`).join(' ');

const SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="What should we do today?">
  <rect width="100" height="100" rx="22" fill="rgb(${ACCENT.join(',')})"/>
  <circle cx="50" cy="50" r="${RING_R * 100}" fill="none" stroke="rgb(${CANVAS.join(',')})" stroke-width="${
    RING_HALF_STROKE * 200
  }"/>
  <polygon points="${points}" fill="rgb(${CANVAS.join(',')})"/>
</svg>
`;

await Deno.writeTextFile(`${OUT}icon.svg`, SVG);
console.log('wrote icon.svg');

for (
  const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512], [
    'favicon.png',
    32,
  ]] as const
) {
  await Deno.writeFile(`${OUT}${name}`, await encodePng(render(size), size));
  console.log(`wrote ${name} (${size}x${size})`);
}
