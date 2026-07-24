import type { FeedResponse } from '@shared/types';
import { API_BASE } from '../constants/theme';
import { type FetchJsonOptions, fetchJson } from './fetchJson';
import { createJsonCache } from './json-cache';
import { isFeedResponse } from './validate';

/**
 * The one place that knows where the feed comes from — the network endpoint
 * and the on-disk copy. Both `useArticles` (foreground) and the background
 * task go through here so the durable cache can never diverge from what the
 * app is actually reading.
 */

/** Mobile-shaped feed: same articles as `/api/feed.json` minus the ~3,200-entry
 *  context index and the thread summaries, neither of which this app reads.
 *  ~15 KB gzipped against ~180 KB for the full payload. */
const FEED_LITE_URL = `${API_BASE}/api/feed-lite.json`;

/** Full payload. Kept as a fallback so an app build can never be stranded by
 *  deploy ordering: if `feed-lite.json` isn't live yet (or a CDN edge hasn't
 *  picked it up), the app quietly reads the endpoint it always read. Remove
 *  the fallback once the lite endpoint has been deployed for a full release
 *  cycle. */
const FEED_FULL_URL = `${API_BASE}/api/feed.json`;

const FEED_TIMEOUT_MS = 10_000;

/** Durable offline copy. Survives the TanStack persister's `maxAge` eviction,
 *  so a launch after days offline still has yesterday's news to show instead
 *  of an error screen. Written by every successful fetch — foreground or
 *  background — so it is always the freshest feed the device has seen. */
export const feedCache = createJsonCache<FeedResponse>('zuhd-feed.json', isFeedResponse);

/**
 * Fetch the feed, preferring the lite endpoint. A 404/malformed lite response
 * falls back to the full one; a genuine network failure propagates from the
 * fallback so callers still see a real error.
 *
 * Every success is written through to `feedCache` before returning.
 */
export async function fetchFeed(opts: FetchJsonOptions = {}): Promise<FeedResponse> {
  const options = { timeoutMs: FEED_TIMEOUT_MS, ...opts };
  let feed: FeedResponse;
  try {
    feed = await fetchJson(FEED_LITE_URL, isFeedResponse, options);
  } catch (err) {
    // Don't retry the fallback when the caller aborted — that's a cancelled
    // query, not a missing endpoint, and a second request would outlive it.
    if (options.signal?.aborted) throw err;
    feed = await fetchJson(FEED_FULL_URL, isFeedResponse, options);
  }
  await feedCache.write(feed);
  return feed;
}
