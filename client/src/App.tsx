import { useEffect, useState } from 'react';
import { api } from './api.ts';
import { navigate, type Route, useHashRoute } from './useHashRoute.ts';
import { Login } from './pages/Login.tsx';
import { Today } from './pages/Today.tsx';
import { Places } from './pages/Places.tsx';
import { PlaceDetail } from './pages/PlaceDetail.tsx';
import { PlaceForm } from './pages/PlaceForm.tsx';
import { ChevronRight, Compass, MapPin } from './icons.tsx';
import { ConfirmSheet } from './components/Sheet.tsx';
import type { Me } from './types.ts';
import css from './App.module.css';
import './global.css';

/**
 * Detail and form routes are pushed views and need a way back. Resolved to a parent route
 * rather than history.back(), which would leave the app when a place link is opened cold.
 */
function parentOf(route: Route): string | null {
  switch (route.name) {
    case 'place':
    case 'newPlace':
      return '/places';
    case 'editPlace':
      return `/places/${route.id}`;
    default:
      return null;
  }
}

export function App() {
  const route = useHashRoute();
  const [me, setMe] = useState<Me | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    api.me().then(setMe).catch(() => setMe({ authenticated: false }));
  }, []);

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

  const parent = parentOf(route);

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
      </main>

      <nav className={css.nav}>
        <button
          type='button'
          className={route.name === 'today' ? css.navItemActive : css.navItem}
          aria-current={route.name === 'today' ? 'page' : undefined}
          onClick={() => navigate('/')}
        >
          <Compass size={22} />
          Today
        </button>
        <button
          type='button'
          className={route.name === 'today' ? css.navItem : css.navItemActive}
          aria-current={route.name === 'today' ? undefined : 'page'}
          onClick={() => navigate('/places')}
        >
          <MapPin size={22} />
          Places
        </button>
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
