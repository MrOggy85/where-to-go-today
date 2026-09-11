import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.ts';
import { navigate } from '../useHashRoute.ts';
import type { PreparedPhoto } from '../photos.ts';
import { SkeletonCard } from '../components/Skeleton.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { PhotoGrid } from '../components/PhotoGrid.tsx';
import { PhotoPicker } from '../components/PhotoPicker.tsx';
import { type ConfirmRequest, ConfirmSheet } from '../components/Sheet.tsx';
import { Image } from '../icons.tsx';
import type { Photo, Place } from '../types.ts';
import ui from '../ui.module.css';
import css from './Photos.module.css';

/**
 * Every photo in the household, newest first. Adding here needs a place chosen first: a
 * photo without one has nothing to belong to, so the upload button stays disabled until
 * one is picked.
 */
export function Photos() {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [placeId, setPlaceId] = useState('');
  const [staged, setStaged] = useState<PreparedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);

  const load = useCallback(async () => {
    try {
      setPhotos((await api.photos()).photos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not load photos');
    }
  }, []);

  useEffect(() => {
    load();
    // Archived places are included: their photos are still part of the history.
    api.places({ status: 'archived' })
      .then((archived) => api.places().then((active) => [...active.places, ...archived.places]))
      .then((all) => setPlaces(all.sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => setPlaces([]));
  }, [load]);

  async function upload() {
    if (!staged.length || !placeId) return;

    setBusy(true);
    setError(null);
    try {
      await api.uploadPhotos(placeId, staged);
      setStaged([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not upload those photos');
    } finally {
      setBusy(false);
    }
  }

  function askDelete(photo: Photo) {
    setConfirmRequest({
      title: 'Delete this photo?',
      body: `It is removed from ${photo.placeName} and from the home server for good.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        try {
          await api.deletePhoto(photo.id);
          await load();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'could not delete that photo');
        }
      },
    });
  }

  return (
    <div>
      <h1 className={css.title}>Photos</h1>
      <p className={ui.metaQuiet}>Every photo, newest first.</p>

      {error && <p className={ui.error}>{error}</p>}

      <div className={css.adder}>
        <label className={ui.field}>
          <span className={ui.fieldLabel}>Place</span>
          <select className={ui.select} value={placeId} onChange={(e) => setPlaceId(e.target.value)}>
            <option value=''>Choose a place…</option>
            {places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>

        <PhotoPicker staged={staged} onChange={setStaged} />

        {staged.length > 0 && (
          <>
            <button type='button' className={css.upload} disabled={busy || !placeId} onClick={upload}>
              {busy ? 'Uploading…' : `Upload ${staged.length} ${staged.length === 1 ? 'photo' : 'photos'}`}
            </button>
            {!placeId && <p className={ui.metaQuiet}>Choose a place first. Every photo belongs to one.</p>}
          </>
        )}
      </div>

      {!photos && !error && <SkeletonCard lines={2} />}

      {photos?.length === 0 && (
        places.length === 0
          ? (
            <EmptyState
              icon={<Image size={26} />}
              headline='No places yet'
              body='Photos hang off places, so add a place before adding photos.'
              actionLabel='Add a place'
              onAction={() => navigate('/places/new')}
            />
          )
          : (
            <EmptyState
              icon={<Image size={26} />}
              headline='No photos yet'
              body='Pick a place above and add a few, or attach them to a visit from a place page.'
            />
          )
      )}

      {photos && photos.length > 0 && <PhotoGrid photos={photos} onDelete={askDelete} showPlace />}

      <ConfirmSheet request={confirmRequest} onDismiss={() => setConfirmRequest(null)} />
    </div>
  );
}
