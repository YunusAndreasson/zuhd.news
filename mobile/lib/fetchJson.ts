import { recordBytes, utf8ByteLength } from './data-usage';
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
  // Read as text rather than `res.json()` so the payload can be weighed on the
  // way past. This is the only place every content download passes through,
  // which makes it the only honest place to count from — see `data-usage.ts`.
  const text = await res.text();
  recordBytes(utf8ByteLength(text));
  const raw: unknown = JSON.parse(text);
  if (!validator(raw)) throw new Error(`Malformed response from ${url}`);
  return raw;
}

export type Conditional<T> = { changed: false } | { changed: true; data: T; etag: string | null };

/**
 * `fetchJson`, asking first whether the file changed since the version the
 * caller holds (`etag`). The site answers an unchanged file with a 304 and no
 * body, so a map layer that did not move between builds costs nothing — the
 * conflict layer alone is 30KB gzipped and 222KB to parse, and changes about
 * monthly. Without an `etag` it is a plain fetch that reports the file's tag.
 */
export async function fetchJsonIfChanged<T>(
  url: string,
  validator: (raw: unknown) => raw is T,
  opts: FetchJsonOptions & { etag?: string | null } = {},
): Promise<Conditional<T>> {
  const res = await fetchWithTimeout(url, opts.timeoutMs ?? 5000, {
    signal: opts.signal,
    cache: opts.cache,
    headers: opts.etag ? { 'If-None-Match': opts.etag } : undefined,
  });
  if (res.status === 304) return { changed: false };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  recordBytes(utf8ByteLength(text));
  const raw: unknown = JSON.parse(text);
  if (!validator(raw)) throw new Error(`Malformed response from ${url}`);
  return { changed: true, data: raw, etag: res.headers?.get?.('etag') ?? null };
}
