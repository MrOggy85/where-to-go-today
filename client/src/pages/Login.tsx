import { useState } from 'react';
import { api } from '../api.ts';
import type { Me } from '../types.ts';
import ui from '../ui.module.css';

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
    } finally {
      setBusy(false);
    }
  }

  if (me.authenticated && me.profiles) {
    return (
      <div>
        <h2>Who is using the app?</h2>
        <div className={ui.spacer} />
        {error && <p className={ui.error}>{error}</p>}
        {me.profiles.map((p) => (
          <button
            key={p.id}
            type='button'
            className={ui.buttonWide}
            disabled={busy}
            onClick={() => choose(p.id)}
          >
            {p.name}
          </button>
        ))}
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <h2>Sign in</h2>
      <div className={ui.spacer} />
      {error && <p className={ui.error}>{error}</p>}
      <label className={ui.field}>
        <span className={ui.label}>Household password</span>
        <input
          className={ui.input}
          type='password'
          autoComplete='current-password'
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <button className={ui.buttonWide} type='submit' disabled={busy || !password}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
