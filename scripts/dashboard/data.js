// What the dashboard does that can be asked without starting it.
//
// `server.js` listens as soon as it is loaded, so nothing in it could be
// tested, and nothing was. The parts with a behaviour of their own live here
// and the server is what wires them to a port.

/** What a route returns when it has written the response itself: a file, an event stream. */
export const SENT = Symbol('sent')

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} data
 */
export function sendJson(res, status, data) {
  const body = JSON.stringify(data)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) })
  res.end(body)
}

/**
 * @typedef {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, ...params: string[]) => unknown} Route
 *   what to send as JSON, nothing for a 404, or `SENT`
 */

/**
 * The request listener over the server's routes: each a path, or a pattern
 * whose groups the route is handed, decoded.
 *
 * It never throws. The listener used to be the routes themselves, one `if`
 * after another, and a throw in any of them was an uncaught exception that
 * took the process down for systemd to restart five seconds later:
 * `content/.experiments.json` with a trailing comma in it (which it has had),
 * a log pruned between the listing and the read, `GET /api/cycle/%`. The page
 * asks for the experiments on load and every thirty seconds, so one bad file
 * was a restart loop. A route that throws now answers 500 with the message,
 * and the next request is served.
 *
 * @param {[string | RegExp, Route][]} routes
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void}
 */
export function listener(routes) {
  return (req, res) => {
    let path = ''
    /** @type {{ route: Route, params: string[] } | null} */
    let found = null
    try {
      path = new URL(req.url ?? '/', 'http://dashboard').pathname
      for (const [pattern, route] of routes) {
        const params = typeof pattern === 'string' ? (pattern === path ? [] : null) : (path.match(pattern)?.slice(1).map(decodeURIComponent) ?? null)
        if (params) {
          found = { route, params }
          break
        }
      }
    } catch {
      // A URL that is not one, or an escape that decodes to nothing.
      return sendJson(res, 400, { error: 'bad request' })
    }
    if (!found) return sendJson(res, 404, { error: 'not found' })

    try {
      const body = found.route(req, res, ...found.params)
      if (body === SENT) return
      if (body == null) sendJson(res, 404, { error: 'not found' })
      else sendJson(res, 200, body)
    } catch (err) {
      const { message, stack } = /** @type {Error} */ (err)
      console.error(`dashboard: ${path} failed: ${stack ?? message}`)
      if (res.headersSent) res.end()
      else sendJson(res, 500, { error: message })
    }
  }
}

// ── systemd ──────────────────────────────────────────────────────────

/** The units the cycle is: the service that runs one, and the timer that starts it. */
export const CYCLE_UNITS = ['zuhd-news-cycle.service', 'zuhd-news-cycle.timer']

/** What `systemdView` reads, as `systemctl show` is asked for it. */
export const SYSTEMD_SHOW = ['show', ...CYCLE_UNITS, '--timestamp=utc', '-p', 'Id,ActiveState,NextElapseUSecRealtime,LastTriggerUSec']

/**
 * `Fri 2026-10-09 14:00:00 UTC`, a moment as `systemctl --timestamp=utc`
 * prints it, to ISO. Anything else is null and not a guess: `n/a` for a timer
 * that never fired, nothing for one with no next run.
 *
 * @param {string | null | undefined} text
 * @returns {string | null}
 */
export function isoFromSystemd(text) {
  const m = String(text ?? '').trim().match(/^\w{3} (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC$/)
  return m ? `${m[1]}T${m[2]}Z` : null
}

/**
 * Whether a cycle is running and when the timer fires next, from what
 * `systemctl show` (`SYSTEMD_SHOW`) printed: a block of `Key=value` lines a
 * unit, a blank line between them.
 *
 * The service is `Type=oneshot`: while a cycle runs it is `activating`, and
 * between cycles `inactive`. It is never `active`. The server used to ask
 * `systemctl is-active`, which exits 3 for both of those; `execSync` threw on
 * the status, the catch answered "inactive, no next run", and the query of
 * the timer on the line after never ran. The page has shown "timer unknown"
 * and a next run worked out from a schedule of its own for as long as that
 * was so.
 *
 * Output that is empty or cut short (`systemctl` missing, timed out, not
 * allowed) reads as nothing known.
 *
 * @param {string | null | undefined} shown
 * @returns {{ serviceActive: boolean, nextFire: string | null, lastTrigger: string | null }}
 */
export function systemdView(shown) {
  /** @type {Record<string, Record<string, string>>} */
  const units = {}
  for (const block of String(shown ?? '').split(/\n\s*\n/)) {
    /** @type {Record<string, string>} */
    const unit = {}
    for (const line of block.split('\n')) {
      const m = line.match(/^(\w+)=(.*)$/)
      if (m) unit[m[1]] = m[2]
    }
    if (unit.Id) units[unit.Id] = unit
  }
  const [service, timer] = CYCLE_UNITS.map((id) => units[id])
  return {
    serviceActive: service?.ActiveState === 'activating' || service?.ActiveState === 'active',
    nextFire: isoFromSystemd(timer?.NextElapseUSecRealtime),
    lastTrigger: isoFromSystemd(timer?.LastTriggerUSec),
  }
}
