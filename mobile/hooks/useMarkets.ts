import type { MarketExchange, MarketsSnapshot } from '@shared/types';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { API_BASE } from '../constants/theme';
import { fetchJson } from '../lib/fetchJson';
import { isMarketsSnapshot } from '../lib/validate';

const EMPTY_EXCHANGES: MarketExchange[] = [];

/** Mobile-shaped markets: the same 30 exchanges as `/api/markets.json` minus
 *  `series`, `blurb` and `relatedArticles` — about 72 KB of the full payload's
 *  79 KB, and every decoded byte is charged to the meter behind the app's
 *  central data claim (`lib/data-usage.ts`). The globe needs a coordinate and
 *  a direction; a quarter of daily closes is a chart the app does not draw. */
const MARKETS_LITE_URL = `${API_BASE}/api/markets-lite.json`;

/** Full payload. Kept as a fallback for the same reason `feed-source.ts` keeps
 *  one: the app ships on its own schedule and the lite endpoint arrives with a
 *  pipeline deploy, so a build must never be stranded by deploy ordering. Both
 *  shapes pass one validator — the omitted fields are optional. Remove once
 *  lite has been live for a full release cycle. */
const MARKETS_FULL_URL = `${API_BASE}/api/markets.json`;

async function fetchMarkets(signal: AbortSignal): Promise<MarketsSnapshot> {
  try {
    return await fetchJson(MARKETS_LITE_URL, isMarketsSnapshot, { signal });
  } catch (err) {
    // An abort is a cancelled query, not a missing endpoint; retrying would
    // outlive the thing that cancelled it.
    if (signal.aborted) throw err;
    return await fetchJson(MARKETS_FULL_URL, isMarketsSnapshot, { signal });
  }
}

/**
 * The world's stock exchanges, for the globe's market marks.
 *
 * Which exchanges is an editorial claim, made upstream in
 * `scripts/lib/market-metadata.js`: Riyadh, Istanbul, Dubai, Kuala Lumpur and
 * Jakarta are first-class rather than an appendix, because a markets layer
 * that ships New York, London, Frankfurt and Tokyo and stops is a Western
 * markets map. Where the free data commons does not reach — Doha, Karachi,
 * Dhaka, Casablanca, Cairo, Lagos and seven more — the catalog keeps the entry
 * with a reason instead of dropping it, so the gap stays a known gap.
 *
 * Cache-first, refreshed on resume. Graceful degrade: any failure leaves the
 * layer empty, which is the honest reading — a quote we could not fetch is not
 * a market that did not move.
 */
export function useMarkets(): { exchanges: MarketExchange[]; ready: boolean } {
  const query = useQuery<MarketsSnapshot, Error>({
    queryKey: ['markets'],
    queryFn: ({ signal }) => fetchMarkets(signal),
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  return useMemo(
    () => ({ exchanges: query.data?.exchanges ?? EMPTY_EXCHANGES, ready: query.isFetched }),
    [query.data, query.isFetched],
  );
}
