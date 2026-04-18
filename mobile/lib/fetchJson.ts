import { fetchWithTimeout } from './fetch';

export interface FetchJsonOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  cache?: RequestCache;
}

/**
 * Fetch JSON from `url`, verify HTTP 2xx, and narrow the payload with a
 * runtime `validator` before returning. Centralizes the contract every
 * remote-data hook relies on — agents reading a call site see "get a
 * validated T or throw", not six lines of fetch plumbing.
 *
 * Throws on network error, non-2xx status, or schema mismatch. Callers that
 * want graceful degradation (e.g. useChokepoints) wrap in try/catch.
 */
export async function fetchJson<T>(
  url: string,
  validator: (raw: unknown) => raw is T,
  opts: FetchJsonOptions = {},
): Promise<T> {
  const res = await fetchWithTimeout(url, opts.timeoutMs ?? 5000, {
    signal: opts.signal,
    cache: opts.cache,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw: unknown = await res.json();
  if (!validator(raw)) throw new Error(`Malformed response from ${url}`);
  return raw;
}
