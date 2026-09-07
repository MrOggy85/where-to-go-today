import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.ts';
import { navigate } from '../useHashRoute.ts';
import type { Place } from '../types.ts';
import { describeLastVisit } from '../format.ts';
import ui from '../ui.module.css';

type Quick = 'all' | 'want_to_go' | 'indoor' | 'outdoor' | 'neverVisited' | 'favourites' | 'notRecent' | 'archived';

const QUICK_FILTERS: { key: Quick; label: string; params: Record<string, string> }[] = [
  { key: 'all', label: 'All', params: {} },
  { key: 'want_to_go', label: 'Want to go', params: { status: 'want_to_go' } },
  { key: 'indoor', label: 'Indoor', params: { environment: 'indoor' } },
  { key: 'outdoor', label: 'Outdoor', params: { environment: 'outdoor' } },
  { key: 'neverVisited', label: 'Never visited', params: { neverVisited: 'true' } },
  { key: 'favourites', label: 'Favourites', params: { minPriority: '3' } },
  { key: 'notRecent', label: 'Not visited in 90 days', params: { notVisitedInDays: '90' } },
  { key: 'archived', label: 'Archived', params: { status: 'archived' } },
];

export function Places() {
  const [quick, setQuick] = useState<Quick>('all');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const filter = QUICK_FILTERS.find((f) => f.key === quick)!;
    try {
      const data = await api.places({ ...filter.params, category, q });
      setPlaces(data.places);
      setCategories(data.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not load places');
    }
  }, [quick, category, q]);

  // Debounced so typing in the search box does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  return (
    <div>
      <input
        className={ui.input}
        type='search'
        placeholder='Search places'
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className={ui.spacer} />

      <div className={ui.row}>
        {QUICK_FILTERS.map((f) => (
          <button
            key={f.key}
            type='button'
            className={quick === f.key ? ui.toggleOn : ui.toggle}
            onClick={() => setQuick(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {categories.length > 0 && (
        <>
          <div className={ui.spacer} />
          <select className={ui.input} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value=''>Any category</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </>
      )}

      <div className={ui.spacer} />
      {error && <p className={ui.error}>{error}</p>}

      {places.length === 0 && <p className={ui.empty}>No places match.</p>}

      {places.map((p) => (
        <button
          key={p.id}
          type='button'
          className={ui.cardLink}
          onClick={() => navigate(`/places/${p.id}`)}
        >
          <div className={ui.name}>{p.name}</div>
          <div className={ui.meta}>
            {[p.environment, travelSummary(p), describeLastVisit(p.lastVisitedAt)].filter(Boolean).join(' · ')}
          </div>
          {p.categories.length > 0 && (
            <div className={ui.reasons}>
              {p.categories.map((c) => <span key={c} className={ui.reason}>{c}</span>)}
            </div>
          )}
        </button>
      ))}

      <div className={ui.spacer} />
      <button type='button' className={ui.buttonWide} onClick={() => navigate('/places/new')}>Add place</button>
    </div>
  );
}

export function travelSummary(p: Place): string {
  const parts: string[] = [];
  if (p.driveMinutes !== undefined) parts.push(`${p.driveMinutes} min drive`);
  if (p.trainMinutes !== undefined) parts.push(`${p.trainMinutes} min train`);
  return parts.join(' / ');
}
