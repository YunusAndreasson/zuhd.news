import { isMarketSignalsSnapshot } from '@shared/market-signals';
import type { QueryKey } from '@tanstack/react-query';
import Storage from 'expo-sqlite/kv-store';
import { API_BASE } from '../constants/theme';
import { fetchJsonIfChanged } from './fetchJson';
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

/**
 * Each file's version tag (`ETag`), as of the copy the app last took. Kept on
 * disk so a headless background run can ask too. A tag is only sent when the
 * caller still holds that file's data (`has`): a 304 with nothing to keep
 * would leave the layer empty.
 */
const ETAGS_KEY = 'zuhd_snapshot_etags_v1';
let etags: Record<string, string> = {};
try {
  const stored = Storage.getItemSync(ETAGS_KEY);
  if (stored) {
    const parsed: unknown = JSON.parse(stored);
    if (parsed && typeof parsed === 'object') etags = parsed as Record<string, string>;
  }
} catch {
  etags = {};
}

function rememberEtag(url: string, etag: string | null): void {
  if (!etag || etags[url] === etag) return;
  etags = { ...etags, [url]: etag };
  try {
    Storage.setItemSync(ETAGS_KEY, JSON.stringify(etags));
  } catch {}
}

/** Forget every tag: the privacy page's erase, and a test's reset. */
export function clearSnapshotEtags(): void {
  etags = {};
  try {
    Storage.removeItemSync(ETAGS_KEY);
  } catch {}
}

/** A plain fetch of one snapshot — a query's own load — noting its tag. */
export async function fetchSnapshot<T>(
  snap: ApiSnapshot<T>,
  opts: { signal?: AbortSignal; cache?: RequestCache } = {},
): Promise<T> {
  const result = await fetchJsonIfChanged<T>(snap.url, snap.validate, {
    ...opts,
    ...(snap.timeoutMs ? { timeoutMs: snap.timeoutMs } : {}),
  });
  // Without a tag sent the site cannot answer 304.
  if (!result.changed) throw new Error(`Unexpected 304 from ${snap.url}`);
  rememberEtag(snap.url, result.etag);
  return result.data;
}

export interface FetchedSnapshot {
  queryKey: QueryKey;
  data: unknown;
}

/**
 * Every snapshot that changed since the copy the app holds, fetched side by
 * side. Unchanged ones answer 304 with no body and are left out, as are ones
 * that fail — either way the screen keeps what it had.
 *
 * Every build used to download all twelve, ~120KB gzipped, whether they had
 * moved or not, and the background task did it hourly for someone who might
 * not open the app all day.
 */
export async function fetchAllSnapshots(
  has: (queryKey: QueryKey) => boolean,
): Promise<FetchedSnapshot[]> {
  const all: ApiSnapshot<unknown>[] = Object.values(API_SNAPSHOTS);
  const settled = await Promise.allSettled(
    all.map((snap) =>
      fetchJsonIfChanged(snap.url, snap.validate, {
        cache: 'no-store',
        etag: has(snap.queryKey) ? etags[snap.url] : null,
        ...(snap.timeoutMs ? { timeoutMs: snap.timeoutMs } : {}),
      }),
    ),
  );
  const out: FetchedSnapshot[] = [];
  settled.forEach((result, i) => {
    const snap = all[i];
    if (!snap || result.status !== 'fulfilled' || !result.value.changed) return;
    rememberEtag(snap.url, result.value.etag);
    out.push({ queryKey: snap.queryKey, data: result.value.data });
  });
  return out;
}
