import { useEffect, useRef } from 'react';
import ui from '../ui.module.css';
import css from './Sheet.module.css';

export interface ConfirmRequest {
  title: string;
  body?: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

/**
 * Bottom sheet standing in for window.confirm, which cannot be styled and looks like a
 * browser error next to the rest of the app.
 */
export function ConfirmSheet({ request, onDismiss }: { request: ConfirmRequest | null; onDismiss: () => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!request) return;

    confirmRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    globalThis.addEventListener('keydown', onKey);

    // The page behind must not scroll while the sheet is up.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      globalThis.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [request, onDismiss]);

  if (!request) return null;

  function accept() {
    request!.onConfirm();
    onDismiss();
  }

  return (
    <div className={css.backdrop} onClick={onDismiss} role='presentation'>
      <div
        className={css.sheet}
        role='alertdialog'
        aria-modal='true'
        aria-label={request.title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={css.grabber} />
        <p className={css.title}>{request.title}</p>
        {request.body && <p className={css.body}>{request.body}</p>}
        <div className={css.actions}>
          <button
            ref={confirmRef}
            type='button'
            className={request.danger ? ui.buttonDanger : ui.buttonPrimary}
            onClick={accept}
          >
            {request.confirmLabel}
          </button>
          <button type='button' className={ui.button} onClick={onDismiss}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
