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
  it("sends 'no-store' as a no-cache request header", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 304, text: () => Promise.resolve('') });
    await fetchWithTimeout('https://example.test/a', 1000, {
      cache: 'no-store',
      headers: { 'If-None-Match': '"x"' },
    });
    expect(mockFetch.mock.calls[0]?.[1].headers).toEqual({
      'If-None-Match': '"x"',
      'Cache-Control': 'no-cache',
    });
  });
});
