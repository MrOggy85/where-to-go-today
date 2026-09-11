import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.ts';
import { navigate } from '../useHashRoute.ts';
import { describeLastVisit, formatDate, formatHours, travelSummary } from '../format.ts';
import { prepareAll } from '../photos.ts';
import { Chip } from '../components/Chip.tsx';
import { SkeletonCard } from '../components/Skeleton.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { PhotoGrid } from '../components/PhotoGrid.tsx';
import { type ConfirmRequest, ConfirmSheet } from '../components/Sheet.tsx';
import {
  Archive,
  Calendar,
  Car,
  Check,
  Clock,
  Coin,
  ExternalLink,
  Food,
  Image,
  MapPin,
  Parking,
  Pencil,
  Plus,
  Toilet,
  Train,
  Trash,
  Tree,
  Umbrella,
} from '../icons.tsx';
import type { Photo, Place, Tristate, Visit } from '../types.ts';
import ui from '../ui.module.css';
import css from './PlaceDetail.module.css';

export function PlaceDetail({ id }: { id: string }) {
  const [place, setPlace] = useState<Place | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Kept apart from `error`, which replaces the whole page when the place fails to load.
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [data, photoData] = await Promise.all([api.place(id), api.photos({ placeId: id })]);
      setPlace(data.place);
      setVisits(data.visits);
      setPhotos(photoData.photos);
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
      // Brief confirmation so the tap has an obvious result.
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not record the visit');
    } finally {
      setBusy(false);
    }
  }

  /** Uploads straight from the grid's add tile: there is no form here to save first. */
  async function addPhotos(files: File[]) {
    setAdding(true);
    setPhotoError(null);
    try {
      const { prepared, failed } = await prepareAll(files);
      if (failed.length) setPhotoError(`Could not read ${failed.join(', ')}`);
      if (prepared.length) {
        await api.uploadPhotos(id, prepared);
        await load();
      }
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'could not add those photos');
    } finally {
      setAdding(false);
    }
  }

  function askRemoveVisit(visitId: string) {
    setConfirmRequest({
      title: 'Remove this visit?',
      body: 'It disappears from the history and stops affecting recommendations.',
      confirmLabel: 'Remove visit',
      danger: true,
      onConfirm: async () => {
        await api.deleteVisit(visitId);
        await load();
      },
    });
  }

  function askDelete() {
    if (!place) return;

    const archiving = place.visitCount > 0;
    setConfirmRequest({
      title: archiving ? `Archive ${place.name}?` : `Delete ${place.name}?`,
      body: archiving
        ? `It has ${place.visitCount} ${
          place.visitCount === 1 ? 'visit' : 'visits'
        } recorded, so the history is kept and it stops appearing in recommendations.`
        : 'It has no visits recorded, so it will be deleted for good.',
      confirmLabel: archiving ? 'Archive' : 'Delete',
      danger: true,
      onConfirm: async () => {
        const { result } = await api.deletePlace(id);
        if (result === 'deleted') navigate('/places');
        else await load();
      },
    });
  }

  if (error) return <p className={ui.error}>{error}</p>;
  if (!place) return <SkeletonCard lines={2} />;

  return (
    <div>
      <div className={css.head}>
        <h1 className={css.name}>{place.name}</h1>
        <p className={css.meta}>
          {[place.environment, travelSummary(place), describeLastVisit(place.lastVisitedAt)].filter(Boolean).join(
            ' · ',
          )}
        </p>
      </div>

      {place.status === 'archived' && (
        <p className={css.archived}>
          <Archive size={18} />
          Archived, so it will not appear in recommendations.
        </p>
      )}

      <button
        type='button'
        className={justSaved ? css.done : css.primary}
        onClick={markVisited}
        disabled={busy}
      >
        {justSaved ? <Check size={20} /> : <Calendar size={20} />}
        {justSaved ? 'Recorded' : 'We went here today'}
      </button>

      {/* The one-tap button covers today; anything else goes through the visit page. */}
      <button
        type='button'
        className={css.secondary}
        onClick={() => navigate(`/places/${id}/visits/new`)}
      >
        <Plus size={18} />
        Add a visit on another day
      </button>

      <div className={css.actions}>
        {place.googleMapsUrl && (
          <a className={css.action} href={place.googleMapsUrl} target='_blank' rel='noreferrer'>
            <MapPin size={20} />
            Maps
          </a>
        )}
        {place.websiteUrl && (
          <a className={css.action} href={place.websiteUrl} target='_blank' rel='noreferrer'>
            <ExternalLink size={20} />
            Website
          </a>
        )}
        <button type='button' className={css.action} onClick={() => navigate(`/places/${id}/photos`)}>
          <Image size={20} />
          Photos
        </button>
        <button type='button' className={css.action} onClick={() => navigate(`/places/${id}/edit`)}>
          <Pencil size={20} />
          Edit
        </button>
        <button type='button' className={css.actionDanger} onClick={askDelete}>
          {place.visitCount > 0 ? <Archive size={20} /> : <Trash size={20} />}
          {place.visitCount > 0 ? 'Archive' : 'Delete'}
        </button>
      </div>

      {/* Above the attributes: remembering the place beats re-reading its opening hours. */}
      {photoError && <p className={ui.error}>{photoError}</p>}
      <PhotoGrid photos={photos} onAddFiles={addPhotos} adding={adding} />

      <Attributes place={place} />

      {place.notes && (
        <>
          <span className={ui.sectionTitle}>Notes</span>
          <div className={css.notes}>{place.notes}</div>
        </>
      )}

      <span className={ui.sectionTitle}>Visit history</span>
      {visits.length === 0
        ? (
          <EmptyState
            icon={<Calendar size={26} />}
            headline='No visits yet'
            body='Tap "We went here today" when you get back and it will show up here.'
          />
        )
        : (
          <ul className={css.timeline}>
            {visits.map((v) => (
              <li key={v.id} className={css.visit}>
                <span className={css.dot} />
                {/* Opens the visit page, which is where its photos are managed. */}
                <button
                  type='button'
                  className={css.visitOpen}
                  onClick={() => navigate(`/visits/${v.id}`)}
                >
                  <span className={css.visitDate}>{formatDate(v.visitedAt)}</span>
                  {v.note && <span className={css.visitNote}>{v.note}</span>}
                </button>
                <button
                  type='button'
                  className={css.visitRemove}
                  aria-label={`Remove visit on ${formatDate(v.visitedAt)}`}
                  onClick={() => askRemoveVisit(v.id)}
                >
                  <Trash size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}

      <ConfirmSheet request={confirmRequest} onDismiss={() => setConfirmRequest(null)} />
    </div>
  );
}

/**
 * Planning attributes as chips, rendered only when known. An unset field says nothing
 * rather than showing an empty row, which is what "unknown, not no" looks like in the UI.
 */
function Attributes({ place }: { place: Place }) {
  const chips: React.ReactNode[] = [];

  const add = (key: string, icon: React.ReactNode, text: string, tone?: 'accent' | 'positive') =>
    chips.push(<Chip key={key} icon={icon} tone={tone}>{text}</Chip>);

  if (place.driveMinutes !== undefined) add('drive', <Car size={16} />, `${place.driveMinutes} min drive`);
  if (place.trainMinutes !== undefined) add('train', <Train size={16} />, `${place.trainMinutes} min train`);
  if (place.typicalDurationHours !== undefined) {
    add('duration', <Clock size={16} />, `About ${formatHours(place.typicalDurationHours)}`);
  }
  if (place.costLevel) {
    add('cost', <Coin size={16} />, place.costLevel === 'free' ? 'Free' : `${place.costLevel} cost`);
  }

  if (place.goodForRain) add('rain', <Umbrella size={16} />, 'Good in rain', 'positive');
  if (place.goodForHotWeather) add('hot', <Check size={16} />, 'Good in heat', 'positive');
  if (place.goodForColdWeather) add('cold', <Check size={16} />, 'Good in cold', 'positive');
  if (place.shaded) add('shade', <Tree size={16} />, 'Shaded', 'positive');

  if (yes(place.parking)) add('parking', <Parking size={16} />, 'Parking');
  if (yes(place.toilets)) add('toilets', <Toilet size={16} />, 'Toilets');
  if (yes(place.foodAvailable)) add('food', <Food size={16} />, 'Food');

  const tags = place.categories.map((c) => <Chip key={c.id}>{c.name}</Chip>);

  if (!chips.length && !tags.length && !place.address) return null;

  return (
    <>
      {chips.length > 0 && (
        <>
          <span className={ui.sectionTitle}>Good to know</span>
          <div className={css.chips}>{chips}</div>
        </>
      )}
      {tags.length > 0 && (
        <>
          <span className={ui.sectionTitle}>Categories</span>
          <div className={css.chips}>{tags}</div>
        </>
      )}
      {place.address && (
        <>
          <span className={ui.sectionTitle}>Address</span>
          <p className={ui.meta}>{place.address}</p>
        </>
      )}
    </>
  );
}

/** Only an explicit yes counts; "unknown" and "no" both stay off the page. */
function yes(v?: Tristate): boolean {
  return v === 'yes';
}
