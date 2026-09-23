import { isMarketSignalsSnapshot } from '@shared/market-signals';
import type { QueryKey } from '@tanstack/react-query';
import { API_BASE } from '../constants/theme';
import { fetchJson } from './fetchJson';
import { isMarketsSnapshot } from './markets';
import {
  isAnalysisSnapshot,
  isChokepointSnapshot,
  isConflictSnapshot,
  isFamineSnapshot,
  isGdacsSnapshot,
  isGenocideSnapshot,
  isHeatmapResponse,
  isThermalSnapshot,
  isTrendsSnapshot,
} from './validate';

/**
 * Every build output the map screen reads beside the feed, in one list.
 *
 * A return to the app used to fetch these one at a time: the feed's probe
 * invalidated them, and each re-rendered the screen as it landed — the strip,
 * the marks and the odds shuffling for seconds after the stories had already
 * moved. An arrival (`fetchArrival`, `useArticles`) now fetches all of them
 * and applies them in one commit, and the background task fetches the same
 * list so a return can find them already on the device. The hooks read their
 * entry from here, so the list and what the screen reads cannot drift.
 */

/** The prefix every `useApiJson` query shares, so one invalidation reaches
 *  all of them. */
export const API_JSON_QUERY_KEY = ['fetch-json'] as const;

export interface ApiSnapshot<T> {
  queryKey: QueryKey;
  url: string;
  validate: (raw: unknown) => raw is T;
  timeoutMs?: number;
}

function snapshot<T>(path: `/api/${string}`, validate: (raw: unknown) => raw is T): ApiSnapshot<T> {
  const url = `${API_BASE}${path}`;
  return { queryKey: [...API_JSON_QUERY_KEY, url], url, validate };
}

export const API_SNAPSHOTS = {
  trends: snapshot('/api/trends.json', isTrendsSnapshot),
  analysis: snapshot('/api/analysis.json', isAnalysisSnapshot),
  chokepoints: snapshot('/api/chokepoints.json', isChokepointSnapshot),
  markets: snapshot('/api/markets.json', isMarketsSnapshot),
  marketSignals: snapshot('/api/market-signals.json', isMarketSignalsSnapshot),
  gdacs: snapshot('/api/gdacs.json', isGdacsSnapshot),
  conflict: snapshot('/api/conflict.json', isConflictSnapshot),
  famine: snapshot('/api/ipc.json', isFamineSnapshot),
  thermal: snapshot('/api/firms.json', isThermalSnapshot),
  genocide: snapshot('/api/genocide.json', isGenocideSnapshot),
  // Its own key, not the prefix: `useHeatmap` refetches it when the feed's
  // `generated` moves, and an arrival that carries it keeps that refetch from
  // landing as a commit of its own.
  heatmap: {
    queryKey: ['heatmap'],
    url: `${API_BASE}/api/heatmap.json`,
    validate: isHeatmapResponse,
    timeoutMs: 8000,
  },
} as const;

export function fetchSnapshot<T>(
  snap: ApiSnapshot<T>,
  opts: { signal?: AbortSignal; cache?: RequestCache } = {},
): Promise<T> {
  return fetchJson<T>(snap.url, snap.validate, {
    ...opts,
    ...(snap.timeoutMs ? { timeoutMs: snap.timeoutMs } : {}),
  });
}

export interface FetchedSnapshot {
  queryKey: QueryKey;
  data: unknown;
}

/**
 * Every snapshot, fetched side by side. One that fails is left out, so the
 * screen keeps what it had for it — as a failed refetch always did.
 */
export async function fetchAllSnapshots(): Promise<FetchedSnapshot[]> {
  const all: ApiSnapshot<unknown>[] = Object.values(API_SNAPSHOTS);
  const settled = await Promise.allSettled(
    all.map((snap) => fetchSnapshot(snap, { cache: 'no-store' })),
  );
  const out: FetchedSnapshot[] = [];
  settled.forEach((result, i) => {
    const snap = all[i];
    if (snap && result.status === 'fulfilled') {
      out.push({ queryKey: snap.queryKey, data: result.value });
    }
  });
  return out;
}
