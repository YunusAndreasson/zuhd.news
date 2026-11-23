/** A response whose body has already arrived inside the deadline. */
type TimedResponse = Pick<Response, 'ok' | 'status' | 'headers' | 'text'>;

/**
 * `fetch` with one deadline over the headers and the body both. Expo's fetch
 * resolves at the headers, so a deadline cleared there let a body that stalled
 * mid-download hang its caller until the app restarted. The body of a 2xx is
 * read before this returns; any other status comes back without its body.
 *
 * `cache: 'no-store'` is sent as a `Cache-Control: no-cache` request header,
 * since Expo's fetch ignores the `cache` option and iOS answers from the
 * phone's URL cache while a response's `max-age` holds.
 */
export async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init?: RequestInit,
): Promise<TimedResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const external = init?.signal;
  const onExternalAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', onExternalAbort);
  }
  try {
    let headers = init?.headers;
    if (init?.cache === 'no-store') {
      const normalized = new Headers(headers);
      normalized.set('Cache-Control', 'no-cache');
      headers = normalized;
    }
    const res = await fetch(url, { ...init, headers, signal: controller.signal });
    const body = res.ok ? await res.text() : '';
    return {
      ok: res.ok,
      status: res.status,
      headers: res.headers,
      text: () => Promise.resolve(body),
    };
  } finally {
    clearTimeout(timeout);
    external?.removeEventListener('abort', onExternalAbort);
  }
}
