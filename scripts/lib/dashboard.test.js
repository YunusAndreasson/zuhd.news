// Run: node --test scripts/lib/dashboard.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SENT, listener } from '../dashboard/data.js'

// ── The listener ─────────────────────────────────────────────────────

/** A response that keeps what it was sent. */
function response() {
  return {
    headersSent: false,
    status: /** @type {number | null} */ (null),
    body: /** @type {string | null} */ (null),
    ended: false,
    /** @param {number} status */
    writeHead(status) {
      this.status = status
      this.headersSent = true
    },
    /** @param {string} [body] */
    end(body) {
      this.body = body ?? null
      this.ended = true
    },
  }
}

/** @param {(req: any, res: any) => void} listen @param {string} url */
function get(listen, url) {
  const res = response()
  listen({ url }, res)
  return { status: res.status, body: res.body && JSON.parse(res.body), res }
}

test('a route answers with what it returns: JSON, a 404 for nothing, its pattern groups decoded', () => {
  const listen = listener([
    ['/api/overview', () => ({ ok: true })],
    ['/api/nothing', () => null],
    [/^\/api\/cycle\/(.+)$/, (_req, _res, name) => ({ name })],
  ])
  const overview = get(listen, '/api/overview?x=1')
  assert.deepEqual([overview.status, overview.body], [200, { ok: true }])
  assert.equal(get(listen, '/api/nothing').status, 404)
  assert.equal(get(listen, '/api/unknown').status, 404)
  assert.deepEqual(get(listen, '/api/cycle/cycle-2026-10-09_0501.log').body, { name: 'cycle-2026-10-09_0501.log' })
  assert.deepEqual(get(listen, '/api/cycle/a%20b').body, { name: 'a b' })
})

// The server went down on any of these, and systemd brought it back five
// seconds later for the page's next poll to take it down again.
test('a route that throws answers 500 with the message, and the next request is served', (t) => {
  const said = t.mock.method(console, 'error', () => {})
  const listen = listener([
    ['/api/experiment', () => JSON.parse('{ "activeExperiments": [], }')],
    ['/api/overview', () => ({ ok: true })],
  ])
  const failed = get(listen, '/api/experiment')
  assert.equal(failed.status, 500)
  assert.match(failed.body.error, /JSON/)
  assert.equal(said.mock.calls.length, 1, 'and the journal has the stack')
  assert.match(String(said.mock.calls[0].arguments[0]), /\/api\/experiment/)
  assert.equal(get(listen, '/api/overview').status, 200)
})

test('a URL that is not one, or an escape that decodes to nothing, is a 400', () => {
  const listen = listener([[/^\/api\/cycle\/(.+)$/, (_req, _res, name) => ({ name })]])
  assert.equal(get(listen, '/api/cycle/%').status, 400)
  assert.equal(get(listen, '//').status, 400)
})

test('a route that wrote its own response is left alone, also when it fails half way', (t) => {
  t.mock.method(console, 'error', () => {})
  const listen = listener([
    ['/', (_req, res) => {
      res.writeHead(200)
      res.end('<html>')
      return SENT
    }],
    ['/api/live', (_req, res) => {
      res.writeHead(200)
      throw new Error('the log went away')
    }],
  ])
  const page = response()
  listen(/** @type {any} */ ({ url: '/' }), /** @type {any} */ (page))
  assert.deepEqual([page.status, page.body], [200, '<html>'])

  const stream = response()
  listen(/** @type {any} */ ({ url: '/api/live' }), /** @type {any} */ (stream))
  assert.deepEqual([stream.status, stream.ended, stream.body], [200, true, null], 'ended, with no second head')
})
