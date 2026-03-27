/**
 * Pure utility functions for article display logic.
 * No React Native or native module dependencies — safe to test in jsdom.
 */

export function formatTimeAgo(addedAt: number): string {
  const ms = Date.now() - addedAt;
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const date = new Date(addedAt);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function computeFontScale(title: string, sentences: string[]): number {
  const contentLength = title.length * 2 + sentences.join(' ').length;
  const threshold = 450;
  if (contentLength <= threshold) return 1;
  return Math.max(0.95, threshold / contentLength);
}
