/**
 * Pure utility functions for article display logic.
 * No React Native or native module dependencies — safe to test in jsdom.
 */

export function formatTimeAgo(addedAt: number): string {
  const date = new Date(addedAt);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (isYesterday) {
    return `yesterday ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function ccToFlag(cc: string): string {
  return cc
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65));
}

export function computeFontScale(title: string, sentences: string[]): number {
  const contentLength = title.length * 2 + sentences.join(' ').length;
  const threshold = 450;
  if (contentLength <= threshold) return 1;
  return Math.max(0.95, threshold / contentLength);
}
