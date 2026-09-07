import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.ts';
import { navigate } from '../useHashRoute.ts';
import type { Place, Tristate, Visit } from '../types.ts';
import { describeLastVisit, formatDate } from '../format.ts';
import { travelSummary } from './Places.tsx';
import { formatMinutes } from './Today.tsx';
import ui from '../ui.module.css';

export function PlaceDetail({ id }: { id: string }) {
  const [place, setPlace] = useState<Place | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.place(id);
      setPlace(data.place);
      setVisits(data.visits);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not load this place');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function markVisited() {
    setBusy(true);
    try {
      await api.recordVisit(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not record the visit');
    } finally {
      setBusy(false);
    }
  }

  async function removeVisit(visitId: string) {
    if (!confirm('Remove this visit from the history?')) return;
    await api.deleteVisit(visitId);
    await load();
  }

  async function remove() {
    if (!place) return;
    const message = place.visitCount > 0
      ? `${place.name} has ${place.visitCount} visit(s). It will be archived, keeping the history. Continue?`
      : `Delete ${place.name}?`;
    if (!confirm(message)) return;

    const { result } = await api.deletePlace(id);
    if (result === 'deleted') navigate('/places');
    else await load();
  }

  if (error) return <p className={ui.error}>{error}</p>;
  if (!place) return <p className={ui.empty}>Loading…</p>;

  return (
    <div>
      <h2>{place.name}</h2>
      <div className={ui.meta}>
        {[place.environment, travelSummary(place), describeLastVisit(place.lastVisitedAt)].filter(Boolean).join(' · ')}
      </div>

      {place.status === 'archived' && <p className={ui.error}>Archived. It will not appear in recommendations.</p>}

      <div className={ui.spacer} />
      <button type='button' className={ui.buttonWide} onClick={markVisited} disabled={busy}>
        {busy ? 'Saving…' : 'We went here today'}
      </button>

      <div className={ui.spacer} />
      <div className={ui.row}>
        {place.googleMapsUrl && (
          <a className={ui.button} href={place.googleMapsUrl} target='_blank' rel='noreferrer'>Open in Maps</a>
        )}
        {place.websiteUrl && (
          <a className={ui.button} href={place.websiteUrl} target='_blank' rel='noreferrer'>Website</a>
        )}
        <button type='button' className={ui.button} onClick={() => navigate(`/places/${id}/edit`)}>Edit</button>
        <button type='button' className={ui.buttonDanger} onClick={remove}>
          {place.visitCount > 0 ? 'Archive' : 'Delete'}
        </button>
      </div>

      {place.notes && (
        <>
          <div className={ui.sectionTitle}>Notes</div>
          <div className={ui.card}>{place.notes}</div>
        </>
      )}

      <div className={ui.sectionTitle}>Planning</div>
      <div className={ui.card}>
        <ul className={ui.list}>
          <Detail label='Priority' value={place.priority > 1 ? `${place.priority} of 5` : 'normal'} />
          <Detail
            label='Typical visit'
            value={place.typicalDurationMinutes && formatMinutes(place.typicalDurationMinutes)}
          />
          <Detail label='Cost' value={place.costLevel} />
          <Detail label='Categories' value={place.categories.join(', ')} />
          <Detail label='Address' value={place.address} />
          <Detail label='Good in rain' value={yesNo(place.goodForRain)} />
          <Detail label='Good in heat' value={yesNo(place.goodForHotWeather)} />
          <Detail label='Good in cold' value={yesNo(place.goodForColdWeather)} />
          <Detail label='Shaded' value={yesNo(place.shaded)} />
          <Detail label='Parking' value={tristate(place.parking)} />
          <Detail label='Stroller friendly' value={tristate(place.strollerFriendly)} />
          <Detail label='Food' value={tristate(place.foodAvailable)} />
          <Detail label='Toilets' value={tristate(place.toilets)} />
          <Detail label='Cooldown' value={place.preferredCooldownDays && `${place.preferredCooldownDays} days`} />
        </ul>
      </div>

      <div className={ui.sectionTitle}>Visit history</div>
      {visits.length === 0 && <p className={ui.empty}>No visits recorded yet.</p>}
      {visits.length > 0 && (
        <div className={ui.card}>
          <ul className={ui.list}>
            {visits.map((v) => (
              <li key={v.id} className={ui.listItem}>
                <span>
                  {formatDate(v.visitedAt)}
                  {v.note && <div className={ui.meta}>{v.note}</div>}
                </span>
                <button type='button' className={ui.button} onClick={() => removeVisit(v.id)}>Remove</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | number | null | false }) {
  if (value === undefined || value === null || value === '' || value === false) return null;
  return (
    <li className={ui.listItem}>
      <span className={ui.meta}>{label}</span>
      <span>{value}</span>
    </li>
  );
}

function yesNo(v?: boolean): string | undefined {
  return v === undefined ? undefined : v ? 'yes' : 'no';
}

function tristate(v?: Tristate): string | undefined {
  return !v || v === 'unknown' ? undefined : v;
}
