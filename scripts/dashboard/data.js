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
