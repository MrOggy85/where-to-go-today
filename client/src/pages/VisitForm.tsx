import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.ts';
import { navigate } from '../useHashRoute.ts';
import type { PreparedPhoto } from '../photos.ts';
import { SkeletonCard } from '../components/Skeleton.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { PhotoGrid } from '../components/PhotoGrid.tsx';
import { PhotoPicker } from '../components/PhotoPicker.tsx';
import { type ConfirmRequest, ConfirmSheet } from '../components/Sheet.tsx';
import { MapPin } from '../icons.tsx';
import type { Photo, Place, Visit } from '../types.ts';
import ui from '../ui.module.css';
import css from './VisitForm.module.css';

/** `<input type="date">` wants YYYY-MM-DD in local time, not the stored ISO instant. */
function toDateInput(iso: string): string {
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** Noon local, so a timezone shift cannot move the visit onto the previous day. */
function fromDateInput(value: string): string {
  return new Date(`${value}T12:00:00`).toISOString();
}

/**
 * Records a visit on any date, or corrects one already recorded. The "we went here today"
 * button on the place page stays as the one-tap path; this is the page for everything else.
 *
 * With neither id it is reached from the visits list, where there is no place in hand yet,
 * so the form asks for one. An existing visit never does: its place is fixed, because
 * somewhere else is a different visit.
 */
export function VisitForm({ placeId, visitId }: { placeId?: string; visitId?: string }) {
  const picking = !placeId && !visitId;

  const [place, setPlace] = useState<Place | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [visit, setVisit] = useState<Visit | null>(null);
  const [date, setDate] = useState(() => toDateInput(new Date().toISOString()));
  const [note, setNote] = useState('');
  const [staged, setStaged] = useState<PreparedPhoto[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);

  const loadPhotos = useCallback(async (id: string) => {
    const data = await api.photos({ visitId: id });
    setPhotos(data.photos);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        if (visitId) {
          const data = await api.visit(visitId);
          setVisit(data.visit);
          setPlace(data.place);
          setDate(toDateInput(data.visit.visitedAt));
          setNote(data.visit.note ?? '');
          await loadPhotos(visitId);
        } else if (placeId) {
          const data = await api.place(placeId);
          setPlace(data.place);
        } else {
          // Archived places are offered too: backdating a visit to one is the usual
          // reason it got archived in the first place.
          const [active, archived] = await Promise.all([api.places(), api.places({ status: 'archived' })]);
          setPlaces([...active.places, ...archived.places].sort((a, b) => a.name.localeCompare(b.name)));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'could not load this visit');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [placeId, visitId, loadPhotos]);

  /** The visits list sent us here, so that is where a save or a cancel goes back to. */
  function leave(to?: Place | null) {
    navigate(picking || !to ? '/visits' : `/places/${to.id}`);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!place) return;

    setBusy(true);
    setError(null);
    try {
      // A new visit has to exist before its photos can point at it.
      const id = visit
        ? (await api.updateVisit(visit.id, { visitedAt: fromDateInput(date), note: note.trim() || null })).visit.id
        : (await api.recordVisit(place.id, { visitedAt: fromDateInput(date), note: note.trim() || undefined })).visit
          .id;

      if (staged.length) await api.uploadPhotos(place.id, staged, id);
      leave(place);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not save this visit');
    } finally {
      setBusy(false);
    }
  }

  /** Uploads immediately: the visit already exists, so there is nothing to save first. */
  async function uploadNow() {
    if (!place || !visit || !staged.length) return;

    setBusy(true);
    setError(null);
    try {
      await api.uploadPhotos(place.id, staged, visit.id);
      setStaged([]);
      await loadPhotos(visit.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not upload those photos');
    } finally {
      setBusy(false);
    }
  }

  function askDeletePhoto(photo: Photo) {
    setConfirmRequest({
      title: 'Delete this photo?',
      body: 'It is removed from the visit and from the home server for good.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        try {
          await api.deletePhoto(photo.id);
          if (visitId) await loadPhotos(visitId);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'could not delete that photo');
        }
      },
    });
  }

  if (loading) return <SkeletonCard lines={3} />;
  if (!place && !picking) return <p className={ui.error}>{error ?? 'could not load this visit'}</p>;

  // A visit needs somewhere to have been, so an empty database is a dead end, not a form.
  if (picking && !places.length) {
    return (
      <EmptyState
        icon={<MapPin size={26} />}
        headline='No places yet'
        body='A visit belongs to a place. Add the first one and you can record visits to it.'
        actionLabel='Add a place'
        onAction={() => navigate('/places/new')}
      />
    );
  }

  return (
    <form className={css.form} onSubmit={save}>
      <h1 className={css.title}>{visit ? 'Edit visit' : 'Add a visit'}</h1>
      <p className={ui.metaQuiet}>{place ? place.name : 'Somewhere you have already been, on any date.'}</p>

      {error && <p className={ui.error}>{error}</p>}

      <div className={css.card}>
        {picking && (
          <label className={ui.field}>
            <span className={ui.fieldLabel}>Place</span>
            <select
              className={ui.select}
              value={place?.id ?? ''}
              onChange={(e) => setPlace(places.find((p) => p.id === e.target.value) ?? null)}
              required
            >
              <option value=''>Choose a place…</option>
              {places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}

        <label className={ui.field}>
          <span className={ui.fieldLabel}>Date</span>
          <input
            className={ui.input}
            type='date'
            value={date}
            max={toDateInput(new Date().toISOString())}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>

        <label className={ui.field}>
          <span className={ui.fieldLabel}>Note</span>
          <textarea
            className={ui.textarea}
            placeholder='Rained on the way home but the playground was empty.'
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>

      <span className={ui.sectionTitle}>Photos</span>
      <PhotoPicker staged={staged} onChange={setStaged} />

      {/* On an existing visit the upload is its own action, so it does not need a save. */}
      {visit && staged.length > 0 && (
        <button type='button' className={css.upload} disabled={busy} onClick={uploadNow}>
          {busy ? 'Uploading…' : `Upload ${staged.length} ${staged.length === 1 ? 'photo' : 'photos'}`}
        </button>
      )}

      {photos.length > 0 && <PhotoGrid photos={photos} onDelete={askDeletePhoto} />}

      <div className={css.saveBar}>
        <div className={css.saveInner}>
          <button type='button' className={css.cancel} onClick={() => leave(place)}>
            Cancel
          </button>
          <button className={css.save} type='submit' disabled={busy || !date || !place}>
            {busy ? 'Saving…' : visit ? 'Save changes' : 'Record visit'}
          </button>
        </div>
      </div>

      <ConfirmSheet request={confirmRequest} onDismiss={() => setConfirmRequest(null)} />
    </form>
  );
}
