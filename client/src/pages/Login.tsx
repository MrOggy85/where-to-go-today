import { useState } from 'react';
import { api } from '../api.ts';
import { ChevronRight, Compass } from '../icons.tsx';
import type { Me } from '../types.ts';
import ui from '../ui.module.css';
import css from './Login.module.css';

interface Props {
  me: Me;
  onChange: (me: Me) => void;
}

/** Two steps: the shared household password, then which adult is holding the phone. */
export function Login({ me, onChange }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onChange(await api.login(password));
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'login failed');
    } finally {
      setBusy(false);
    }
  }

  async function choose(profileId: string) {
    setBusy(true);
    try {
      await api.chooseProfile(profileId);
      onChange(await api.me());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not select profile');
      setBusy(false);
    }
  }

  const picking = me.authenticated && me.profiles;

  return (
    <div>
      <div className={css.brand}>
        <span className={css.mark}>
          <Compass size={28} />
        </span>
        <h1 className={css.wordmark}>What should we do today?</h1>
        <p className={css.sub}>{picking ? 'Who is using the app?' : 'A private family outing planner'}</p>
      </div>

      {error && <p className={ui.error}>{error}</p>}

      {picking
        ? (
          <div className={css.profiles}>
            {me.profiles!.map((p) => (
              <button
                key={p.id}
                type='button'
                className={css.profile}
                disabled={busy}
                onClick={() => choose(p.id)}
              >
                <span className={css.initial}>{p.name.slice(0, 1).toUpperCase()}</span>
                <span className={css.profileName}>{p.name}</span>
                <ChevronRight size={20} className={css.chevron} />
              </button>
            ))}
          </div>
        )
        : (
          <form className={ui.cardRoomy} onSubmit={submit}>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Household password</span>
              <input
                className={ui.input}
                type='password'
                autoComplete='current-password'
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className={css.submit} type='submit' disabled={busy || !password}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}
    </div>
  );
}
