import type { Article, Category, FeedResponse } from '@shared/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { STALE_THRESHOLD } from '../constants/theme';
import {
  type Arrival,
  applyArrival,
  FEED_QUERY_KEY,
  feedSlugs,
  feedStories,
  fetchArrival,
  probeGenerated,
} from '../lib/arrival';
import { flushBookmarks } from '../lib/bookmark-store';
import { collectNewArticles } from '../lib/feed-diff';
import { feedCache, fetchFeed } from '../lib/feed-source';
import { flushFound } from '../lib/found-store';
import { flushKnown, noteFeed } from '../lib/fresh-store';
import { flushOnboarding } from '../lib/onboarding-store';
import { flushRead } from '../lib/read-store';
import { getLastSeenAt, saveLastSeenAt } from '../lib/storage';
import { useAppResume } from './useAppResume';

type GroupedArticles = Record<Category, Article[]>;

const emptyGrouped: GroupedArticles = {
  politics: [],
  economy: [],
  science: [],
  tech: [],
};

interface BriefingInfo {
  date: string;
  available: boolean;
  duration?: number;
}

/**
 * What a return to the app brought, for the screen to decide where the reader
 * lands (`resumeLanding`). Handed over *inside* the arrival's flush, so
 * whatever the screen sets in answer — the deck back at the front, a toast —
 * renders in the same commit as the stories. As state read by an effect it
 * was a commit later: the old story sat under the new day's times for a
 * second before the deck jumped. Also called on a return that brought
 * nothing, so the screen can still act on the time away.
 */
export interface AppReturn {
  /** How long the app was away; `Infinity` for a launch. */
  awayMs: number;
  coldStart: boolean;
  /** Stories in the feed now that were not in it when the reader left. */
  added: Article[];
}

interface ArticlesState {
  grouped: GroupedArticles;
  briefing: BriefingInfo | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<Article[]>;
  retry: () => Promise<void>;
  tick: number;
  generated: string | null;
  injectArticle: (article: Article, category: Category) => void;
}

/** Bumped at most once a minute (formatTimeAgo's finest granularity), so
 *  resumes within a minute don't re-render every visible cell. */
const TICK_GRANULARITY_MS = 60_000;

export function useArticles(
  /** Where the screen answers a return; read when one happens. */
  onReturnRef?: { readonly current: ((ret: AppReturn) => void) | null },
): ArticlesState {
  const queryClient = useQueryClient();
  /** Null until read from storage: `noteFeed` waits for it. */
  const [lastSeenAt, setLastSeenAt] = useState<number | null>(null);
  const lastSeenAtRef = useRef<number | null>(null);
  lastSeenAtRef.current = lastSeenAt;
  const refreshingRef = useRef(false);
  /** The feed's slugs when the app last went to the background: what a return
   *  counts as new against, however the new feed got here — this return's
   *  arrival, or a background task that applied one while the app was away. */
  const seenAtBackgroundRef = useRef<Set<string> | null>(null);

  // The launch opens on the newest feed the device has — the one on disk,
  // which every successful fetch writes, the background task's included —
  // read before the first frame. It used to be seeded after it: the
  // persister's older copy painted, the disk's newer one replaced it a moment
  // later, and the network's replaced that, three rivers in the first seconds.
  // Stamped now, so the persister's restore (always older: the disk copy is
  // written on every fetch) never overwrites it.
  const query = useQuery({
    queryKey: FEED_QUERY_KEY,
    queryFn: ({ signal }) => fetchFeed({ signal }),
    initialData: () => feedCache.readSync() ?? undefined,
    initialDataUpdatedAt: Date.now,
    // Only when there is nothing to show. Once there is, a newer build
    // reaches the screen as an arrival (below), with everything else it
    // changed, never as a refetch of the feed alone.
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // Load lastSeenAt from storage on mount
  useEffect(() => {
    getLastSeenAt().then(setLastSeenAt);
  }, []);

  // Which stories are new to the reader (`fresh-store`). Every feed is noted
  // once, by its `generated` stamp; an arrival notes its own feed in its
  // flush, so this catches the launch's feed and a first install's fetch.
  // `lastSeenAt` only matters to an install that never noted a feed.
  useEffect(() => {
    if (!query.data || lastSeenAt === null) return;
    noteFeed(query.data.generated, feedStories(query.data), lastSeenAt);
  }, [query.data, lastSeenAt]);

  const [tick, setTick] = useState(0);
  const lastTickAtRef = useRef(0);
  const bumpTick = useCallback(() => {
    const now = Date.now();
    if (now - lastTickAtRef.current < TICK_GRANULARITY_MS) return;
    lastTickAtRef.current = now;
    setTick((t) => t + 1);
  }, []);

  /** The build the site is on, when it is not the one on screen; null when
   *  it is. Throws when the site cannot be reached. */
  const newerBuild = useCallback(async (): Promise<string | null> => {
    const current = queryClient.getQueryData<FeedResponse>(FEED_QUERY_KEY)?.generated;
    const generated = await probeGenerated();
    return generated === current ? null : generated;
  }, [queryClient]);

  // A launch that opened on a cached feed checks for a newer build once,
  // after the note above has run on the cached one — a first install fetches
  // through the query instead. The screen puts the reader on the new front.
  const launchCheckedRef = useRef(false);
  const hasData = query.data !== undefined;
  useEffect(() => {
    if (launchCheckedRef.current || !hasData || lastSeenAt === null) return;
    launchCheckedRef.current = true;
    if (query.isFetchedAfterMount) return;
    refreshingRef.current = true;
    void (async () => {
      try {
        if ((await newerBuild()) === null) return;
        const arrival = await fetchArrival();
        applyArrival(queryClient, arrival, {
          lastSeenAt,
          alsoInFlush: (added) => {
            onReturnRef?.current?.({ awayMs: Infinity, coldStart: true, added });
          },
        });
      } catch {
        // Offline: the cached feed is the news until the next return or pull.
      } finally {
        refreshingRef.current = false;
      }
    })();
  }, [hasData, lastSeenAt, newerBuild, onReturnRef, queryClient, query.isFetchedAfterMount]);

  // A return after more than STALE_THRESHOLD: one probe, and one arrival if
  // the site was rebuilt. The clock's tick and the return's report ride in
  // the arrival's flush, so the track is re-measured once, with the stories.
  const handleResume = useEffectEvent(async (awayMs: number) => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    const report = (feed: FeedResponse | undefined) => {
      bumpTick();
      const seen = seenAtBackgroundRef.current;
      const added = feed && seen ? collectNewArticles(feed, seen) : [];
      onReturnRef?.current?.({ awayMs, coldStart: false, added });
    };
    try {
      let arrival: Arrival | null = null;
      try {
        if ((await newerBuild()) !== null) arrival = await fetchArrival();
      } catch {
        // Quiet when offline: existing content is fine.
      }
      if (arrival) {
        const feed = arrival.feed;
        applyArrival(queryClient, arrival, {
          lastSeenAt: lastSeenAtRef.current,
          alsoInFlush: () => report(feed),
        });
      } else {
        report(queryClient.getQueryData<FeedResponse>(FEED_QUERY_KEY));
      }
    } finally {
      refreshingRef.current = false;
    }
  });

  const handleBackground = useEffectEvent(() => {
    seenAtBackgroundRef.current = feedSlugs(queryClient.getQueryData<FeedResponse>(FEED_QUERY_KEY));
    saveLastSeenAt(Date.now());
    flushBookmarks();
    flushFound();
    flushKnown();
    flushRead();
    flushOnboarding();
  });

  useAppResume(handleResume, STALE_THRESHOLD, handleBackground);

  /** Pull to refresh: the same arrival, reporting what it added. */
  const refresh = useCallback(async (): Promise<Article[]> => {
    if (refreshingRef.current) return [];
    refreshingRef.current = true;
    try {
      let generated: string | null;
      try {
        generated = await newerBuild();
      } catch {
        // A manual refresh must not turn an unreadable probe into "up to date".
        throw new Error('Could not verify feed freshness');
      }
      if (generated === null) return [];
      const arrival = await fetchArrival();
      return applyArrival(queryClient, arrival, { lastSeenAt: lastSeenAtRef.current });
    } finally {
      refreshingRef.current = false;
    }
  }, [queryClient, newerBuild]);

  const retry = useCallback(async () => {
    await query.refetch();
  }, [query.refetch]);

  /** Inject an article into a category if it's not already present (e.g.
   *  bookmarked article that rotated out of the feed). */
  const injectArticle = useCallback(
    (article: Article, category: Category) => {
      queryClient.setQueryData<FeedResponse>(FEED_QUERY_KEY, (prev) => {
        if (!prev) return prev;
        const list = prev.categories[category] ?? [];
        if (list.some((a) => a.slug === article.slug)) return prev;
        return {
          ...prev,
          categories: { ...prev.categories, [category]: [article, ...list] },
        };
      });
    },
    [queryClient],
  );

  const grouped = useMemo<GroupedArticles>(() => {
    if (!query.data) return emptyGrouped;
    return { ...emptyGrouped, ...query.data.categories };
  }, [query.data]);

  return {
    grouped,
    briefing: query.data?.briefing ?? null,
    // Surface loading only on the very first attempt — cache hydration from
    // the persister presents data instantly, so loading flips false as soon
    // as there's *anything* to render.
    loading: query.isPending && !query.data,
    error: query.error ? (query.error.message ?? 'Unknown error') : null,
    refresh,
    retry,
    tick,
    generated: query.data?.generated ?? null,
    injectArticle,
  };
}
