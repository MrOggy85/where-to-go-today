import type { Auth } from '../auth/session.ts';
import {
  createCategory,
  deleteCategory,
  DuplicateCategoryError,
  listCategories,
  renameCategory,
} from '../db/categories.ts';
import { errorResponse, jsonResponse, MAX_CATEGORY, readJson, str, ValidationError } from '../db/validate.ts';

// deno-lint-ignore no-explicit-any
type Body = Record<string, any>;

export function getCategories(auth: Auth): Response {
  return jsonResponse({ categories: listCategories(auth.householdId) });
}

export async function postCategories(req: Request, auth: Auth): Promise<Response> {
  const parsed = await readJson<Body>(req);
  if (!parsed.ok) return parsed.resp;

  try {
    const name = str(parsed.value.name, 'name', MAX_CATEGORY);
    return jsonResponse({ category: createCategory(auth.householdId, name) }, 201);
  } catch (e) {
    return categoryError(e);
  }
}

export async function putCategory(req: Request, auth: Auth, id: string): Promise<Response> {
  const parsed = await readJson<Body>(req);
  if (!parsed.ok) return parsed.resp;

  try {
    const name = str(parsed.value.name, 'name', MAX_CATEGORY);
    const category = renameCategory(auth.householdId, id, name);
    if (!category) return errorResponse('category not found', 404);
    return jsonResponse({ category });
  } catch (e) {
    return categoryError(e);
  }
}

/** Deleting untags the places that carry it; the client warns with the count first. */
export function deleteCategoryById(auth: Auth, id: string): Response {
  const result = deleteCategory(auth.householdId, id);
  if (!result) return errorResponse('category not found', 404);
  return jsonResponse({ result: 'deleted', untagged: result.untagged });
}

function categoryError(e: unknown): Response {
  if (e instanceof DuplicateCategoryError) return errorResponse(e.message, 409);
  if (e instanceof ValidationError) return errorResponse(e.message);
  throw e;
}
