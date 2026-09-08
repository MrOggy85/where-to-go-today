import ui from '../ui.module.css';
import css from './EmptyState.module.css';

export function EmptyState({ icon, headline, body, actionLabel, onAction }: {
  icon: React.ReactNode;
  headline: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className={css.wrap}>
      <span className={css.icon}>{icon}</span>
      <p className={css.headline}>{headline}</p>
      <p className={css.body}>{body}</p>
      {actionLabel && onAction && (
        <button type='button' className={`${ui.button} ${css.action}`} onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
