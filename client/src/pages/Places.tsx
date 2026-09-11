import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.ts';
import { navigate } from '../useHashRoute.ts';
import { describeLastVisit, travelSummary } from '../format.ts';
import { Chip, ChipButton } from '../components/Chip.tsx';
import { SkeletonList } from '../components/Skeleton.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { PhotoStrip } from '../components/PhotoStrip.tsx';
import { ChevronRight, MapPin, Plus, Search, Sparkle, Tag } from '../icons.tsx';
import type { CategoryWithCount, Place } from '../types.ts';
import ui from '../ui.module.css';
import css from './Places.module.css';

type Quick = 'all' | 'wantToGo' | 'indoor' | 'outdoor' | 'favourites' | 'notRecent' | 'archived';

// "Want to go" is derived, not stored: an active place we have not been to yet.
const QUICK_FILTERS: { key: Quick; label: string; params: Record<string, string> }[] = [
  { key: 'all', label: 'All', params: {} },
  { key: 'wantToGo', label: 'Want to go', params: { neverVisited: 'true' } },
  { key: 'favourites', label: 'Favourites', params: { minPriority: '3' } },
  { key: 'notRecent', label: 'Not visited in 90 days', params: { notVisitedInDays: '90' } },
  { key: 'indoor', label: 'Indoor', params: { environment: 'indoor' } },
  { key: 'outdoor', label: 'Outdoor', params: { environment: 'outdoor' } },
  { key: 'archived', label: 'Archived', params: { status: 'archived' } },
];

export function Places() {
  const [quick, setQuick] = useState<Quick>('all');
  const [categoryId, setCategoryId] = useState('');
  const [q, setQ] = useState('');
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const filter = QUICK_FILTERS.find((f) => f.key === quick)!;
    try {
      const data = await api.places({ ...filter.params, categoryId, q });
      setPlaces(data.places);
      setCategories(data.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not load places');
    }
  }, [quick, categoryId, q]);

  // Debounced so typing in the search box does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  const filtered = quick !== 'all' || !!categoryId || !!q;

  return (
    <div>
      <div className={css.head}>
        <h1 className={css.title}>Places</h1>

        <div className={css.searchWrap}>
          <Search size={20} className={css.searchIcon} />
          <input
            className={css.search}
            type='search'
            placeholder='Search places'
            aria-label='Search places'
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className={css.filters}>
          {QUICK_FILTERS.map((f) => (
            <ChipButton key={f.key} selected={quick === f.key} onClick={() => setQuick(f.key)}>
              {f.label}
            </ChipButton>
          ))}
        </div>

        {/* The manage screen has no tab; this is where categories are already on the mind. */}
        <div className={css.categoryRow}>
          {categories.length > 0 && (
            <select
              className={css.categorySelect}
              aria-label='Filter by category'
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value=''>Any category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.placeCount})</option>)}
            </select>
          )}
          <button type='button' className={css.categoryManage} onClick={() => navigate('/categories')}>
            <Tag size={18} />
            Categories
          </button>
        </div>
      </div>

      {error && <p className={ui.error}>{error}</p>}

      {!places && !error && <SkeletonList count={4} />}

      {places && places.length > 0 && (
        <p className={css.count}>{places.length} {places.length === 1 ? 'place' : 'places'}</p>
      )}

      {places?.length === 0 && (
        filtered
          ? (
            <EmptyState
              icon={<Search size={26} />}
              headline='No matches'
              body='Nothing here fits that search and filter. Try a broader one.'
              actionLabel='Clear filters'
              onAction={() => {
                setQuick('all');
                setCategoryId('');
                setQ('');
              }}
            />
          )
          : (
            <EmptyState
              icon={<MapPin size={26} />}
              headline='No places yet'
              body='Add the parks, museums and playgrounds your family already likes. Name and indoor or outdoor is enough to start.'
              actionLabel='Add your first place'
              onAction={() => navigate('/places/new')}
            />
          )
      )}

      {places?.map((p) => (
        <button
          key={p.id}
          type='button'
          className={css.item}
          onClick={() => navigate(`/places/${p.id}`)}
        >
          <span className={css.itemBody}>
            <span className={css.name}>
              <span className={css.nameText}>{p.name}</span>
              {p.priority >= 3 && <Sparkle size={15} className={css.star} />}
            </span>
            {/* Two rows here: the list is for browsing, so it can afford more of a preview. */}
            <PhotoStrip ids={p.photoIds} rows={2} />
            <span className={ui.metaQuiet}>
              {[p.environment, travelSummary(p), describeLastVisit(p.lastVisitedAt)].filter(Boolean).join(' · ')}
            </span>
            {p.categories.length > 0 && (
              <span className={css.chips}>
                {p.categories.slice(0, 3).map((c) => <Chip key={c.id}>{c.name}</Chip>)}
              </span>
            )}
          </span>
          <ChevronRight size={20} className={css.chevron} />
        </button>
      ))}

      <div className={ui.fabGap} />

      <button type='button' className={ui.fab} onClick={() => navigate('/places/new')}>
        <Plus size={20} />
        Add place
      </button>
    </div>
  );
}
