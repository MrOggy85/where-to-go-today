import css from './Chip.module.css';

type Tone = 'neutral' | 'accent' | 'positive';

const TONES: Record<Tone, string> = {
  neutral: css.chip,
  accent: css.accent,
  positive: css.positive,
};

/** Static chip: recommendation reasons and place attributes. */
export function Chip({ tone = 'neutral', icon, children }: {
  tone?: Tone;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className={TONES[tone]}>
      {icon && <span className={css.icon}>{icon}</span>}
      {children}
    </span>
  );
}

/** Tappable chip: quick filters and the weather picker. */
export function ChipButton({ selected, icon, onClick, children }: {
  selected: boolean;
  icon?: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type='button'
      className={selected ? css.selected : css.selectable}
      aria-pressed={selected}
      onClick={onClick}
    >
      {icon && <span className={css.icon}>{icon}</span>}
      {children}
    </button>
  );
}
