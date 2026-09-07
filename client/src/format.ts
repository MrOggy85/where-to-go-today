/** Mirrors the server's phrasing so a place reads the same on the Today card and its page. */
export function describeLastVisit(lastVisitedAt?: string): string {
  if (!lastVisitedAt) return 'never visited';

  const days = Math.floor((Date.now() - new Date(lastVisitedAt).getTime()) / 86_400_000);
  if (days <= 0) return 'visited today';
  if (days === 1) return 'visited yesterday';
  if (days < 14) return `visited ${days} days ago`;
  if (days < 60) return `visited ${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `visited ${Math.round(days / 30)} months ago`;
  return `visited ${Math.floor(days / 365)}+ years ago`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
