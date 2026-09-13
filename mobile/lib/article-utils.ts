/**
 * Pure utility functions for article display logic.
 * No React Native or native module dependencies — safe to test in jsdom.
 */

import type { Article } from '@shared/types';

/**
 * When the story happened — the only time this app should ever show a reader.
 *
 * `addedAt` is the build's mtime. The pipeline writes a whole editorial cycle
 * in one burst and the editor stage rewrites files, so mtime collapses to one
 * value per cycle: a live 49-article feed carried 12 distinct `addedAt` values,
 * twelve stories all reading "now", and the freshest-looking item on the page
 * was 38 hours old. It also flattened the recency tiebreak in `orderNewsRiver`
 * to a no-op within a cycle.
 *
 * `eventAt` is the build's answer, added 2026-08-31. The `date` fallback is
 * what makes this correct against payloads built before it — the field was
 * always in the feed, just never read — and `addedAt` remains the last resort
 * for a story whose date will not parse.
 */
export const articleTime = (a: Pick<Article, 'eventAt' | 'date' | 'addedAt'>): number =>
  a.eventAt ?? (Date.parse(a.date) || a.addedAt);

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
