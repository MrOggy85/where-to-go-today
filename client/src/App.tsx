import { useEffect, useState } from 'react';
import { api } from './api.ts';
import { navigate, type Route, useHashRoute } from './useHashRoute.ts';
import { Login } from './pages/Login.tsx';
import { Today } from './pages/Today.tsx';
import { Places } from './pages/Places.tsx';
import { PlaceDetail } from './pages/PlaceDetail.tsx';
import { PlaceForm } from './pages/PlaceForm.tsx';
import { Categories } from './pages/Categories.tsx';
import { Visits } from './pages/Visits.tsx';
import { Photos } from './pages/Photos.tsx';
import { PlacePhotos } from './pages/PlacePhotos.tsx';
import { VisitForm } from './pages/VisitForm.tsx';
import { Calendar, ChevronRight, Compass, Image, MapPin } from './icons.tsx';
import { ConfirmSheet } from './components/Sheet.tsx';
import type { Me } from './types.ts';
import css from './App.module.css';
import './global.css';

/**
 * `owns` lists the routes that light a tab up, so pushed views keep their parent lit.
 * `visit` is deliberately absent: it hangs off whichever of two screens opened it.
 *
 * Four tabs, not five: "Categories" cannot fit a phone alongside the others at any
 * padding, and it is a management screen rather than somewhere to browse. It is reached
 * from the category filter on Places instead.
 */
const TABS: { to: string; label: string; icon: typeof Compass; owns: Route['name'][] }[] = [
  { to: '/', label: 'Today', icon: Compass, owns: ['today'] },
  {
    to: '/places',
    label: 'Places',
    icon: MapPin,
    owns: ['places', 'newPlace', 'place', 'editPlace', 'placePhotos', 'newVisit', 'categories'],
  },
  { to: '/visits', label: 'Visits', icon: Calendar, owns: ['visits', 'logVisit'] },
  { to: '/photos', label: 'Photos', icon: Image, owns: ['photos'] },
];

/**
 * Detail and form routes are pushed views and need a way back. Resolved to a parent route
 * rather than history.back(), which would leave the app when a place link is opened cold.
 *
 * A visit is reachable from a place's history and from the visits list, so it goes back
 * to whichever one was last open; `visitOrigin` is the cold-link fallback otherwise.
 */
function parentOf(route: Route, visitOrigin: string): string | null {
  switch (route.name) {
    case 'place':
    case 'newPlace':
    case 'categories':
      return '/places';
    case 'editPlace':
    case 'placePhotos':
      return `/places/${route.id}`;
    case 'newVisit':
      return `/places/${route.placeId}`;
    case 'logVisit':
      return '/visits';
    case 'visit':
      return visitOrigin;
    default:
      return null;
  }
}

export function App() {
  const route = useHashRoute();
  const [me, setMe] = useState<Me | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [visitOrigin, setVisitOrigin] = useState('/places');

  useEffect(() => {
    api.me().then(setMe).catch(() => setMe({ authenticated: false }));
  }, []);

  // Remembered on the way in, so the visit page knows which screen sent it there.
  useEffect(() => {
    if (route.name === 'visits') setVisitOrigin('/visits');
    else if (route.name === 'place') setVisitOrigin(`/places/${route.id}`);
  }, [route]);

  if (!me) return <div className={css.center} />;

  // A session without a selected profile still lands on the profile picker, so every
  // recorded visit is attributed to whoever is actually holding the phone.
  if (!me.authenticated || !me.profile) {
    return (
      <div className={css.authShell}>
        <div className={css.authInner}>
          <Login me={me} onChange={setMe} />
        </div>
      </div>
    );
  }

  const profile = me.profile;

  async function signOut() {
    await api.logout();
    setMe({ authenticated: false });
    navigate('/');
  }

  const parent = parentOf(route, visitOrigin);
  // A visit owns no tab of its own, so it lights the one it was opened from.
  const activeTo = route.name === 'visit'
    ? (visitOrigin === '/visits' ? '/visits' : '/places')
    : TABS.find((t) => t.owns.includes(route.name))?.to;

  return (
    <div className={css.shell}>
      <header className={css.header}>
        {parent
          ? (
            <button type='button' className={css.iconButton} aria-label='Back' onClick={() => navigate(parent)}>
              {/* Rotated rather than a separate glyph: same path, one fewer icon. */}
              <ChevronRight size={22} className={css.backIcon} />
            </button>
          )
          : <span className={css.spacerLeft} />}

        <button
          type='button'
          className={css.avatar}
          aria-label={`Signed in as ${profile.name}`}
          onClick={() => setMenuOpen(true)}
        >
          {profile.name.slice(0, 1).toUpperCase()}
        </button>
      </header>

      <main className={css.main}>
        {route.name === 'today' && <Today />}
        {route.name === 'places' && <Places />}
        {route.name === 'newPlace' && <PlaceForm />}
        {route.name === 'editPlace' && <PlaceForm id={route.id} />}
        {route.name === 'place' && <PlaceDetail id={route.id} />}
        {route.name === 'placePhotos' && <PlacePhotos id={route.id} />}
        {route.name === 'newVisit' && <VisitForm placeId={route.placeId} />}
        {route.name === 'logVisit' && <VisitForm />}
        {route.name === 'visit' && <VisitForm visitId={route.id} />}
        {route.name === 'categories' && <Categories />}
        {route.name === 'visits' && <Visits />}
        {route.name === 'photos' && <Photos />}
      </main>

      <nav className={css.nav}>
        {TABS.map((tab) => {
          const active = tab.to === activeTo;
          return (
            <button
              key={tab.to}
              type='button'
              className={active ? css.navItemActive : css.navItem}
              aria-current={active ? 'page' : undefined}
              onClick={() => navigate(tab.to)}
            >
              <tab.icon size={22} />
              <span className={css.navLabel}>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <ConfirmSheet
        request={menuOpen
          ? { title: `Signed in as ${profile.name}`, confirmLabel: 'Sign out', onConfirm: signOut }
          : null}
        onDismiss={() => setMenuOpen(false)}
      />
    </div>
  );
}
