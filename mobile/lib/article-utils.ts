/**
 * Pure utility functions for article display logic.
 * No React Native or native module dependencies — safe to test in jsdom.
 */

import type { Article } from '@shared/types';

/**
 * When zuhd published the story — the one time this app shows a reader, and
 * the one it orders the day by.
 *
 * It was when the story *happened* (`eventAt`) from 2026-08-31 to 2026-09-26.
 * That read well until the desk picked a story up late: a story published
 * this morning about something yesterday afternoon sat deep in the river,
 * behind stories the reader had already read, under `21h ago · new`, and the
 * user asked why new stories did not arrive in order. A news reader dates a
 * story by when it ran; the user chose that on 2026-09-26.
 *
 * `ranAt` is the run the story came out in (`orderNewsRiver`), so a cycle's
 * stories share one time; `publishedAt` is the build's stable answer; and
 * `addedAt` — a file mtime, which a rebase on the pipeline box can reset —
 * is the fallback for payloads built before `publishedAt` existed.
 */
export const articleTime = (
  a: Pick<Article, 'publishedAt' | 'addedAt'> & { ranAt?: number },
): number => a.ranAt ?? a.publishedAt ?? a.addedAt;

/**
 * When the story happened: the frontmatter date. Orders the stories inside one
 * run (`orderNewsRiver`), newest event first; never printed. The `date`
 * fallback covers payloads built before `eventAt` (2026-08-31).
 */
export const eventTime = (a: Pick<Article, 'eventAt' | 'date' | 'addedAt'>): number =>
  a.eventAt ?? (Date.parse(a.date) || a.addedAt);

/** One formatter for the date a story older than a week prints, in the
 *  phone's own locale as it always was. It runs per row and per step of the
 *  dock's scrub, and `toLocaleDateString` builds a formatter per call. */
let dayMonthFormat: Intl.DateTimeFormat | undefined;

export function formatTimeAgo(addedAt: number): string {
  const diffMs = Date.now() - addedAt;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  dayMonthFormat ??= new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
  return dayMonthFormat.format(new Date(addedAt));
}

export function ccToFlag(cc: string): string {
  return cc
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65));
}
