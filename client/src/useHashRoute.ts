import { useEffect, useState } from 'react';

export type Route =
  | { name: 'today' }
  | { name: 'places' }
  | { name: 'newPlace' }
  | { name: 'place'; id: string }
  | { name: 'editPlace'; id: string }
  | { name: 'placePhotos'; id: string }
  | { name: 'newVisit'; placeId: string }
  | { name: 'visit'; id: string }
  | { name: 'categories' }
  | { name: 'photos' };

function parse(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  const parts = path.split('/').filter(Boolean);

  if (parts[0] === 'categories') return { name: 'categories' };
  if (parts[0] === 'photos') return { name: 'photos' };
  if (parts[0] === 'visits' && parts[1]) return { name: 'visit', id: parts[1] };
  if (parts[0] !== 'places') return { name: 'today' };
  if (parts.length === 1) return { name: 'places' };
  if (parts[1] === 'new') return { name: 'newPlace' };
  if (parts[2] === 'edit') return { name: 'editPlace', id: parts[1] };
  if (parts[2] === 'photos') return { name: 'placePhotos', id: parts[1] };
  if (parts[2] === 'visits' && parts[3] === 'new') return { name: 'newVisit', placeId: parts[1] };
  return { name: 'place', id: parts[1] };
}

/** Hash routing keeps the server free of SPA route knowledge; no router dependency. */
export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(globalThis.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parse(globalThis.location.hash));
    globalThis.addEventListener('hashchange', onChange);
    return () => globalThis.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}

export function navigate(to: string) {
  globalThis.location.hash = to;
}
