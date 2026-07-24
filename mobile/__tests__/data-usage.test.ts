jest.mock('../lib/fetch', () => ({
  fetchWithTimeout: jest.fn(),
}));

import { fetchWithTimeout } from '../lib/fetch';
import {
  formatBytes,
  getSnapshot,
  recordBytes,
  resetDataUsage,
  subscribe,
  utf8ByteLength,
} from '../lib/data-usage';
import { fetchJson } from '../lib/fetchJson';

const mockFetch = fetchWithTimeout as jest.MockedFunction<typeof fetchWithTimeout>;
const isAnything = (_raw: unknown): _raw is unknown => true;

function res(body: string) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(JSON.parse(body)),
    text: () => Promise.resolve(body),
  } as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
  resetDataUsage();
});

describe('utf8ByteLength', () => {
  it('counts ASCII as one byte each', () => {
    expect(utf8ByteLength('abc')).toBe(3);
  });

  // The feed carries Cyrillic, Arabic and CJK headlines; String.length would
  // undercount every one of them and flatter the data figure.
  it('counts multi-byte code points correctly', () => {
    expect(utf8ByteLength('é')).toBe(2);
    expect(utf8ByteLength('Українська')).toBe(20);
    expect(utf8ByteLength('日')).toBe(3);
    expect(utf8ByteLength('🇺🇦')).toBe(8); // two regional-indicator surrogate pairs
  });

  it('matches Buffer for a mixed string', () => {
    const s = 'Spain Declares Fire Emergency — Мали, 日本, 🇸🇪';
    expect(utf8ByteLength(s)).toBe(Buffer.byteLength(s, 'utf8'));
  });
});

describe('formatBytes', () => {
  it('scales without false precision', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(842)).toBe('842 B');
    expect(formatBytes(15_360)).toBe('15 KB');
    expect(formatBytes(3_160_941)).toBe('3.0 MB');
  });
});

describe('the meter', () => {
  it('accumulates across fetches and notifies subscribers', async () => {
    const seen: number[] = [];
    const unsubscribe = subscribe(() => seen.push(getSnapshot()));

    mockFetch.mockResolvedValueOnce(res('{"a":1}')); // 7 bytes
    await fetchJson('https://example.test/one', isAnything);
    mockFetch.mockResolvedValueOnce(res('{"bb":22}')); // 9 bytes
    await fetchJson('https://example.test/two', isAnything);

    expect(getSnapshot()).toBe(16);
    expect(seen).toEqual([7, 16]);
    unsubscribe();
  });

  it('ignores non-positive and non-finite amounts', () => {
    recordBytes(0);
    recordBytes(-5);
    recordBytes(Number.NaN);
    expect(getSnapshot()).toBe(0);
  });

  it('counts nothing when the request fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('offline'));
    await expect(fetchJson('https://example.test/x', isAnything)).rejects.toThrow();
    expect(getSnapshot()).toBe(0);
  });
});
