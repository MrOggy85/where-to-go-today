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

/** The Today page title, e.g. "Sunday, 7 September". */
export function formatToday(now = new Date()): string {
  return now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Both travel times when known, never collapsed into one number (PROJECT.md section 13). */
export function travelSummary(p: { driveMinutes?: number; trainMinutes?: number }): string {
  const parts: string[] = [];
  if (p.driveMinutes !== undefined) parts.push(`${p.driveMinutes} min drive`);
  if (p.trainMinutes !== undefined) parts.push(`${p.trainMinutes} min train`);
  return parts.join(' / ');
}

/** Typical visit length. Whole hours are the norm; halves are kept rather than rounded away. */
export function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  const label = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `${label} ${hours === 1 ? 'hour' : 'hours'}`;
}
