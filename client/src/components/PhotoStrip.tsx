import { photoUrl } from '../photos.ts';
import css from './PhotoStrip.module.css';

/**
 * Thumbnail preview for a list row. Deliberately inert: these render inside the row's own
 * button, so a nested control would be invalid markup and would swallow the tap that is
 * meant to open the place.
 *
 * Lazy, like every other photo surface — a long list would otherwise fetch an image per
 * row before any of them scrolled into view.
 */
export function PhotoStrip({ ids, rows = 1 }: { ids: string[]; rows?: 1 | 2 }) {
  if (!ids.length) return null;

  return (
    <span className={rows === 2 ? css.stripTwoRows : css.strip}>
      {ids.map((id) => (
        <img
          key={id}
          className={css.thumb}
          src={photoUrl(id)}
          loading='lazy'
          decoding='async'
          alt=''
        />
      ))}
    </span>
  );
}
