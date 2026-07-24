jest.mock('../lib/fetch', () => ({
  fetchWithTimeout: jest.fn(),
}));

import { fetchWithTimeout } from '../lib/fetch';
import { fetchJson } from '../lib/fetchJson';

const mockFetch = fetchWithTimeout as jest.MockedFunction<typeof fetchWithTimeout>;

interface Thing {
  ok: true;
  value: number;
}
const isThing = (raw: unknown): raw is Thing =>
  typeof raw === 'object' && raw !== null && (raw as Thing).ok === true;

function mockResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('fetchJson', () => {
  it('returns validated payload on 2xx', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true, value: 42 }));
    const result = await fetchJson('https://example.test/api', isThing);
    expect(result).toEqual({ ok: true, value: 42 });
  });

  it('throws on non-2xx HTTP status', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, 503));
    await expect(fetchJson('https://example.test/api', isThing)).rejects.toThrow(/HTTP 503/);
  });

  it('throws when validator rejects the payload', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: false }));
    await expect(fetchJson('https://example.test/api', isThing)).rejects.toThrow(/Malformed/);
  });

  it('propagates AbortError from underlying fetch', async () => {
    mockFetch.mockRejectedValueOnce(
      Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }),
    );
    await expect(fetchJson('https://example.test/api', isThing)).rejects.toThrow(/aborted/);
  });

  it('passes through timeout and cache options to fetchWithTimeout', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true, value: 1 }));
    await fetchJson('https://example.test/api', isThing, {
      timeoutMs: 7777,
      cache: 'no-store',
    });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.test/api',
      7777,
      expect.objectContaining({ cache: 'no-store' }),
    );
  });
});
