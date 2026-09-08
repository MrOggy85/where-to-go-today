import type { CostLevel, PlaceEnvironment, PlaceStatus, Tristate } from './types.ts';

// Free-text caps. Generous for a family, small enough that a runaway paste cannot fill
// the disk or blow up a JSON response.
export const MAX_NAME = 200;
export const MAX_URL = 2000;
export const MAX_NOTES = 4000;
export const MAX_ADDRESS = 500;
export const MAX_CATEGORIES = 12;
export const MAX_CATEGORY = 40;
export const MAX_BODY_BYTES = 64 * 1024;

export const ENVIRONMENTS: PlaceEnvironment[] = ['indoor', 'outdoor', 'mixed'];
export const STATUSES: PlaceStatus[] = ['active', 'archived'];
export const COST_LEVELS: CostLevel[] = ['free', 'low', 'medium', 'high'];
export const TRISTATES: Tristate[] = ['yes', 'no', 'unknown'];

export function jsonResponse(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

export function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

export class ValidationError extends Error {}

export type ReadJsonResult<T> = { ok: true; value: T } | { ok: false; resp: Response };

export async function readJson<T>(req: Request): Promise<ReadJsonResult<T>> {
  const length = Number(req.headers.get('content-length') ?? '0');
  if (length > MAX_BODY_BYTES) return { ok: false, resp: errorResponse('body too large', 413) };

  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return { ok: false, resp: errorResponse('body too large', 413) };

  try {
    const value = JSON.parse(text || '{}');
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { ok: false, resp: errorResponse('expected a JSON object') };
    }
    return { ok: true, value: value as T };
  } catch {
    return { ok: false, resp: errorResponse('invalid JSON') };
  }
}

export function str(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') throw new ValidationError(`${field} must be a string`);
  const trimmed = value.trim();
  if (!trimmed) throw new ValidationError(`${field} is required`);
  if (trimmed.length > max) throw new ValidationError(`${field} is too long`);
  return trimmed;
}

/** Optional free text: '' and null both clear the field. */
export function optStr(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new ValidationError(`${field} must be a string`);
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) throw new ValidationError(`${field} is too long`);
  return trimmed;
}

export function optInt(value: unknown, field: string, min: number, max: number): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) throw new ValidationError(`${field} must be a number`);
  const i = Math.round(n);
  if (i < min || i > max) throw new ValidationError(`${field} must be between ${min} and ${max}`);
  return i;
}

export function optFloat(value: unknown, field: string, min: number, max: number): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) throw new ValidationError(`${field} must be a number`);
  if (n < min || n > max) throw new ValidationError(`${field} must be between ${min} and ${max}`);
  return n;
}

/** null stays null: a missing trait means "unknown", never "no". */
export function optBool(value: unknown, field: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'boolean') throw new ValidationError(`${field} must be a boolean`);
  return value ? 1 : 0;
}

export function oneOf<T extends string>(value: unknown, field: string, allowed: T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new ValidationError(`${field} must be one of ${allowed.join(', ')}`);
  }
  return value as T;
}

export function optOneOf<T extends string>(value: unknown, field: string, allowed: T[]): T | null {
  if (value === undefined || value === null || value === '') return null;
  return oneOf(value, field, allowed);
}

/** Category ids as sent by the form. Ownership is checked separately, against the household. */
export function optCategoryIds(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ValidationError('categoryIds must be an array');
  if (value.length > MAX_CATEGORIES) throw new ValidationError('too many categories');
  const out = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== 'string') throw new ValidationError('categoryIds must be strings');
    const id = raw.trim();
    if (id) out.add(id);
  }
  return [...out];
}

/** ISO timestamp, rejected if unparseable or absurdly far from now. */
export function optIsoDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new ValidationError(`${field} must be a string`);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new ValidationError(`${field} is not a valid date`);
  const year = d.getUTCFullYear();
  if (year < 1970 || year > 2200) throw new ValidationError(`${field} is out of range`);
  return d.toISOString();
}

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  // Guard the empty cases first: Number(null) and Number('') are 0, not "absent".
  if (value === null || value === undefined || value === '') return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}
