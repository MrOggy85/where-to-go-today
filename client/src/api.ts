import type {
  Category,
  CategoryWithCount,
  Me,
  Photo,
  Place,
  TodayResponse,
  Visit,
  VisitWithPlace,
  WeatherPicks,
} from './types.ts';
import type { PreparedPhoto } from './photos.ts';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // FormData must set its own content-type: the multipart boundary is part of it.
  const json = init?.body !== undefined && !(init.body instanceof FormData);

  const resp = await fetch(path, {
    ...init,
    headers: json ? { 'content-type': 'application/json', ...init?.headers } : init?.headers,
  });

  const text = await resp.text();
  const body = text ? JSON.parse(text) : {};

  if (!resp.ok) throw new ApiError(body.error ?? `request failed (${resp.status})`, resp.status);
  return body as T;
}

export const api = {
  me: () => request<Me>('/api/auth/me'),

  login: (password: string) => request<Me>('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),

  chooseProfile: (profileId: string) =>
    request<{ profile: Me['profile'] }>('/api/auth/profile', { method: 'POST', body: JSON.stringify({ profileId }) }),

  logout: () => request<Me>('/api/auth/logout', { method: 'POST' }),

  today: (picks: WeatherPicks, maxTravelMinutes?: number, availableMinutes?: number) => {
    const params = new URLSearchParams();
    if (picks.temperatureC !== undefined) params.set('temperatureC', String(picks.temperatureC));
    if (picks.rain !== undefined) params.set('rain', String(picks.rain));
    if (picks.sunny !== undefined) params.set('sunny', String(picks.sunny));
    if (picks.windy !== undefined) params.set('windy', String(picks.windy));
    if (maxTravelMinutes !== undefined) params.set('maxTravelMinutes', String(maxTravelMinutes));
    if (availableMinutes !== undefined) params.set('availableMinutes', String(availableMinutes));
    params.set('limit', '8');
    return request<TodayResponse>(`/api/today?${params}`);
  },

  places: (filters: Record<string, string> = {}) => {
    const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
    return request<{ places: Place[]; categories: CategoryWithCount[] }>(`/api/places?${params}`);
  },

  categories: () => request<{ categories: CategoryWithCount[] }>('/api/categories'),

  createCategory: (name: string) =>
    request<{ category: Category }>('/api/categories', { method: 'POST', body: JSON.stringify({ name }) }),

  renameCategory: (id: string, name: string) =>
    request<{ category: Category }>(`/api/categories/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),

  deleteCategory: (id: string) =>
    request<{ result: string; untagged: number }>(`/api/categories/${id}`, { method: 'DELETE' }),

  place: (id: string) => request<{ place: Place; visits: Visit[] }>(`/api/places/${id}`),

  createPlace: (body: unknown) =>
    request<{ place: Place }>('/api/places', { method: 'POST', body: JSON.stringify(body) }),

  updatePlace: (id: string, body: unknown) =>
    request<{ place: Place }>(`/api/places/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  deletePlace: (id: string) => request<{ result: 'deleted' | 'archived' }>(`/api/places/${id}`, { method: 'DELETE' }),

  recordVisit: (placeId: string, body: { visitedAt?: string; note?: string; rating?: number } = {}) =>
    request<{ visit: Visit; place: Place }>(`/api/places/${placeId}/visits`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /** The visits list, newest first. Older pages come back by offset. */
  visits: (limit: number, offset = 0) =>
    request<{ visits: VisitWithPlace[] }>(`/api/visits?limit=${limit}&offset=${offset}`),

  visit: (id: string) => request<{ visit: Visit; place: Place }>(`/api/visits/${id}`),

  updateVisit: (id: string, body: { visitedAt?: string; note?: string | null }) =>
    request<{ visit: Visit }>(`/api/visits/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  deleteVisit: (id: string) => request<{ result: string }>(`/api/visits/${id}`, { method: 'DELETE' }),

  photos: (filters: { placeId?: string; visitId?: string } = {}) => {
    const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]);
    return request<{ photos: Photo[] }>(`/api/photos?${params}`);
  },

  /** Dimensions and timestamps ride along as parallel comma-separated lists. */
  uploadPhotos: (placeId: string, prepared: PreparedPhoto[], visitId?: string) => {
    const form = new FormData();
    for (const p of prepared) form.append('photos', p.file);
    form.set('widths', prepared.map((p) => p.width).join(','));
    form.set('heights', prepared.map((p) => p.height).join(','));
    form.set('capturedAt', prepared.map((p) => p.capturedAt ?? '').join(','));
    if (visitId) form.set('visitId', visitId);

    return request<{ photos: Photo[] }>(`/api/places/${placeId}/photos`, { method: 'POST', body: form });
  },

  deletePhoto: (id: string) => request<{ result: string }>(`/api/photos/${id}`, { method: 'DELETE' }),
};
