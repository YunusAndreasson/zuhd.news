import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

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

// Fresh QueryClient per test — isolates the TanStack Query cache between
// runs so prior brief responses don't leak. retry: false so a single mock
// rejection surfaces immediately instead of triggering the default 3 retries.
function createWrapper() {
  const client = new QueryClient({
    // staleTime: Infinity matches the production behavior — cached briefs
    // stay fresh, so a second fetchBrief(sameId) is a cache hit, not a refetch.
    // retry: false so a single mock rejection surfaces immediately instead
    // of triggering the default 3 retries.
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

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

    const { result } = renderHook(() => useContextBrief(), { wrapper: createWrapper() });

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

    const { result } = renderHook(() => useContextBrief(), { wrapper: createWrapper() });

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

    const { result } = renderHook(() => useContextBrief(), { wrapper: createWrapper() });

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

    const { result } = renderHook(() => useContextBrief(), { wrapper: createWrapper() });

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

  it('discards an aborted earlier request even if the active one fails', async () => {
    // The latest fetchBrief always wins. When a new request starts, any
    // in-flight request is aborted — its later result must not leak into
    // the UI, even if the newer request also fails.
    const idA = uniqueId('race-a');
    const idB = uniqueId('race-b');
    const briefA = makeBrief(idA);

    const deferA = deferred<Response>();
    const deferB = deferred<Response>();
    mockFetch.mockReturnValueOnce(deferA.promise).mockReturnValueOnce(deferB.promise);

    const { result } = renderHook(() => useContextBrief(), { wrapper: createWrapper() });

    act(() => {
      result.current.fetchBrief(idA);
    });
    act(() => {
      result.current.fetchBrief(idB);
    });

    await act(async () => {
      deferB.reject(new Error('network'));
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.brief).toBeNull();

    // A was aborted when B started — its result must not be applied.
    await act(async () => {
      deferA.resolve(mockResponse(briefA));
    });
    expect(result.current.brief).toBeNull();
  });
});
