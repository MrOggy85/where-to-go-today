import { Fragment, useCallback, useEffect, useState } from 'react';
import { api } from '../api.ts';
import { navigate } from '../useHashRoute.ts';
import { formatDayShort, formatMonth } from '../format.ts';
import { SkeletonList } from '../components/Skeleton.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { PhotoStrip } from '../components/PhotoStrip.tsx';
import { Calendar, Plus } from '../icons.tsx';
import type { VisitWithPlace } from '../types.ts';
import ui from '../ui.module.css';
import css from './Visits.module.css';

/** More than a screenful, so scrolling usually beats the button. Older pages on demand. */
const PAGE = 50;

/** One row of thumbnails; this list is for reading notes, not for browsing photos. */
const ROW_THUMBS = 6;

interface MonthGroup {
  month: string;
  visits: VisitWithPlace[];
}

/** The feed already arrives newest first, so equal neighbours are one month. */
function groupByMonth(visits: VisitWithPlace[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const visit of visits) {
    const month = formatMonth(visit.visitedAt);
    const last = groups[groups.length - 1];
    if (last?.month === month) last.visits.push(visit);
    else groups.push({ month, visits: [visit] });
  }
  return groups;
}

/**
 * Every visit, newest first. Secondary to planning by design, so it is a plain feed: no
 * filters, no search. Tapping a row opens the visit, which is where the date, the note
 * and the photos are edited.
 */
export function Visits() {
  const [visits, setVisits] = useState<VisitWithPlace[] | null>(null);
  const [end, setEnd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (offset: number) => {
    setBusy(true);
    setError(null);
    try {
      const page = (await api.visits(PAGE, offset)).visits;
      setVisits((prev) => offset === 0 ? page : [...(prev ?? []), ...page]);
      // A short page is the last one, so the button disappears rather than fetching nothing.
      setEnd(page.length < PAGE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not load visits');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    loadPage(0);
  }, [loadPage]);

  return (
    <div>
      <h1 className={css.title}>Visits</h1>
      <p className={ui.metaQuiet}>Everywhere we have been, newest first.</p>

      {error && <p className={ui.error}>{error}</p>}

      {!visits && !error && <SkeletonList count={4} />}

      {visits?.length === 0 && (
        <EmptyState
          icon={<Calendar size={26} />}
          headline='No visits yet'
          body='Record one here or from a place page, and it will show up with its note and photos.'
          actionLabel='Add a visit'
          onAction={() => navigate('/visits/new')}
        />
      )}

      {visits && visits.length > 0 && (
        <p className={css.count}>
          {visits.length}
          {end ? '' : '+'} {visits.length === 1 ? 'visit' : 'visits'}
        </p>
      )}

      {visits && groupByMonth(visits).map((group) => (
        <Fragment key={group.month}>
          <span className={ui.sectionTitle}>{group.month}</span>
          {group.visits.map((v) => (
            <button
              key={v.id}
              type='button'
              className={css.entry}
              onClick={() => navigate(`/visits/${v.id}`)}
            >
              <span className={css.head}>
                <span className={css.place}>{v.placeName}</span>
                <span className={css.date}>{formatDayShort(v.visitedAt)}</span>
              </span>
              {v.note && <span className={css.note}>{v.note}</span>}
              <PhotoStrip ids={v.photoIds.slice(0, ROW_THUMBS)} />
            </button>
          ))}
        </Fragment>
      ))}

      {visits && visits.length > 0 && !end && (
        <div className={css.more}>
          <button type='button' className={ui.button} disabled={busy} onClick={() => loadPage(visits.length)}>
            {busy ? 'Loading…' : 'Older visits'}
          </button>
        </div>
      )}

      <div className={ui.fabGap} />

      <button type='button' className={ui.fab} onClick={() => navigate('/visits/new')}>
        <Plus size={20} />
        Add visit
      </button>
    </div>
  );
}
