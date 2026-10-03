import { isMarketSignalsSnapshot } from '@shared/market-signals';
import type { QueryKey } from '@tanstack/react-query';
import Storage from 'expo-sqlite/kv-store';
import { API_BASE } from '../constants/theme';
import { isCompaniesSnapshot } from './companies';
import { fetchJsonIfChanged } from './fetchJson';
import { isMarketsSnapshot } from './markets';
import { readStoredJson } from './stored-json';
import {
  isAnalysisSnapshot,
  isChokepointSnapshot,
  isConflictSnapshot,
  isFamineSnapshot,
  isGdacsSnapshot,
  isGenocideSnapshot,
  isHeatmapResponse,
  isStringMap,
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
 * Share prices of the largest companies, for the menu's list — and so not in
 * `API_SNAPSHOTS`.
 *
 * Everything in that list is drawn on the map screen, and arrives with every
 * build and with the hourly background task. This file is read in the menu,
 * which is opened a few times a week, and it changes each time a stock market
 * closes: about 9KB gzipped, four times a trading day. In the arrival it would
 * have added roughly a tenth to what the app downloads in a day, for every
 * reader, including the ones who never open the list. It is fetched when the
 * menu opens instead (`useCompanies`), with the tag of the copy the app holds,
 * so reopening the menu between two closes costs a 304.
 */
export const COMPANIES_SNAPSHOT = snapshot('/api/companies.json', isCompaniesSnapshot);

/**
 * Each file's version tag (`ETag`), as of the copy the app last took. Kept on
 * disk so a headless background run can ask too. A tag is only sent when the
 * caller still holds that file's data (`has`): a 304 with nothing to keep
 * would leave the layer empty.
 */
const ETAGS_KEY = 'zuhd_snapshot_etags_v1';
let etags: Record<string, string> = readStoredJson(ETAGS_KEY, isStringMap) ?? {};

/** Note each file's new tag, and write the map once: an arrival that changed
 *  eleven files rewrote it eleven times, synchronously, just before the
 *  commit that shows them. */
function rememberEtags(tags: readonly (readonly [url: string, etag: string | null])[]): void {
  let next = etags;
  for (const [url, etag] of tags) {
    if (etag && next[url] !== etag) next = { ...next, [url]: etag };
  }
  if (next === etags) return;
  etags = next;
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
  rememberEtags([[snap.url, result.etag]]);
  return result.data;
}

/**
 * One snapshot, asked for with the tag of the copy the caller holds (`held`):
 * a file that has not changed answers 304 and `held` comes back as it was,
 * the same object, so nothing that reads it re-renders. With nothing held it
 * is a plain fetch. For a snapshot outside the arrival (`COMPANIES_SNAPSHOT`).
 */
export async function fetchSnapshotIfChanged<T>(
  snap: ApiSnapshot<T>,
  held: T | undefined,
  opts: { signal?: AbortSignal } = {},
): Promise<T> {
  const result = await fetchJsonIfChanged<T>(snap.url, snap.validate, {
    ...opts,
    cache: 'no-store',
    etag: held === undefined ? null : etags[snap.url],
    ...(snap.timeoutMs ? { timeoutMs: snap.timeoutMs } : {}),
  });
  if (!result.changed) {
    if (held === undefined) throw new Error(`Unexpected 304 from ${snap.url}`);
    return held;
  }
  rememberEtags([[snap.url, result.etag]]);
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
  const tags: [string, string | null][] = [];
  settled.forEach((result, i) => {
    const snap = all[i];
    if (!snap || result.status !== 'fulfilled' || !result.value.changed) return;
    tags.push([snap.url, result.value.etag]);
    out.push({ queryKey: snap.queryKey, data: result.value.data });
  });
  rememberEtags(tags);
  return out;
}
