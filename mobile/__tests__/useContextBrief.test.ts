import { act, renderHook } from '@testing-library/react';

// Deferred promise helper for controlling async timing
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Mock fetchWithTimeout at the top level (avoids isolateModules + dual React)
jest.mock('../lib/fetch', () => ({
  fetchWithTimeout: jest.fn(),
}));

// Must import AFTER jest.mock
import { fetchWithTimeout } from '../lib/fetch';
import { useContextBrief } from '../hooks/useContextBrief';

const mockFetch = fetchWithTimeout as jest.MockedFunction<typeof fetchWithTimeout>;

function mockResponse(data: unknown) {
  return { ok: true, json: () => Promise.resolve(data) } as Response;
}

function makeBrief(id: string) {
  return {
    id,
    label: `Brief ${id}`,
    type: 'thread' as const,
    category: 'politics' as const,
    articleCount: 3,
    generatedAt: '2026-03-27',
    timeline: [{ body: 'Something happened' }],
  };
}

// Use unique threadIds per test to avoid module-level cache interference
let testCounter = 0;
function uniqueId(base: string) {
  return `${base}-${++testCounter}`;
}

describe('useContextBrief', () => {
  beforeEach(() => mockFetch.mockReset());

  it('fetches and returns a brief', async () => {
    const id = uniqueId('fetch');
    const briefData = makeBrief(id);
    mockFetch.mockResolvedValueOnce(mockResponse(briefData));

    const { result } = renderHook(() => useContextBrief());

    await act(async () => {
      result.current.fetchBrief(id);
    });

    expect(result.current.brief).toEqual(briefData);
    expect(result.current.loading).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns cached brief without refetching', async () => {
    const id = uniqueId('cache');
    const briefData = makeBrief(id);
    mockFetch.mockResolvedValueOnce(mockResponse(briefData));

    const { result } = renderHook(() => useContextBrief());

    // First call — fetches
    await act(async () => {
      result.current.fetchBrief(id);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second call — cache hit, no additional fetch
    act(() => {
      result.current.fetchBrief(id);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.current.brief).toEqual(briefData);
    expect(result.current.loading).toBe(false);
  });

  it('clears loading and leaves brief null on network error', async () => {
    const id = uniqueId('error');
    mockFetch.mockRejectedValueOnce(new Error('network'));

    const { result } = renderHook(() => useContextBrief());

    await act(async () => {
      result.current.fetchBrief(id);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.brief).toBeNull();
  });

  it('discards slow response when a newer request was made', async () => {
    const idA = uniqueId('slow');
    const idB = uniqueId('fast');
    const briefB = makeBrief(idB);

    const deferA = deferred<Response>();
    mockFetch
      .mockReturnValueOnce(deferA.promise) // A: slow
      .mockResolvedValueOnce(mockResponse(briefB)); // B: fast

    const { result } = renderHook(() => useContextBrief());

    // Start A
    act(() => {
      result.current.fetchBrief(idA);
    });

    // Start B (completes immediately)
    await act(async () => {
      result.current.fetchBrief(idB);
    });
    expect(result.current.brief).toEqual(briefB);

    // A finally resolves — should be discarded (activeId is now idB)
    await act(async () => {
      deferA.resolve(mockResponse(makeBrief(idA)));
    });
    expect(result.current.brief).toEqual(briefB); // B's result preserved
  });

  it('applies late successful response when the active request failed', async () => {
    const idA = uniqueId('race-a');
    const idB = uniqueId('race-b');
    const briefA = makeBrief(idA);

    const deferA = deferred<Response>();
    const deferB = deferred<Response>();
    mockFetch.mockReturnValueOnce(deferA.promise).mockReturnValueOnce(deferB.promise);

    const { result } = renderHook(() => useContextBrief());

    // Start A
    act(() => {
      result.current.fetchBrief(idA);
    });

    // Start B (overwrites activeId)
    act(() => {
      result.current.fetchBrief(idB);
    });

    // B fails — activeId is cleared, allowing fallback
    await act(async () => {
      deferB.reject(new Error('network'));
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.brief).toBeNull();

    // A succeeds late — since activeId was cleared by B's failure,
    // A's valid data is applied instead of being silently discarded
    await act(async () => {
      deferA.resolve(mockResponse(briefA));
    });

    expect(result.current.brief).toEqual(briefA);
  });
});
