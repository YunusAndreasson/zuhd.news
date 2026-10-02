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
    isThermalSnapshot: any,
    isTrendsSnapshot: any,
  };
});

import { API_SNAPSHOTS, clearSnapshotEtags, fetchAllSnapshots } from '../lib/api-snapshots';
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
