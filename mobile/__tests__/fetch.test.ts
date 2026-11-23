import { fetchWithTimeout } from '../lib/fetch';

const realFetch = globalThis.fetch;
const mockFetch = jest.fn();

beforeEach(() => {
  jest.useFakeTimers();
  mockFetch.mockReset();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
  globalThis.fetch = realFetch;
});

/** A response whose headers arrived and whose body never finishes unless the
 *  request's signal aborts it, as Expo's fetch behaves on a stalled download. */
function stalledBody(signal: AbortSignal) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    text: () =>
      new Promise<string>((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('Aborted')));
      }),
  };
}

describe('fetchWithTimeout', () => {
  // Expo's fetch resolves at the headers. A deadline cleared there left a body
  // that stalled mid-download pending for good, and every later refresh joined it.
  it('keeps the deadline over a body that stalls after the headers', async () => {
    mockFetch.mockImplementation((_url: string, init: RequestInit) =>
      Promise.resolve(stalledBody(init.signal as AbortSignal)),
    );
    const pending = fetchWithTimeout('https://example.test/a', 1000);
    const settled = expect(pending).rejects.toThrow(/Aborted/);
    await jest.advanceTimersByTimeAsync(1000);
    await settled;
  });

  it("aborts a stalled body when the caller's signal aborts", async () => {
    mockFetch.mockImplementation((_url: string, init: RequestInit) =>
      Promise.resolve(stalledBody(init.signal as AbortSignal)),
    );
    const controller = new AbortController();
    const pending = fetchWithTimeout('https://example.test/a', 60_000, {
      signal: controller.signal,
    });
    const settled = expect(pending).rejects.toThrow(/Aborted/);
    await Promise.resolve();
    controller.abort();
    await settled;
  });

  it('returns the body it read', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ etag: '"x"' }),
      text: () => Promise.resolve('{"a":1}'),
    });
    const res = await fetchWithTimeout('https://example.test/a', 1000);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"a":1}');
    expect(res.headers?.get('etag')).toBe('"x"');
  });

  // Expo's fetch ignores `cache`, and iOS serves a layer from the phone's URL
  // cache while its max-age holds.
  it.each<{ headers: HeadersInit }>([
    { headers: { 'If-None-Match': '"x"' } },
    { headers: [['If-None-Match', '"x"']] },
    { headers: new Headers({ 'If-None-Match': '"x"', 'cache-control': 'max-age=60' }) },
  ])('preserves request headers when bypassing the cache', async ({ headers }) => {
    mockFetch.mockResolvedValue({ ok: false, status: 304 });
    await fetchWithTimeout('https://example.test/a', 1000, { cache: 'no-store', headers });
    const sent = mockFetch.mock.calls[0]?.[1].headers as Headers;
    expect(sent.get('If-None-Match')).toBe('"x"');
    expect(sent.get('Cache-Control')).toBe('no-cache');
  });
});
