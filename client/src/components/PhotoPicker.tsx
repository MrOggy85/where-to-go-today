import { useEffect, useRef, useState } from 'react';
import { prepareAll, type PreparedPhoto } from '../photos.ts';
import { Close, Image } from '../icons.tsx';
import ui from '../ui.module.css';
import css from './PhotoPicker.module.css';

/**
 * Picks and resizes images, holding them until the caller uploads.
 *
 * `accept="image/*"` with `multiple` is what makes iOS offer both the photo library and
 * Files in one sheet, and lets several be chosen at once. No `capture` attribute: that
 * would force the camera and hide the library, which is the opposite of what is wanted.
 */
export function PhotoPicker(
  { staged, onChange, label = 'Add photos' }: {
    staged: PreparedPhoto[];
    onChange: (photos: PreparedPhoto[]) => void;
    label?: string;
  },
) {
  const input = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(files: FileList | null) {
    if (!files?.length) return;

    setWorking(true);
    setError(null);

    const { prepared, failed } = await prepareAll(Array.from(files));
    if (failed.length) setError(`Could not read ${failed.join(', ')}`);
    if (prepared.length) onChange([...staged, ...prepared]);

    setWorking(false);
    // Cleared so picking the same file twice in a row still fires a change event.
    if (input.current) input.current.value = '';
  }

  return (
    <div className={css.wrap}>
      <input
        ref={input}
        className={css.input}
        type='file'
        accept='image/*'
        multiple
        onChange={(e) => pick(e.target.files)}
      />

      <button
        type='button'
        className={css.button}
        disabled={working}
        onClick={() => input.current?.click()}
      >
        <Image size={20} />
        {working ? 'Preparing…' : label}
      </button>

      {error && <p className={ui.error}>{error}</p>}

      {staged.length > 0 && (
        <>
          <p className={ui.metaQuiet}>
            {staged.length} {staged.length === 1 ? 'photo' : 'photos'} ready to upload
          </p>
          <div className={css.previews}>
            {staged.map((photo, i) => <Preview key={i} photo={photo} onRemove={() => onChange(remove(staged, i))} />)}
          </div>
        </>
      )}
    </div>
  );
}

function remove(photos: PreparedPhoto[], index: number): PreparedPhoto[] {
  return photos.filter((_, i) => i !== index);
}

/** Object URL rather than a data URL: no base64 copy of the whole image in memory. */
function Preview({ photo, onRemove }: { photo: PreparedPhoto; onRemove: () => void }) {
  const [url] = useState(() => URL.createObjectURL(photo.file));

  // Revoked on unmount, or the blob is held for the lifetime of the page.
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  return (
    <div className={css.preview}>
      <img className={css.previewImage} src={url} alt='' loading='lazy' decoding='async' />
      <button type='button' className={css.previewRemove} aria-label='Remove from upload' onClick={onRemove}>
        <Close size={14} />
      </button>
    </div>
  );
}
