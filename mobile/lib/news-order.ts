import type { Article, Category, GroupedArticles } from '@shared/types';
import { CATEGORIES } from '../constants/theme';
import { articleTime, eventTime } from './article-utils';
import { isMostCovered } from './coverage';
import { DAY_MS } from './time';

/**
 * A feed article with its original category retained for its kicker, and the
 * run it came out in (`ranAt`, set by `orderNewsRiver`).
 */
export type RiverArticle = Article & { category: Category; ranAt?: number };

/** Stories one cycle writes land within minutes of each other; cycles are
 *  hours apart. A gap longer than this starts a new run. */
export const RUN_GAP_MS = 30 * 60_000;

/**
 * How widely a story was reported, for its place inside its run: the most
 * reported first (2026-09-26, the user's request — "hottest news first").
 *
 * Two measures exist and neither covers every story. `eventCoverage`, the
 * news API's count of reports, is missing on about three in five (every
 * RSS-origin story), and a missing figure means unmeasured, never quiet
 * (`lib/coverage.ts`). So it ranks only over its bar: a story past 400
 * reports leads its run, as its cell stands taller on the track. Below the
 * bar the measure is breadth — how many outlets the desk cited, which every
 * story has, and which follows the count where both exist (the 18:12 run of
 * 2026-09-26: 6, 5, 4, 3, 3, 2, 2 sources beside 830, 165, 227, 182, 155,
 * 127, 100 reports).
 *
 * Only inside a run, never across one. A run shares one time on the track, so
 * reordering it moves no cell by more than the run's own width. The day's top
 * stories led the whole river for a day (2026-09-23) and were removed for
 * exactly that jump: swiping through them sent the playhead across the day
 * and back. That lead was deleted on 2026-09-26, once this replaced it.
 */
function compareHeat(a: RiverArticle, b: RiverArticle): number {
  const over = (x: RiverArticle) => (isMostCovered(x) ? (x.eventCoverage as number) : 0);
  const lead = over(b) - over(a);
  if (lead !== 0) return lead;
  return (b.sources?.length ?? 0) - (a.sources?.length ?? 0);
}

/** Newest run first; inside a run the most reported first (`compareHeat`),
 *  then the newest event. Slug breaks exact ties deterministically. */
function compareNewsRecency(a: RiverArticle, b: RiverArticle): number {
  const ran = articleTime(b) - articleTime(a);
  if (ran !== 0) return ran;
  const heat = compareHeat(a, b);
  if (heat !== 0) return heat;
  const happened = eventTime(b) - eventTime(a);
  if (happened !== 0) return happened;
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
 *
 * Time order was when each story *happened* until 2026-09-26, which broke that
 * promise for every story the desk picked up late: it went into the river
 * hours deep, among stories the reader had read, and the dock's `‹ n new`
 * never counted it, because it sat ahead of them. Now the river runs by when
 * zuhd published (`articleTime`), one run per cycle, and within a run the
 * most reported first (`compareHeat`), then by when each story happened.
 *
 * **A run shares one time** (`ranAt`, its newest story's). The files of one
 * cycle land over a few minutes, and read to the minute, a run ordered by
 * event would print `12m ago` above `13m ago`. With `publishedAt` a cycle is
 * one commit and so one time already; runs matter for payloads built before
 * it, whose times are mtimes.
 */
export function orderNewsRiver(grouped: GroupedArticles): RiverArticle[] {
  const flat: RiverArticle[] = [];
  for (const category of CATEGORIES) {
    for (const article of grouped[category] ?? []) flat.push({ ...article, category });
  }
  flat.sort((a, b) => articleTime(b) - articleTime(a));
  let ranAt = Number.NaN;
  let previous = Number.NaN;
  for (const article of flat) {
    const at = articleTime(article);
    // NaN on the first story, so it opens the first run.
    if (!(previous - at <= RUN_GAP_MS)) ranAt = at;
    previous = at;
    article.ranAt = ranAt;
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
 * window is measured on the time each card prints (`articleTime`): a day of
 * what zuhd published.
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
