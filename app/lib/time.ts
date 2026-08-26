/**
 * Plain (non-component) helpers so date arithmetic in Server Component pages
 * doesn't trip the react-hooks/purity lint rule, which flags direct
 * Date.now() calls inside component bodies.
 */
export function daysSince(date: Date): number {
  return Math.max(0, Math.round((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)));
}

export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
