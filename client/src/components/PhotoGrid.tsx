import { useEffect, useRef, useState } from 'react';
import { photoUrl } from '../photos.ts';
import { ChevronRight, Close, Plus, Trash } from '../icons.tsx';
import type { Photo } from '../types.ts';
import css from './PhotoGrid.module.css';

/**
 * Lazy by default: only one size of each photo is stored, so a long grid would otherwise
 * pull every full-size image at once. `width`/`height` come from the stored dimensions so
 * each tile reserves its space and the grid does not reflow as images arrive.
 */
export function PhotoGrid(
  { photos, onDelete, onAddFiles, adding, showPlace }: {
    photos: Photo[];
    onDelete?: (photo: Photo) => void;
    /** Renders a trailing tile that opens the file picker straight away. */
    onAddFiles?: (files: File[]) => void;
    /** Caller-owned, so the tile can show progress while its upload is in flight. */
    adding?: boolean;
    /** The all-photos view needs the place name; a place's own gallery does not. */
    showPlace?: boolean;
  },
) {
  const [viewing, setViewing] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <>
      <div className={css.grid}>
        {photos.map((photo, i) => (
          <div key={photo.id} className={css.tile}>
            <button
              type='button'
              className={css.open}
              onClick={() => setViewing(i)}
              aria-label={showPlace ? `View photo of ${photo.placeName}` : 'View photo'}
            >
              <img
                className={css.image}
                src={photoUrl(photo.id)}
                width={photo.width}
                height={photo.height}
                loading='lazy'
                decoding='async'
                alt=''
              />
            </button>

            {showPlace && <span className={css.caption}>{photo.placeName}</span>}

            {onDelete && (
              <button
                type='button'
                className={css.remove}
                aria-label='Delete photo'
                onClick={() => onDelete(photo)}
              >
                <Trash size={16} />
              </button>
            )}
          </div>
        ))}

        {onAddFiles && (
          <>
            {/* image/* + multiple is what makes iOS offer library and Files together. */}
            <input
              ref={fileInput}
              className={css.fileInput}
              type='file'
              accept='image/*'
              multiple
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                // Cleared so picking the same file twice in a row still fires a change.
                e.target.value = '';
                if (picked.length) onAddFiles(picked);
              }}
            />
            <button
              type='button'
              className={css.add}
              disabled={adding}
              onClick={() => fileInput.current?.click()}
            >
              <Plus size={22} />
              <span className={css.addLabel}>{adding ? 'Adding…' : 'Add'}</span>
            </button>
          </>
        )}
      </div>

      {viewing !== null && photos[viewing] && (
        <Lightbox
          photos={photos}
          index={viewing}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  );
}

/** Full-size view. Not lazy: it is the one image the user explicitly asked for. */
function Lightbox(
  { photos, index, onIndex, onClose }: {
    photos: Photo[];
    index: number;
    onIndex: (i: number) => void;
    onClose: () => void;
  },
) {
  const photo = photos[index];
  // Wraps around, so holding one arrow never dead-ends.
  const step = (by: number) => onIndex((index + by + photos.length) % photos.length);

  // The page behind must not scroll while the overlay is up. Once, not per photo.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') onIndex((index - 1 + photos.length) % photos.length);
      else if (e.key === 'ArrowRight') onIndex((index + 1) % photos.length);
      else return;
      // Arrows would otherwise also scroll the page behind the overlay.
      e.preventDefault();
    };

    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [index, photos.length, onIndex, onClose]);

  return (
    <div className={css.lightbox} onClick={onClose} role='presentation'>
      <button type='button' className={css.close} aria-label='Close' onClick={onClose}>
        <Close size={22} />
      </button>

      {photos.length > 1 && (
        <>
          <button
            type='button'
            className={css.prev}
            aria-label='Previous photo'
            onClick={(e) => {
              e.stopPropagation();
              step(-1);
            }}
          >
            <ChevronRight size={24} />
          </button>
          <button
            type='button'
            className={css.next}
            aria-label='Next photo'
            onClick={(e) => {
              e.stopPropagation();
              step(1);
            }}
          >
            <ChevronRight size={24} />
          </button>
          <span className={css.counter}>{index + 1} / {photos.length}</span>
        </>
      )}

      <img
        className={css.full}
        src={photoUrl(photo.id)}
        alt={photo.placeName}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
