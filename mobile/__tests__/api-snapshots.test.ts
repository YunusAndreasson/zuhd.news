const mockKv = new Map<string, string>();
const mockSetItemSync = jest.fn((k: string, v: string) => mockKv.set(k, v));
jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: {
    getItemSync: (k: string) => mockKv.get(k) ?? null,
    setItemSync: (k: string, v: string) => mockSetItemSync(k, v),
    removeItemSync: (k: string) => mockKv.delete(k),
  },
}));
jest.mock('../lib/fetch', () => ({ fetchWithTimeout: jest.fn() }));
// The payload's shape is not what this is about.
jest.mock('../lib/validate', () => {
  const any = () => true;
  return {
    isAnalysisSnapshot: any,
    isChokepointSnapshot: any,
    isConflictSnapshot: any,
    isFamineSnapshot: any,
    isGdacsSnapshot: any,
    isGenocideSnapshot: any,
    isHeatmapResponse: any,
    isStringMap: jest.requireActual('../lib/validate').isStringMap,
    isThermalSnapshot: any,
    isTrendsSnapshot: any,
  };
});

import {
  API_SNAPSHOTS,
  COMPANIES_SNAPSHOT,
  clearSnapshotEtags,
  fetchAllSnapshots,
  fetchSnapshotIfChanged,
} from '../lib/api-snapshots';
import { fetchWithTimeout } from '../lib/fetch';

const mockFetch = jest.mocked(fetchWithTimeout);
const TRENDS = API_SNAPSHOTS.trends.url;

function respond(status: number, body?: unknown, etag?: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h: string) => (h.toLowerCase() === 'etag' ? (etag ?? null) : null) },
    text: () => Promise.resolve(JSON.stringify(body ?? {})),
  } as unknown as Response;
}

const sentTag = (url: string) => {
  const call = mockFetch.mock.calls.find(([u]) => u === url);
  const headers = call?.[2]?.headers as Record<string, string> | undefined;
  return headers?.['If-None-Match'];
};

beforeEach(() => {
  mockFetch.mockReset();
  clearSnapshotEtags();
});

it('asks before downloading a layer the app already holds, and keeps it on a 304', async () => {
  // Every other layer fails here, which leaves it out — the screen keeps it.
  mockFetch.mockImplementation(async (url) =>
    url === TRENDS ? respond(200, { ok: 1 }, 'W/"v1"') : respond(500),
  );
  const first = await fetchAllSnapshots(() => true);
  expect(first.map((s) => s.data)).toEqual([{ ok: 1 }]);
  expect(sentTag(TRENDS)).toBeUndefined();

  mockFetch.mockReset();
  mockFetch.mockImplementation(async (url) => (url === TRENDS ? respond(304) : respond(500)));
  const second = await fetchAllSnapshots(() => true);
  // The tag it was given, and nothing to apply: unchanged costs no body.
  expect(sentTag(TRENDS)).toBe('W/"v1"');
  expect(second).toEqual([]);
});

it('never sends a tag for a layer the app does not hold: a 304 would leave it empty', async () => {
  mockFetch.mockImplementation(async (url) =>
    url === TRENDS ? respond(200, { ok: 1 }, 'W/"v1"') : respond(500),
  );
  await fetchAllSnapshots(() => true);
  mockFetch.mockClear();
  await fetchAllSnapshots(() => false);
  expect(sentTag(TRENDS)).toBeUndefined();
});

it('writes the tags once for an arrival, however many layers it changed', async () => {
  // Synchronous, and just before the commit that shows the arrival.
  let n = 0;
  mockFetch.mockImplementation(async () => respond(200, { ok: 1 }, `W/"v${++n}"`));
  mockSetItemSync.mockClear();
  const changed = await fetchAllSnapshots(() => true);
  expect(changed.length).toBeGreaterThan(1);
  expect(mockSetItemSync).toHaveBeenCalledTimes(1);
  // Nothing new, nothing written.
  mockSetItemSync.mockClear();
  mockFetch.mockImplementation(async () => respond(304));
  await fetchAllSnapshots(() => true);
  expect(mockSetItemSync).not.toHaveBeenCalled();
});

describe('the company list, fetched when the menu asks', () => {
  const COMPANIES = COMPANIES_SNAPSHOT.url;
  const payload = { generated: '2026-10-03T05:00:00.000Z', companies: [] };

  it('is no part of an arrival', async () => {
    // ~9KB gzipped, changing at every market close, read only in the menu.
    mockFetch.mockImplementation(async () => respond(200, { ok: 1 }, 'W/"v1"'));
    await fetchAllSnapshots(() => true);
    expect(mockFetch.mock.calls.some(([url]) => url === COMPANIES)).toBe(false);
    expect(Object.values(API_SNAPSHOTS).some((s) => s.url === COMPANIES)).toBe(false);
  });

  it('downloads once, then asks with the tag and keeps the copy it holds on a 304', async () => {
    mockFetch.mockResolvedValueOnce(respond(200, payload, 'W/"c1"'));
    const first = await fetchSnapshotIfChanged(COMPANIES_SNAPSHOT, undefined);
    expect(first).toEqual(payload);
    expect(sentTag(COMPANIES)).toBeUndefined();

    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(respond(304));
    const second = await fetchSnapshotIfChanged(COMPANIES_SNAPSHOT, first);
    expect(sentTag(COMPANIES)).toBe('W/"c1"');
    // The same object: nothing that reads it re-renders.
    expect(second).toBe(first);
  });

  it('takes the new file when a market has closed since', async () => {
    mockFetch.mockResolvedValueOnce(respond(200, payload, 'W/"c1"'));
    const first = await fetchSnapshotIfChanged(COMPANIES_SNAPSHOT, undefined);
    const next = { ...payload, generated: '2026-10-03T22:00:00.000Z' };
    mockFetch.mockResolvedValueOnce(respond(200, next, 'W/"c2"'));
    expect(await fetchSnapshotIfChanged(COMPANIES_SNAPSHOT, first)).toEqual(next);
  });

  it('sends no tag with nothing held, and fails on a 304 it could not have asked for', async () => {
    mockFetch.mockResolvedValueOnce(respond(200, payload, 'W/"c1"'));
    await fetchSnapshotIfChanged(COMPANIES_SNAPSHOT, undefined);
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(respond(304));
    await expect(fetchSnapshotIfChanged(COMPANIES_SNAPSHOT, undefined)).rejects.toThrow(/304/);
    expect(sentTag(COMPANIES)).toBeUndefined();
  });

  it('fails when the site publishes no such file, so the menu shows no list', async () => {
    mockFetch.mockResolvedValueOnce(respond(404));
    await expect(fetchSnapshotIfChanged(COMPANIES_SNAPSHOT, undefined)).rejects.toThrow(/404/);
  });
});
