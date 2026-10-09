// Run: node --test scripts/lib/dashboard.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CYCLE_UNITS, SENT, SYSTEMD_SHOW, isoFromSystemd, listener, systemdView } from '../dashboard/data.js'

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

// ── systemd ──────────────────────────────────────────────────────────

/** `systemctl show` for the two units, as SYSTEMD_SHOW asks: the service in `state`, the timer with these moments. */
const shown = (state, next = 'Fri 2026-10-09 14:00:00 UTC', last = 'Fri 2026-10-09 10:00:07 UTC') =>
  `Id=zuhd-news-cycle.service\nActiveState=${state}\n\nId=zuhd-news-cycle.timer\nActiveState=active\nNextElapseUSecRealtime=${next}\nLastTriggerUSec=${last}\n`

// The service is a oneshot: `activating` for as long as a cycle runs, never
// `active`. Asked through `systemctl is-active`, which exits 3 for anything
// but `active`, the answer was "inactive, timer unknown" at every hour.
test('between cycles the service is idle and the timer says when the next one starts', () => {
  assert.deepEqual(systemdView(shown('inactive')), { serviceActive: false, nextFire: '2026-10-09T14:00:00Z', lastTrigger: '2026-10-09T10:00:07Z' })
})

test('a cycle that is running is seen as running', () => {
  assert.equal(systemdView(shown('activating')).serviceActive, true)
  assert.equal(systemdView(shown('active')).serviceActive, true)
  for (const state of ['failed', 'deactivating', '']) assert.equal(systemdView(shown(state)).serviceActive, false, state)
})

test('the units are read by name, whichever order they are printed in', () => {
  const [service, timer] = shown('activating').split('\n\n')
  assert.deepEqual(systemdView(`${timer}\n${service}`), systemdView(shown('activating')))
})

test('what systemd did not say is not guessed', () => {
  const nothing = { serviceActive: false, nextFire: null, lastTrigger: null }
  assert.deepEqual(systemdView(''), nothing, 'systemctl failed, or ran out of time')
  assert.deepEqual(systemdView(undefined), nothing)
  assert.deepEqual(systemdView(shown('inactive', '', 'n/a')), nothing, 'a timer with no next run that never fired')
  assert.equal(isoFromSystemd('Fri 2026-10-09 16:00:00 CEST'), null, 'another zone')
  assert.equal(isoFromSystemd('Fri 2026-10-09 14:00:00 UTC'), '2026-10-09T14:00:00Z')
})

test('systemd is asked once, for both units, in UTC', () => {
  assert.deepEqual(SYSTEMD_SHOW.slice(0, 3), ['show', ...CYCLE_UNITS])
  assert.ok(SYSTEMD_SHOW.includes('--timestamp=utc'))
  for (const property of ['Id', 'ActiveState', 'NextElapseUSecRealtime', 'LastTriggerUSec']) assert.ok(SYSTEMD_SHOW.at(-1)?.split(',').includes(property), property)
})
