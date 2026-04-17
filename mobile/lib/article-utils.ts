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
