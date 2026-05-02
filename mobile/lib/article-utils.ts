/**
 * Pure utility functions for article display logic.
 * No React Native or native module dependencies — safe to test in jsdom.
 */

export function formatTimeAgo(addedAt: number): string {
  const diffMs = Date.now() - addedAt;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(addedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Absolute time shown when the user taps a relative dateline. The relative
 *  form ("5h ago") asked the temporal question; this answers with exactly the
 *  granularity the question implied:
 *    same day  → "Today, 14:30"
 *    prev day  → "Yesterday, 14:30"
 *    this week → "Tuesday, 14:30"
 *    this year → "Mar 5, 14:30"
 *    older     → "Mar 5, 2025"
 *  24h time matches the globe's wire-service timestamp convention so the two
 *  surfaces don't disagree. Locale handles weekday/month names. */
export function formatExactTime(addedAt: number): string {
  const now = new Date();
  const then = new Date(addedAt);
  const time = then.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const sameDate = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDate(then, now)) return `Today, ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDate(then, yesterday)) return `Yesterday, ${time}`;

  const diffDays = (now.getTime() - then.getTime()) / 86_400_000;
  if (diffDays < 7) {
    const weekday = then.toLocaleDateString(undefined, { weekday: 'long' });
    return `${weekday}, ${time}`;
  }

  if (then.getFullYear() === now.getFullYear()) {
    const date = then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${date}, ${time}`;
  }

  return then.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ccToFlag(cc: string): string {
  return cc
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Character-equivalent "weight" of each block type for font-scaling purposes —
 *  chosen so that a single block occupies roughly the same viewport budget as
 *  its prose equivalent. Tuned against fixture articles, not precise. */
export function computeFontScale(title: string, sentences: string[]): number {
  const contentLength = title.length * 2 + sentences.join(' ').length;
  const threshold = 450;
  if (contentLength <= threshold) return 1;
  return Math.max(0.95, threshold / contentLength);
}
