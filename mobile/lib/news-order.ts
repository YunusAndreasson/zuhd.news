import type { Article, Category } from '@shared/types';
import { CATEGORIES } from '../constants/theme';
import { articleTime } from './article-utils';
import { isMostCovered } from './coverage';
import { DAY_MS } from './time';

/** A feed article with its original category retained for its kicker. */
export type RiverArticle = Article & { category: Category };

/** Newest story first, using the same timestamp as the visible dateline.
 * Slug breaks exact ties deterministically; coverage never changes recency. */
function compareNewsRecency(a: RiverArticle, b: RiverArticle): number {
  const recency = articleTime(b) - articleTime(a);
  if (recency !== 0) return recency;
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
}

/**
 * Every story in one line, newest first, whatever its category.
 *
 * The river was four category bands, newest first within each, so the track
 * could be scrubbed straight to a category by its colour. That put the day's
 * newest stories in four places, one at the head of each band, and a reader
 * coming back could not tell whether anything had arrived (2026-09-21, at the
 * user's request). In time order what arrived since they last looked is at the
 * head of the river, where the deck opens and the track starts; the category
 * is still each card's dot and each segment's hue.
 */
export function orderNewsRiver(grouped: Record<Category, Article[]>): RiverArticle[] {
  const flat: RiverArticle[] = [];
  for (const category of CATEGORIES) {
    for (const article of grouped[category] ?? []) flat.push({ ...article, category });
  }
  return flat.sort(compareNewsRecency);
}

/** How much of the river the app shows: one day of news. */
export const RIVER_WINDOW_MS = DAY_MS;

/**
 * The last day of the river, preserving its order.
 *
 * The feed carries several days of stories, and swiping, the globe's lights,
 * the found ring and the list all read the same river, so a story from three
 * days ago was one more card to swipe past and one more light to find. The
 * window is measured on the dateline's own timestamp (`articleTime`).
 *
 * Two exceptions, both so the screen never lies by omission:
 * - **A stalled pipeline does not empty the globe.** When nothing is inside the
 *   window, it is anchored on the newest story instead — the last day the desk
 *   published, each card still dated by its kicker.
 * - **A story a reader asked for is kept** (`keep`): a saved story, a
 *   notification, a related story from another sheet. It is outside the day,
 *   but it was requested by name, and the deck can only show what the river
 *   holds.
 */
export function recentRiver(
  river: readonly RiverArticle[],
  now: number,
  keep: ReadonlySet<string> = new Set(),
): RiverArticle[] {
  const from = riverAnchor(river, now) - RIVER_WINDOW_MS;
  return river.filter((a) => articleTime(a) >= from || keep.has(a.slug));
}

/**
 * The moment the river's day ends: now, or the newest story when nothing is
 * inside the day (a stalled pipeline). The story track's left end is this
 * moment, so its hour marks count back from the same place the window does.
 */
export function riverAnchor(river: readonly RiverArticle[], now: number): number {
  // Not `river[0]`: a caller may hand in a river in some other order.
  const newest = river.reduce(
    (latest, article) => Math.max(latest, articleTime(article)),
    -Infinity,
  );
  return newest >= now - RIVER_WINDOW_MS ? now : newest;
}

/** At most this many stories lead the river as the day's top news. A day
 *  runs to 0–8 over the bar, usually two to four; past five the lead would
 *  push the day's newest story a long swipe back. */
export const TOP_STORIES = 5;

/**
 * The day's top stories first, most reported first, then everything else
 * newest first as before (2026-09-23, the user's request: "like you would
 * expect top news to show up at the top" — Apple News and Google News both
 * open on top stories, then the latest).
 *
 * A top story is one over the most-covered bar (`isMostCovered`, 400
 * reports), inside the day's window: a pinned story from last week does not
 * lead today. The bar is absolute, so a quiet day has no lead at all and the
 * river is plain time order, exactly as it was. The three in five stories
 * with no figure can never lead — not a judgement on them, only the limit of
 * what is measured, which is why this is a short lead and not a sort.
 *
 * `lead` is how many stories were moved to the front: `buildStoryRows` looks
 * for the `earlier` boundary after them, since the lead is not in time order.
 */
export function leadWithTopStories(
  river: readonly RiverArticle[],
  now: number,
): { river: RiverArticle[]; lead: number } {
  const from = riverAnchor(river, now) - RIVER_WINDOW_MS;
  const top = river
    .filter((a) => isMostCovered(a) && articleTime(a) >= from)
    .sort((a, b) => (b.eventCoverage ?? 0) - (a.eventCoverage ?? 0) || compareNewsRecency(a, b))
    .slice(0, TOP_STORIES);
  if (top.length === 0) return { river: [...river], lead: 0 };
  const leading = new Set(top.map((a) => a.slug));
  return { river: [...top, ...river.filter((a) => !leading.has(a.slug))], lead: top.length };
}
