import { getCoords } from '../components/globe/storyDots';
import { articleTime, formatTimeAgo } from './article-utils';
import type { RiverArticle } from './news-order';
import type { LatLng } from './now';

/**
 * The river, as uniform rows the globe can fly along.
 *
 * Two things make this a module rather than a `map` inside the screen.
 *
 * **The camera track has to be parallel to the list.** `MiniGlobe` finds the
 * row under the reader by dividing scroll offset by row height, so row *n* of
 * the list and pair *n* of the track must be the same story. Building both
 * from one pass is the only way that stays true when either changes.
 *
 * **Location is deliberately absent from the meta line.** `ArticleRow` prints
 * it, and it is right there — but on this screen the globe is turning to the
 * dateline as you scroll past it, so printing "New Delhi" under the headline
 * is the same fact twice, in the weaker of the two channels.
 */

export interface StoryRow {
  slug: string;
  article: RiverArticle;
  title: string;
  /** `politics · 2h ago`. Lowercase; the small-caps face does the rest. */
  meta: string;
  /**
   * The ink step before the meta line, or null.
   *
   * `new` marks every story that arrived since the reader last had the feed
   * (`fresh-store`), and `earlier` the first one after them they already had —
   * the boundary the reader once drew as a full "caught up" rule. A divider
   * row would break the uniform row height the camera depends on, and the ink
   * step is the convention the app already uses for exactly this kind of
   * "the app is telling you where you are" line.
   *
   * `new` is on every new card, not only the first, since 2026-09-21: the
   * river is in time order now, and a reader coming back asked to see what
   * had arrived, not only where it ended.
   */
  mark: 'new' | 'earlier' | null;
  /** Arrived since the reader last had the feed. */
  fresh: boolean;
  /** Bare percentage from a prediction market tied to this story. */
  odds: string | null;
  coords: LatLng | null;
}

export interface BuildStoryRowsInput {
  river: RiverArticle[];
  /** Slugs new to the reader (`fresh-store`). */
  fresh: ReadonlySet<string>;
  /** slug → bare percentage, from `lib/predictions.ts`. */
  odds?: ReadonlyMap<string, string>;
}

export function buildStoryRows({ river, fresh, odds }: BuildStoryRowsInput): StoryRow[] {
  // The boundary is the first story the reader already had. By slug, never by
  // `addedAt`: the question is "was this here last time you looked", and a
  // rewritten file's mtime says it was published a minute ago.
  let boundaryMarked = false;

  return river.map((article, index) => {
    const isFresh = fresh.has(article.slug);
    let mark: StoryRow['mark'] = isFresh ? 'new' : null;
    // Suppress a boundary on the opening card: `earlier ·` there reads as
    // a label on that story rather than as a place the reader has reached.
    if (!isFresh && !boundaryMarked) {
      if (index > 0) mark = 'earlier';
      boundaryMarked = true;
    }
    const coords = getCoords(article);
    return {
      slug: article.slug,
      article,
      title: article.title,
      meta: `${article.category} · ${formatTimeAgo(articleTime(article))}`,
      mark,
      fresh: isFresh,
      odds: odds?.get(article.slug) ?? null,
      coords: coords ? [coords[0], coords[1]] : null,
    };
  });
}

/** The flat `[lat, lng, …]` array `MiniGlobe.cameraTrack` expects, one pair
 *  per row, `null, null` where a story has no place. */
export function cameraTrackOf(rows: StoryRow[]): (number | null)[] {
  const track: (number | null)[] = [];
  for (const row of rows) {
    track.push(row.coords ? row.coords[0] : null, row.coords ? row.coords[1] : null);
  }
  return track;
}
