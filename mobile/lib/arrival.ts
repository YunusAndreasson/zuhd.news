import type { Article, FeedResponse } from '@shared/types';
import { notifyManager, type QueryClient } from '@tanstack/react-query';
import { API_BASE } from '../constants/theme';
import { type FetchedSnapshot, fetchAllSnapshots } from './api-snapshots';
import { collectNewArticles } from './feed-diff';
import { fetchFeed } from './feed-source';
import { fetchJson } from './fetchJson';
import { type FeedStory, noteFeed } from './fresh-store';
import { isMetaResponse } from './validate';

/**
 * A new build reaching the app — on a return, a pull, or in the background —
 * as one thing rather than six.
 *
 * A return used to arrive in waves: the clock moved the track, the feed
 * reordered the river, `noteFeed` re-marked the kickers a commit later, and
 * eight snapshots and the heatmap each landed on their own, so the strip, the
 * marks and the odds kept shuffling for seconds after the stories had moved.
 * Now everything is fetched first and applied in one notify flush: the feed,
 * every snapshot, the new-story set and whatever the caller adds to it
 * (`alsoInFlush`) reach React in the same task, which it renders as one
 * commit.
 */

export const FEED_QUERY_KEY = ['feed'] as const;

export interface Arrival {
  feed: FeedResponse;
  snapshots: FetchedSnapshot[];
}

export function feedSlugs(feed: FeedResponse | null | undefined): Set<string> {
  const slugs = new Set<string>();
  if (!feed) return slugs;
  for (const list of Object.values(feed.categories)) {
    for (const a of list) slugs.add(a.slug);
  }
  return slugs;
}

export function feedStories(feed: FeedResponse): FeedStory[] {
  const stories: FeedStory[] = [];
  for (const list of Object.values(feed.categories)) {
    for (const a of list) stories.push({ slug: a.slug, addedAt: a.addedAt });
  }
  return stories;
}

/** The build the site is on now: a ~0.2KB probe. Throws when unreachable. */
export async function probeGenerated(): Promise<string> {
  const meta = await fetchJson(`${API_BASE}/api/meta.json`, isMetaResponse, {
    cache: 'no-store',
  });
  return meta.generated;
}

/** The feed and every snapshot, side by side. Only the feed failing fails it. */
export async function fetchArrival(): Promise<Arrival> {
  const [feed, snapshots] = await Promise.all([
    fetchFeed({ cache: 'no-store' }),
    fetchAllSnapshots(),
  ]);
  return { feed, snapshots };
}

/**
 * Put an arrival on screen in one flush. Returns the stories it added against
 * the feed that was there before it.
 *
 * `lastSeenAt` is `noteFeed`'s: null while it is still being read from
 * storage, in which case the feed is left for `useArticles`' own note.
 */
export function applyArrival(
  queryClient: QueryClient,
  arrival: Arrival,
  {
    lastSeenAt,
    alsoInFlush,
  }: { lastSeenAt: number | null; alsoInFlush?: (added: Article[]) => void },
): Article[] {
  const before = queryClient.getQueryData<FeedResponse>(FEED_QUERY_KEY);
  const added = before ? collectNewArticles(arrival.feed, feedSlugs(before)) : [];
  notifyManager.batch(() => {
    // Scheduled, not called: `noteFeed` tells its subscribers at once, and
    // called here it would re-render the kickers a commit ahead of the river.
    notifyManager.schedule(() => {
      if (lastSeenAt !== null) {
        noteFeed(arrival.feed.generated, feedStories(arrival.feed), lastSeenAt);
      }
      alsoInFlush?.(added);
    });
    queryClient.setQueryData(FEED_QUERY_KEY, arrival.feed);
    for (const snapshot of arrival.snapshots) {
      queryClient.setQueryData(snapshot.queryKey, snapshot.data);
    }
  });
  return added;
}
