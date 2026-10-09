// Run: node --test scripts/lib/dashboard.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appendFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CYCLE_UNITS, SENT, SYSTEMD_SHOW, byFileState, cycleView, feedFailures, isCycleLog, isoFromSystemd, keepDay, listener, nextLog, readSeries, systemdView, tailOf, withDay } from '../dashboard/data.js'
import { parseCycleLog } from './cycle-log.js'

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

// ── The series it keeps ──────────────────────────────────────────────

const day = (date, specificity = 8) => ({ date, specificity })

test('a day already in the series is replaced where it stands, a new one goes last, and the oldest fall off', () => {
  const series = [day('2026-10-07'), day('2026-10-08'), day('2026-10-09')]
  assert.deepEqual(withDay(series, day('2026-10-08', 9), 60), [day('2026-10-07'), day('2026-10-08', 9), day('2026-10-09')])
  assert.deepEqual(withDay(series, day('2026-10-10'), 60), [...series, day('2026-10-10')])
  assert.deepEqual(withDay(series, day('2026-10-10'), 3), [day('2026-10-08'), day('2026-10-09'), day('2026-10-10')])
  assert.deepEqual(series.length, 3, 'the series it was given is not changed')
})

test('the day is kept with a write that leaves no half file, and not written again when nothing changed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dashboard-'))
  const path = join(dir, 'trend.json')
  assert.deepEqual(keepDay(path, day('2026-10-08'), 60), { series: [day('2026-10-08')], written: true })
  assert.deepEqual(keepDay(path, day('2026-10-08'), 60), { series: [day('2026-10-08')], written: false })
  assert.deepEqual(keepDay(path, day('2026-10-09'), 60).series, [day('2026-10-08'), day('2026-10-09')])
  assert.deepEqual(keepDay(path, day('2026-10-09', 9), 60), { series: [day('2026-10-08'), day('2026-10-09', 9)], written: true })
  assert.deepEqual(readSeries(path), [day('2026-10-08'), day('2026-10-09', 9)])
  assert.ok(readFileSync(path, 'utf8').endsWith(']\n'))
  assert.deepEqual(readdirSync(dir), ['trend.json'], 'no sibling left behind')
})

// Read with `catch { trend = [] }` and written back, a file that did not
// parse became a trend of one day.
test('a trend file that is there and does not hold a series is left as it is', (t) => {
  const said = t.mock.method(console, 'error', () => {})
  const path = join(mkdtempSync(join(tmpdir(), 'dashboard-')), 'trend.json')
  for (const text of ['[{"date":"2026-05-02","specificity":8.58},\n<<<<<<< Updated upstream\n', '{"date":"2026-05-02"}', '']) {
    writeFileSync(path, text)
    assert.equal(readSeries(path), null)
    assert.deepEqual(keepDay(path, day('2026-10-09'), 60), { series: [day('2026-10-09')], written: false }, 'today is still shown')
    assert.equal(readFileSync(path, 'utf8'), text)
  }
  assert.ok(said.mock.calls.length >= 3)
  assert.deepEqual(readSeries(join(tmpdir(), 'dashboard-no-such-file.json')), [], 'no file yet is a place to start')
})

// ── A file read once for as long as it stays the same ────────────────

// The Quality tab asks for two panels at once, and each parsed the 15.9 MB
// archive of context briefs for itself, on every load.
test('a file is read again only when its time or its size has moved', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dashboard-'))
  const path = join(dir, 'briefs.json')
  writeFileSync(path, '{"a":1}')
  let reads = 0
  const keys = byFileState((p) => {
    reads++
    return Object.keys(JSON.parse(readFileSync(p, 'utf8')))
  })
  assert.deepEqual([keys(path), keys(path), keys(path)], [['a'], ['a'], ['a']])
  assert.equal(reads, 1)

  const mtime = new Date('2026-06-14T04:32:00Z')
  utimesSync(path, mtime, mtime)
  assert.deepEqual(keys(path), ['a'])
  assert.equal(reads, 2, 'a new time')
  writeFileSync(path, '{"a":1,"b":2}')
  utimesSync(path, mtime, mtime)
  assert.deepEqual(keys(path), ['a', 'b'], 'a new size under the same time')
  assert.equal(reads, 3)
})

test('each file has its own answer, a forgotten one is read again, and a missing one throws', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dashboard-'))
  const [one, two] = [join(dir, 'cycle-1.log'), join(dir, 'cycle-2.log')]
  writeFileSync(one, 'first')
  writeFileSync(two, 'second')
  let reads = 0
  const text = byFileState((p) => {
    reads++
    return readFileSync(p, 'utf8')
  })
  assert.deepEqual([text(one), text(two), text(one)], ['first', 'second', 'first'])
  assert.equal(reads, 2)
  text.only([two])
  assert.deepEqual([text(two), text(one)], ['second', 'first'])
  assert.equal(reads, 3, 'only the one that was dropped')
  rmSync(one)
  assert.throws(() => text(one), /ENOENT/)
})

// ── Cycles, from their logs ──────────────────────────────────────────

/** A cycle's log, as much of one as the page reads. @param {{ stage0?: string, writer?: string, end?: string }} [parts] */
const logText = ({ stage0 = '', writer = 'Writer exit: 0 — 178s', end = 'Build exit: 0\nDeploy exit: 0' } = {}) => `=== zuhd.news editorial cycle ===
Started: Fri Oct  9 05:01:27 AM UTC 2026

--- Stage 0: API + RSS feed fetch ---
${stage0}NewsAPI tokens this cycle: ~18 (events=1×5 articles=5×1 perEvent=8×1 other=0)
API fetch: 80 stories from 50 events
RSS fetch: 77 stories
Merged feed: 12 multi + 48 niche — 30s

--- Stage 1: Selector ---
Selector exit: 0 — 188s
Selection contains 11 stories
Deduped selection: 11 → 10 (1 duplicates removed)

--- Stage 2: Writer ---
${writer}
Found 10 new/modified articles

--- Stage 3: Editor ---
Editor exit: 0 — 58s

--- Stage 3.4: Trends fetch ---
  ✗ yahoo:^TASI.SR: only 1/1 points
  ✗ yahoo:DFMGI.AE: only 1/1 points
Trends exit: 0 — 46s

--- Stage 3b: Build & Deploy ---
${end}

=== Funnel ===
Feed:      12 multi + 48 niche
Selected:  11
Deduped:   10 (1 already published)
Written:   10
Validated: 9 (1 removed)
Published: 9

Finished: Fri Oct  9 05:30:40 AM UTC 2026 — total 1753s
`
const view = (parts, name = 'cycle-2026-10-09_0501.log') => cycleView(parseCycleLog(logText(parts)), name)

test('a cycle is what its log says, with its two moments as ISO', () => {
  assert.deepEqual(view(), {
    filename: 'cycle-2026-10-09_0501.log',
    date: '2026-10-09',
    scheduledHour: '05',
    // The log has them as `date` printed them, which a browser other than the
    // one it was written in reads as no date at all.
    startedAt: '2026-10-09T05:01:27Z',
    finishedAt: '2026-10-09T05:30:40Z',
    totalSeconds: 1753,
    completed: true,
    aborted: null,
    stages: {
      feed: { seconds: 30 },
      selector: { exit: 0, seconds: 188 },
      writer: { exit: 0, seconds: 178 },
      editor: { exit: 0, seconds: 58 },
      build: { exit: 0 },
      deploy: { exit: 0 },
      briefing: { exit: null },
      tuning: { exit: null },
    },
    selectionCount: 11,
    dedupBefore: 11,
    dedupAfter: 10,
    articlesWritten: 10,
    newsApiTokens: 18,
    funnel: { feed: '12 multi + 48 niche', selected: 11, deduped: 10, dedupNote: '1 already published', written: 10, validated: 9, validNote: '1 removed', published: 9 },
  })
})

test('a retried stage shows its first attempt, as the page always has', () => {
  assert.deepEqual(view({ writer: 'Writer exit: 1 — 9s\nWriter retry exit: 0 — 170s' }).stages.writer, { exit: 1, seconds: 9 })
})

// The server kept a list of its own of the lines that end a cycle early, one
// short of the log reader's: a failed build was not on it.
test('a cycle that ended short says which line ended it, whichever the log reader knows', () => {
  assert.equal(view({ end: 'Build exit: 1\nBuild failed — skipping deploy' }).aborted, 'Build failed — skipping deploy')
  assert.equal(view({ writer: 'Writer exit: 1 — 9s\nNo new articles — skipping editor and deploy' }).aborted, 'No new articles — skipping editor and deploy')
})

test('a cycle still running has no end, and a log that never reached its funnel reads as zeros', () => {
  const running = cycleView(parseCycleLog(logText().split('--- Stage 2')[0]), 'cycle-2026-10-09_0501.log')
  assert.deepEqual([running.completed, running.finishedAt, running.totalSeconds], [false, null, null])
  assert.deepEqual(running.stages.writer, { exit: null, seconds: null })
  assert.deepEqual(running.funnel, { feed: null, selected: 0, deduped: 0, dedupNote: null, written: 0, validated: 0, validNote: null, published: 0 })
})

test('only a cycle log by its own name is one', () => {
  assert.equal(isCycleLog('cycle-2026-10-09_0501.log'), true)
  for (const name of ['../logs/cycle-2026-10-09_0501.log', '/etc/cycle-2026-10-09_0501.log', 'x-cycle-2026-10-09_0501.log', 'cycle-2026-10-09_0501.log.bak', 'cycle-1.log', 'cycles.jsonl', '']) {
    assert.equal(isCycleLog(name), false, name)
  }
})

// `✗ yahoo:^TASI.SR: only 1/1 points` is Stage 3.4's, four a cycle, and stood
// in the feed's table as a source failing four times a cycle.
test('a feed source failed in a cycle when Stage 0 said so, and once however often it said it', () => {
  const twice = parseCycleLog(logText({ stage0: '  ✗ Bellingcat: HTTP 503\n  ✗ Bellingcat: HTTP 503 (retry)\n  ✗ Mada Masr: timeout\n' }))
  const once = parseCycleLog(logText({ stage0: '  ✗ Bellingcat: HTTP 503\n' }))
  const clean = parseCycleLog(logText())
  assert.deepEqual(feedFailures([twice, once, clean]), { Bellingcat: 2, 'Mada Masr': 1 })
  assert.deepEqual(feedFailures([clean]), {}, 'the trend fetch is not a feed')
  assert.deepEqual(feedFailures([]), {})
})

// ── The live tail ────────────────────────────────────────────────────

const logFile = () => join(mkdtempSync(join(tmpdir(), 'dashboard-')), 'cycle-2026-10-09_0501.log')

// The place was taken from the file's size in bytes and used to cut its text
// in characters. With 30 three-byte signs in the log before it, a line
// written after the page connected arrived without its first 60 characters.
test('lines written after the tail began arrive whole, whatever is in the log before them', () => {
  const path = logFile()
  writeFileSync(path, `${'  ✓ Bellingcat → 3 stories — ok\n'.repeat(10)}`)
  const tail = tailOf(path)
  assert.deepEqual(tail.read(), [], 'nothing new yet')
  appendFileSync(path, 'Merged feed: 12 multi + 48 niche — 30s\n\n--- Stage 1: Selector ---\n')
  assert.deepEqual(tail.read(), ['Merged feed: 12 multi + 48 niche — 30s', '--- Stage 1: Selector ---'])
  assert.deepEqual(tail.read(), [])
})

test('a line half written waits for its end, and so does a sign split between two writes', () => {
  const path = logFile()
  writeFileSync(path, 'Started\nSelector ex')
  const tail = tailOf(path)
  appendFileSync(path, 'it: 0 ')
  assert.deepEqual(tail.read(), [], 'no newline yet')
  appendFileSync(path, Buffer.from([0xe2, 0x80]))
  assert.deepEqual(tail.read(), [])
  appendFileSync(path, Buffer.concat([Buffer.from([0x94]), Buffer.from(' 188s\nSelection con')]))
  assert.deepEqual(tail.read(), ['Selector exit: 0 — 188s'], 'the line it joined mid-way comes whole, the next one not yet')
  appendFileSync(path, 'tains 11 stories\n')
  assert.deepEqual(tail.read(), ['Selection contains 11 stories'])
})

test('a new log is read from its first line, one begun again from the top, and one that is gone has no lines', () => {
  const path = logFile()
  const fresh = tailOf(path, 'start')
  assert.deepEqual(fresh.read(), [], 'not there yet')
  writeFileSync(path, '=== zuhd.news editorial cycle ===\nStarted: Fri Oct  9 05:01:27 AM UTC 2026\n')
  assert.deepEqual(fresh.read(), ['=== zuhd.news editorial cycle ===', 'Started: Fri Oct  9 05:01:27 AM UTC 2026'])

  // A second cycle in the same minute starts the log over.
  writeFileSync(path, '=== again ===\n')
  assert.deepEqual(fresh.read(), ['=== again ==='])
  rmSync(path)
  assert.deepEqual(fresh.read(), [])
})

// It held on to the log that was newest when the page connected, and said
// "new cycle" again for every line the new one wrote.
test('the tail moves to a newer cycle log, once, and to nothing else', () => {
  const [old, next] = ['cycle-2026-10-09_0501.log', 'cycle-2026-10-09_1000.log']
  assert.equal(nextLog(old, next), next)
  assert.equal(nextLog(next, next), null, 'a write to the log being followed is not a new cycle')
  assert.equal(nextLog(next, old), null, 'nor is one to an older log')
  assert.equal(nextLog(null, old), old, 'the first log there is')
  for (const name of ['cycles.jsonl', 'runs', `${next}.123.tmp`, null, undefined]) assert.equal(nextLog(old, name), null, String(name))
})
