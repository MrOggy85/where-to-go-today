import { useEffect, useState } from 'react';
import { api } from './api.ts';
import { navigate, useHashRoute } from './useHashRoute.ts';
import { Login } from './pages/Login.tsx';
import { Today } from './pages/Today.tsx';
import { Places } from './pages/Places.tsx';
import { PlaceDetail } from './pages/PlaceDetail.tsx';
import { PlaceForm } from './pages/PlaceForm.tsx';
import type { Me } from './types.ts';
import css from './App.module.css';
import './global.css';

export function App() {
  const route = useHashRoute();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    api.me().then(setMe).catch(() => setMe({ authenticated: false }));
  }, []);

  if (!me) return <div className={css.center}>Loading…</div>;

  // A session without a selected profile still lands on the profile picker, so every
  // recorded visit is attributed to whoever is actually holding the phone.
  if (!me.authenticated || !me.profile) {
    return (
      <div className={css.shell}>
        <header className={css.header}>
          <span className={css.title}>What should we do today?</span>
        </header>
        <main className={css.main}>
          <Login me={me} onChange={setMe} />
        </main>
      </div>
    );
  }

  async function signOut() {
    await api.logout();
    setMe({ authenticated: false });
    navigate('/');
  }

  return (
    <div className={css.shell}>
      <header className={css.header}>
        <span className={css.title}>What should we do today?</span>
        <span className={css.who}>
          {me.profile.name}
          <button type='button' className={css.linkButton} onClick={signOut}>Sign out</button>
        </span>
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
          onClick={() => navigate('/')}
        >
          Today
        </button>
        <button
          type='button'
          className={route.name === 'today' ? css.navItem : css.navItemActive}
          onClick={() => navigate('/places')}
        >
          Places
        </button>
      </nav>
    </div>
  );
}
