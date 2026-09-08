/**
 * Resizes and re-encodes a picked image in the browser before it is uploaded.
 *
 * Doing it here rather than on the server is what keeps an image library out of the api:
 * the canvas already decodes whatever the platform can display, so an iPhone HEIC arrives
 * as a JPEG. It also means a 4MB phone photo travels as a few hundred KB over the Funnel,
 * and EXIF (including GPS) is dropped on re-encode rather than stored on the home server.
 */

/** Long edge in pixels. One stored size serves both the grid and the full view. */
const MAX_EDGE = 1600;
const QUALITY = 0.82;

export interface PreparedPhoto {
  file: File;
  width: number;
  height: number;
  /** The file's own timestamp. Not EXIF capture time, which the re-encode discards. */
  capturedAt?: string;
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const source = await decode(file);
  const from = { width: sourceWidth(source), height: sourceHeight(source) };
  if (!from.width || !from.height) throw new Error(`${file.name || 'that file'} is not an image`);

  const scale = Math.min(1, MAX_EDGE / Math.max(from.width, from.height));
  const width = Math.round(from.width * scale);
  const height = Math.round(from.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('this browser cannot resize images');
  ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);

  if ('close' in source) source.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
  if (!blob) throw new Error(`could not process ${file.name || 'that file'}`);

  return {
    file: new File([blob], jpegName(file.name), { type: 'image/jpeg' }),
    width,
    height,
    capturedAt: file.lastModified ? new Date(file.lastModified).toISOString() : undefined,
  };
}

/**
 * Prepares a whole picked batch, keeping the names of any that could not be read rather
 * than failing the lot: one unreadable file should not discard the other nine.
 */
export async function prepareAll(files: File[]): Promise<{ prepared: PreparedPhoto[]; failed: string[] }> {
  const prepared: PreparedPhoto[] = [];
  const failed: string[] = [];

  for (const file of files) {
    try {
      prepared.push(await preparePhoto(file));
    } catch {
      failed.push(file.name || 'one file');
    }
  }

  return { prepared, failed };
}

/** `from-image` so a portrait phone photo is not stored rotated. */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Older Safari rejects the options argument; fall through to an <img>.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`could not read ${file.name || 'that file'}`));
      img.src = url;
    });
    await img.decode?.().catch(() => {});
    return img;
  } finally {
    // Safe once the image has loaded: the bitmap is already decoded.
    URL.revokeObjectURL(url);
  }
}

function sourceWidth(s: ImageBitmap | HTMLImageElement): number {
  return 'naturalWidth' in s ? s.naturalWidth : s.width;
}

function sourceHeight(s: ImageBitmap | HTMLImageElement): number {
  return 'naturalHeight' in s ? s.naturalHeight : s.height;
}

function jpegName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '') || 'photo';
  return `${base}.jpg`;
}

/** The URL an <img> reads. Authorized by the session cookie, never a static file path. */
export function photoUrl(id: string): string {
  return `/api/photos/${id}/file`;
}
