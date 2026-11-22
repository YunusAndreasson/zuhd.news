import type { Article, FeedResponse } from '@shared/types';
import { hashKey, notifyManager, type QueryClient, queryOptions } from '@tanstack/react-query';
import { API_BASE } from '../constants/theme';
import { type FetchedSnapshot, fetchAllSnapshots } from './api-snapshots';
import { collectNewArticles, isOlderFeed } from './feed-diff';
import { downloadFeed, fetchFeed, saveFeed } from './feed-source';
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

export const feedQuery = queryOptions({
  queryKey: ['feed'] as const,
  queryFn: ({ signal }) => fetchFeed({ signal }),
});

export const FEED_QUERY_KEY = feedQuery.queryKey;

export interface Arrival {
  feed: FeedResponse;
  snapshots: FetchedSnapshot[];
  generation?: number;
}

let generation = 0;
const pendingArrivals = new Set<AbortController>();

export function arrivalGeneration(): number {
  return generation;
}

export function cancelArrivals(): void {
  generation++;
  for (const controller of pendingArrivals) controller.abort();
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
export async function probeGenerated(signal?: AbortSignal): Promise<string> {
  const meta = await fetchJson(`${API_BASE}/api/meta.json`, isMetaResponse, {
    cache: 'no-store',
    signal,
  });
  return meta.generated;
}

interface Download {
  build?: string;
  controller: AbortController;
  foreground: boolean;
  work: Promise<Arrival>;
}
const downloads = new WeakMap<QueryClient, Download>();

/** A return while the background task is downloading the same build joins
 * the transfer. Once the reader joins, iOS task expiry only ends its own interest. */
export function fetchArrival(
  queryClient: QueryClient,
  build?: string,
  background?: AbortSignal,
): Promise<Arrival> {
  const previous = downloads.get(queryClient);
  if (previous && previous.build === build && !previous.controller.signal.aborted) {
    if (!background) previous.foreground = true;
    return previous.work;
  }
  const controller = new AbortController();
  const startedIn = generation;
  async function downloadBuild(): Promise<Arrival> {
    const [feed, snapshots] = await Promise.all([
      downloadFeed({ cache: 'no-store', signal: controller.signal }),
      fetchAllSnapshots((key) => queryClient.getQueryData(key), false, controller.signal),
    ]);
    if (controller.signal.aborted) throw new Error('Arrival cancelled');
    await saveFeed(feed);
    return { feed, snapshots, generation: startedIn };
  }
  pendingArrivals.add(controller);
  const download: Download = {
    build,
    controller,
    foreground: !background,
    work: downloadBuild().finally(() => {
      controller.abort();
      pendingArrivals.delete(controller);
      background?.removeEventListener('abort', expire);
      if (downloads.get(queryClient) === download) downloads.delete(queryClient);
    }),
  };
  function expire() {
    if (!download.foreground) controller.abort();
  }
  downloads.set(queryClient, download);
  background?.addEventListener('abort', expire);
  if (background?.aborted) expire();
  return download.work;
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
    background = false,
  }: { lastSeenAt: number | null; alsoInFlush?: (added: Article[]) => void; background?: boolean },
): Article[] {
  if (arrival.generation !== undefined && arrival.generation !== generation) return [];
  const before = queryClient.getQueryData(FEED_QUERY_KEY);
  // The feed may have downloaded first, then waited on a slow layer while a
  // foreground/background request applied a newer complete arrival.
  if (isOlderFeed(arrival.feed, before)) return [];
  const added = before ? collectNewArticles(arrival.feed, feedSlugs(before)) : [];
  notifyManager.batch(() => {
    // Scheduled, not called: `noteFeed` tells its subscribers at once, and
    // called here it would re-render the kickers a commit ahead of the river.
    const appliedIn = generation;
    const notify = () => {
      if (
        appliedIn !== generation ||
        queryClient.getQueryData(FEED_QUERY_KEY)?.generated !== arrival.feed.generated
      )
        return;
      if (lastSeenAt !== null) {
        noteFeed(arrival.feed.generated, feedStories(arrival.feed), lastSeenAt);
      }
      alsoInFlush?.(added);
    };
    if (!background) notifyManager.schedule(notify);
    queryClient.setQueryData(FEED_QUERY_KEY, arrival.feed);
    for (const snapshot of arrival.snapshots) {
      queryClient.setQueryData(snapshot.queryKey, snapshot.data);
    }
    // iOS may suspend the task before a scheduled notification runs.
    if (background) notify();
  });
  return added;
}

/** Retry only the layers an earlier arrival could not fetch, even on the same build. */
export async function retryFailedSnapshots(queryClient: QueryClient): Promise<void> {
  const startedIn = generation;
  const before = new Map<string, unknown>();
  const snapshots = await fetchAllSnapshots((key) => {
    const data = queryClient.getQueryData(key);
    before.set(hashKey(key), data);
    return data;
  }, true);
  if (startedIn !== generation) return;
  notifyManager.batch(() => {
    for (const snapshot of snapshots) {
      // Another load may have recovered this layer while the retry waited.
      if (queryClient.getQueryData(snapshot.queryKey) !== before.get(hashKey(snapshot.queryKey)))
        continue;
      queryClient.setQueryData(snapshot.queryKey, snapshot.data);
    }
  });
}
