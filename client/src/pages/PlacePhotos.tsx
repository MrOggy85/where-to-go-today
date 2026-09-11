import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.ts';
import type { PreparedPhoto } from '../photos.ts';
import { SkeletonCard } from '../components/Skeleton.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { PhotoGrid } from '../components/PhotoGrid.tsx';
import { PhotoPicker } from '../components/PhotoPicker.tsx';
import { type ConfirmRequest, ConfirmSheet } from '../components/Sheet.tsx';
import { Image } from '../icons.tsx';
import type { Photo, Place } from '../types.ts';
import ui from '../ui.module.css';
import css from './PlacePhotos.module.css';

/**
 * Every photo of one place, whichever visit it came from or none at all. Photos added here
 * are attached to the place only, which is why visit_id is nullable.
 */
export function PlacePhotos({ id }: { id: string }) {
  const [place, setPlace] = useState<Place | null>(null);
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [staged, setStaged] = useState<PreparedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);

  const load = useCallback(async () => {
    try {
      const [placeData, photoData] = await Promise.all([api.place(id), api.photos({ placeId: id })]);
      setPlace(placeData.place);
      setPhotos(photoData.photos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not load these photos');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function upload() {
    if (!staged.length) return;

    setBusy(true);
    setError(null);
    try {
      await api.uploadPhotos(id, staged);
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
      body: 'It is removed from the home server for good.',
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

  if (error && !place) return <p className={ui.error}>{error}</p>;
  if (!place || !photos) return <SkeletonCard lines={2} />;

  return (
    <div>
      <h1 className={css.title}>Photos</h1>
      <p className={ui.metaQuiet}>{place.name}</p>

      {error && <p className={ui.error}>{error}</p>}

      <div className={css.picker}>
        <PhotoPicker staged={staged} onChange={setStaged} />
        {staged.length > 0 && (
          <button type='button' className={css.upload} disabled={busy} onClick={upload}>
            {busy ? 'Uploading…' : `Upload ${staged.length} ${staged.length === 1 ? 'photo' : 'photos'}`}
          </button>
        )}
      </div>

      {photos.length === 0
        ? (
          <EmptyState
            icon={<Image size={26} />}
            headline='No photos yet'
            body='Add a few here, or attach them to a particular visit from the place page.'
          />
        )
        : <PhotoGrid photos={photos} onDelete={askDelete} />}

      <ConfirmSheet request={confirmRequest} onDismiss={() => setConfirmRequest(null)} />
    </div>
  );
}
