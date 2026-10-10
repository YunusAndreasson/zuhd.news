// One HTTP GET for the fetch stages: a timeout, our user-agent, and a throw on
// a non-2xx status.
//
// Eight copies of `new AbortController()` + `setTimeout(abort)` +
// `clearTimeout` in a `finally`, and the UA string in eight more. The copies
// shared a gap the platform no longer has: each cleared its timer as soon as
// `fetch` resolved — on the *headers* — so a server that sent headers and then
// stalled the body held the stage until its outer `timeout` killed it, and
// took the snapshot write with it. `AbortSignal.timeout` stays attached to the
// body stream, so `res.json()` is bounded too.

/** Identifies us to the sources we poll. Kept as an address they can write to. */
export const ZUHD_UA = 'zuhd-news/1.0 (+https://zuhd.news)'

/**
 * A current desktop Chrome, for fetching *article pages* (never feeds or APIs,
 * which get `ZUHD_UA`): it unblocks about half of the outlets that 401/403 an
 * honest bot UA. Two identical copies, which had to be bumped together.
 */
export const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'

/**
 * `fetch(url)` with a deadline covering headers *and* body, our UA (callers'
 * `headers` win), and `HTTP <status>` thrown for anything but 2xx. A caller's
 * own `signal` is combined with the deadline, not replaced by it.
 *
 * @param {string | URL} url
 * @param {{ timeoutMs?: number, headers?: Record<string, string>, signal?: AbortSignal }} [opts]
 * @returns {Promise<Response>}
 */
export async function fetchOk(url, { timeoutMs = 15_000, headers = {}, signal } = {}) {
  const deadline = AbortSignal.timeout(timeoutMs)
  const res = await fetch(url, {
    signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    headers: { 'user-agent': ZUHD_UA, ...headers },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res
}

/**
 * `fetchOk(url, opts).json()`.
 *
 * @param {string | URL} url
 * @param {Parameters<typeof fetchOk>[1]} [opts]
 * @returns {Promise<any>}
 */
export const fetchJson = async (url, opts) => (await fetchOk(url, opts)).json()

/**
 * `fetchOk(url, opts).text()`.
 *
 * @param {string | URL} url
 * @param {Parameters<typeof fetchOk>[1]} [opts]
 * @returns {Promise<string>}
 */
export const fetchText = async (url, opts) => (await fetchOk(url, opts)).text()
