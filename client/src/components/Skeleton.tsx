import css from './Skeleton.module.css';

export function Skeleton({ width, height = 16, radius }: { width: string; height?: number; radius?: number }) {
  return <span className={css.block} style={{ width, height, borderRadius: radius }} aria-hidden='true' />;
}

/**
 * Stands in for a place card while it loads. Shaped like the real thing so the layout
 * does not jump when content arrives.
 */
export function SkeletonCard({ lines = 1 }: { lines?: number }) {
  return (
    <div className={css.card}>
      <Skeleton width='62%' height={20} />
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} width={i % 2 ? '54%' : '78%'} height={14} />)}
      <div className={css.chips}>
        <Skeleton width='84px' height={28} radius={999} />
        <Skeleton width='104px' height={28} radius={999} />
      </div>
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div role='status' aria-label='Loading'>
      {Array.from({ length: count }, (_, i) => <SkeletonCard key={i} />)}
    </div>
  );
}
