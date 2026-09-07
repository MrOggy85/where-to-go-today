import type { Me, Place, TodayResponse, Visit, WeatherPicks } from './types.ts';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(path, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json', ...init?.headers } : init?.headers,
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
    return request<{ places: Place[]; categories: string[] }>(`/api/places?${params}`);
  },

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

  deleteVisit: (id: string) => request<{ result: string }>(`/api/visits/${id}`, { method: 'DELETE' }),
};
