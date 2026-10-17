import type { Article, Category, FeedResponse, GroupedArticles } from '@shared/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { STALE_THRESHOLD } from '../constants/theme';
import {
  applyArrival,
  FEED_QUERY_KEY,
  feedSlugs,
  feedStories,
  fetchArrival,
  probeGenerated,
  retryFailedSnapshots,
} from '../lib/arrival';
import { collectNewArticles, isOlderFeed } from '../lib/feed-diff';
import { feedCache, fetchFeed } from '../lib/feed-source';
import { flushStores } from '../lib/flush-stores';
import { noteFeed } from '../lib/fresh-store';
import { getLastSeenAt, saveLastSeenAt } from '../lib/storage';
import { useAppResume } from './useAppResume';

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
  /** When the recording was made — see `FeedResponse.briefing`. */
  generated?: string;
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
  const refreshingRef = useRef<Promise<{ added: Article[]; applied: boolean }> | null>(null);
  const refreshCallbacksRef = useRef<((added: Article[]) => void)[]>([]);
  /** The feed's slugs when the app last went to the background: what a return
   *  counts as new against, however the new feed got here — this return's
   *  arrival, or a background task that applied one while the app was away. */
  const seenAtBackgroundRef = useRef<Set<string> | null>(null);
  /** The load a return joined, so a reconnect sharing it leaves the report to
   *  the return. */
  const resumeLoadRef = useRef<Promise<unknown> | null>(null);

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
    refetchOnReconnect: false,
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

  // Every entry point joins the same operation. A manual pull waits for an
  // automatic check and receives its real result or failure.
  const loadLatest = useCallback(
    (alsoInFlush?: (added: Article[]) => void) => {
      if (alsoInFlush) refreshCallbacksRef.current.push(alsoInFlush);
      if (refreshingRef.current) return refreshingRef.current;
      const callbacks = refreshCallbacksRef.current;
      refreshingRef.current = (async () => {
        try {
          if ((await newerBuild()) === null) {
            await retryFailedSnapshots(queryClient);
            return { added: [], applied: false };
          }
          const arrival = await fetchArrival(queryClient);
          if (isOlderFeed(arrival.feed, queryClient.getQueryData<FeedResponse>(FEED_QUERY_KEY))) {
            return { added: [], applied: false };
          }
          const added = applyArrival(queryClient, arrival, {
            lastSeenAt: lastSeenAtRef.current,
            alsoInFlush: (added) => {
              for (const callback of callbacks) callback(added);
            },
          });
          return { added, applied: true };
        } finally {
          refreshingRef.current = null;
          refreshCallbacksRef.current = [];
        }
      })();
      return refreshingRef.current;
    },
    [newerBuild, queryClient],
  );

  // A launch that opened on a cached feed checks for a newer build once,
  // after the note above has run on the cached one — a first install fetches
  // through the query instead. The screen puts the reader on the new front.
  const launchCheckedRef = useRef(false);
  const hasData = query.data !== undefined;
  useEffect(() => {
    if (launchCheckedRef.current || !hasData || lastSeenAt === null) return;
    launchCheckedRef.current = true;
    if (query.isFetchedAfterMount) return;
    void loadLatest((added) => {
      onReturnRef?.current?.({ awayMs: Infinity, coldStart: true, added });
    }).catch(() => {}); // Offline: keep the cached feed until the next check.
  }, [hasData, lastSeenAt, loadLatest, onReturnRef, query.isFetchedAfterMount]);

  // A return after more than STALE_THRESHOLD: one probe, and one arrival if
  // the site was rebuilt. The clock's tick and the return's report ride in
  // the arrival's flush, so the track is re-measured once, with the stories.
  // A plain function, as `handleBackground` is: `useAppResume` reads the
  // latest of each through its own effect events, and an effect event is not
  // handed from one hook to another.
  const handleResume = async (awayMs: number) => {
    const report = (feed: FeedResponse | undefined) => {
      bumpTick();
      const seen = seenAtBackgroundRef.current;
      const added = feed && seen ? collectNewArticles(feed, seen) : [];
      onReturnRef?.current?.({ awayMs, coldStart: false, added });
    };
    let applied = false;
    try {
      const load = loadLatest(() => {
        report(queryClient.getQueryData<FeedResponse>(FEED_QUERY_KEY));
      });
      resumeLoadRef.current = load;
      applied = (await load).applied;
    } catch {
      // Keep cached content when offline; a manual caller still sees failure.
    }
    if (!applied) report(queryClient.getQueryData<FeedResponse>(FEED_QUERY_KEY));
  };

  // A reconnect is not a return. It reports what its own arrival added (counted
  // against the feed just before it) and nothing when nothing arrived: the
  // resume path counts against the last background, so every reconnect after
  // one showed the same "N new" again.
  const reconnect = useEffectEvent(() => {
    const load = loadLatest((added) => {
      if (resumeLoadRef.current === load) return;
      bumpTick();
      if (added.length) onReturnRef?.current?.({ awayMs: 0, coldStart: false, added });
    });
    load.catch(() => {
      // Offline again: the cached feed stands.
    });
  });
  useEffect(() => {
    let connected: boolean | null = null;
    let receivedEvent = false;
    void Network.getNetworkStateAsync()
      .then((state) => {
        if (!receivedEvent) connected = state.isInternetReachable ?? state.isConnected ?? null;
      })
      .catch(() => {});
    const subscription = Network.addNetworkStateListener((state) => {
      receivedEvent = true;
      const next = state.isInternetReachable ?? state.isConnected;
      if (next == null) return;
      const wasConnected = connected;
      connected = next;
      if (next && wasConnected !== true) reconnect();
    });
    return () => subscription.remove();
  }, []);

  const handleBackground = () => {
    seenAtBackgroundRef.current = feedSlugs(queryClient.getQueryData<FeedResponse>(FEED_QUERY_KEY));
    saveLastSeenAt(Date.now());
    flushStores();
  };

  useAppResume(handleResume, STALE_THRESHOLD, handleBackground);

  /** Pull to refresh: the same arrival, reporting what it added. */
  const refresh = useCallback(async () => (await loadLatest()).added, [loadLatest]);

  const retry = useCallback(async () => {
    await query.refetch();
  }, [query.refetch]);

  // Keep explicitly opened stories for this session independently of feed
  // replacements. A delayed arrival must not remove a notification's story.
  const [openedArticles, setOpenedArticles] = useState<
    Map<string, { article: Article; category: Category }>
  >(() => new Map());
  const injectArticle = useCallback((article: Article, category: Category) => {
    setOpenedArticles((previous) => {
      if (previous.get(article.slug)?.article === article) return previous;
      const next = new Map(previous);
      next.set(article.slug, { article, category });
      return next;
    });
  }, []);

  const grouped = useMemo<GroupedArticles>(() => {
    const result = { ...emptyGrouped, ...query.data?.categories };
    const present = new Set(
      Object.values(result).flatMap((articles) => articles.map((a) => a.slug)),
    );
    for (const { article, category } of openedArticles.values()) {
      if (!present.has(article.slug)) result[category] = [...result[category], article];
    }
    return result;
  }, [query.data, openedArticles]);

  return {
    grouped,
    briefing: query.data?.briefing ?? null,
    // Surface loading only on the very first attempt — cache hydration from
    // the persister presents data instantly, so loading flips false as soon
    // as there's *anything* to render.
    // A first launch with nothing on disk and no network pauses the query
    // rather than failing it, so it is the error screen (which says no
    // connection, and resumes with the network), not a spinner that never ends.
    loading: query.isPending && !query.data && query.fetchStatus !== 'paused',
    error: query.error
      ? (query.error.message ?? 'Unknown error')
      : query.fetchStatus === 'paused' && !query.data
        ? 'Offline'
        : null,
    refresh,
    retry,
    tick,
    generated: query.data?.generated ?? null,
    injectArticle,
  };
}
