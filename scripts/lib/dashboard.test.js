// Run: node --test scripts/lib/dashboard.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appendFileSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CYCLE_UNITS, SENT, SYSTEMD_SHOW, WRITING_TARGETS, abortCause, byFileState, cycleFacts, cycleStatus, cycleView, isBenignEnd, isCycleLog, isoFromSystemd, listener, nextLog, systemdView, tailOf, writingBreaches } from '../dashboard/data.js'
import { CONFLICT_STALE_DAYS, KEPT_FOR_MS, failuresByName, sourcesView } from '../dashboard/sources.js'
import { parseCycleLog } from './cycle-log.js'
import { ROOT } from './paths.js'

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
  assert.deepEqual(systemdView(shown('inactive')), { serviceActive: false, serviceState: 'inactive', timerActive: true, nextFire: '2026-10-09T14:00:00Z', lastTrigger: '2026-10-09T10:00:07Z' })
})

test('a cycle that is running is seen as running', () => {
  assert.equal(systemdView(shown('activating')).serviceActive, true)
  assert.equal(systemdView(shown('active')).serviceActive, true)
  for (const state of ['failed', 'deactivating', '']) assert.equal(systemdView(shown(state)).serviceActive, false, state)
  assert.equal(systemdView(shown('failed')).serviceState, 'failed', 'a cycle that exited non-zero is not "idle"')
})

test('the units are read by name, whichever order they are printed in', () => {
  const [service, timer] = shown('activating').split('\n\n')
  assert.deepEqual(systemdView(`${timer}\n${service}`), systemdView(shown('activating')))
})

test('what systemd did not say is not guessed', () => {
  const nothing = { serviceActive: false, serviceState: null, timerActive: null, nextFire: null, lastTrigger: null }
  assert.deepEqual(systemdView(''), nothing, 'systemctl failed, or ran out of time')
  assert.deepEqual(systemdView(undefined), nothing)
  const never = systemdView(shown('inactive', '', 'n/a'))
  assert.deepEqual([never.nextFire, never.lastTrigger], [null, null], 'a timer with no next run that never fired')
  assert.equal(isoFromSystemd('Fri 2026-10-09 16:00:00 CEST'), null, 'another zone')
  assert.equal(isoFromSystemd('Fri 2026-10-09 14:00:00 UTC'), '2026-10-09T14:00:00Z')
})

test('systemd is asked once, for both units, in UTC', () => {
  assert.deepEqual(SYSTEMD_SHOW.slice(0, 3), ['show', ...CYCLE_UNITS])
  assert.ok(SYSTEMD_SHOW.includes('--timestamp=utc'))
  for (const property of ['Id', 'ActiveState', 'NextElapseUSecRealtime', 'LastTriggerUSec']) assert.ok(SYSTEMD_SHOW.at(-1)?.split(',').includes(property), property)
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
    benign: false,
    cause: null,
    daily: true,
    target: null,
    warnings: 0,
    // Every stage that printed a status or a time: the page drew four of them.
    allStages: [
      { id: 'feed', exit: null, seconds: 30, retried: false },
      { id: 'selector', exit: 0, seconds: 188, retried: false },
      { id: 'writer', exit: 0, seconds: 178, retried: false },
      { id: 'editor', exit: 0, seconds: 58, retried: false },
      { id: 'trends', exit: 0, seconds: 46, retried: false },
      { id: 'build', exit: 0, seconds: null, retried: false },
      { id: 'deploy', exit: 0, seconds: null, retried: false },
    ],
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
  assert.deepEqual(view({ writer: 'Writer exit: 1 — 9s\nWriter retry exit: 0 — 170s' }).allStages[2], { id: 'writer', exit: 0, seconds: 170, retried: true }, 'and its last among all the stages')
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
  assert.deepEqual(failuresByName([twice, once, clean], '0'), { Bellingcat: 2, 'Mada Masr': 1 })
  assert.deepEqual(failuresByName([clean], '0'), {}, 'the trend fetch is not a feed')
  assert.deepEqual(failuresByName([clean], '3.4'), { 'yahoo:^TASI.SR': 1, 'yahoo:DFMGI.AE': 1 }, 'and is counted under its own stage')
  assert.deepEqual(failuresByName([], '0'), {})
})

// ── Health ───────────────────────────────────────────────────────────

const ABORTED = `=== zuhd.news editorial cycle ===
Started: Fri Oct  9 06:03:32 PM UTC 2026
--- Stage 0: API + RSS feed fetch ---
Merged feed: 22 multi + 51 niche — 16s
--- Stage 1: Selector ---
Selection target: 15 stories
You've hit your weekly limit · resets 9pm (UTC)
Selector exit: 1 — 5s
Selector failed (exit 1) — aborting cycle
Finished: Fri Oct  9 06:03:54 PM UTC 2026 — total 22s
`

/** A cycle as the server hands it on: its view, with the cause read from the text. */
const cycleOf = (text, name) => {
  const log = parseCycleLog(text)
  return cycleView({ ...log, cause: abortCause(text, log.abort) }, name)
}
/** A cycle that went right: thirteen minutes, and every article written passed. */
const sound = (name) => {
  const cycle = cycleOf(logText(), name)
  return { ...cycle, totalSeconds: 800, funnel: { ...cycle.funnel, validated: cycle.funnel.written } }
}
const idle = systemdView(shown('inactive'))
const status = (cycles, extra = {}) => cycleStatus({ cycles, metaGenerated: '2026-10-09T14:14:00Z', systemd: idle, alert: null, now: Date.parse('2026-10-09T21:00:00Z'), ...extra })

// The page showed a red dot for the 18:03 cycle of 2026-10-09 and nothing of
// why: the selector's one line of output was the account's weekly limit.
test('a cycle that ended short says why in the words of the stage that failed', () => {
  assert.equal(abortCause(ABORTED, 'Selector failed (exit 1) — aborting cycle'), "You've hit your weekly limit · resets 9pm (UTC)")
  assert.equal(abortCause(ABORTED, null), null)
  assert.equal(abortCause('All selections already published\n', 'All selections already published'), null, 'a cycle with nothing new did not fail')
  assert.equal(isBenignEnd('All selections already published — nothing to write'), true)
  assert.equal(isBenignEnd('No new articles — skipping editor and deploy'), false, 'the writer wrote nothing: a failure')
})

// Each of these was the page being wrong with nothing the matter, or right by accident.
test('the lights follow what happened, not the clock', () => {
  const good = sound('cycle-2026-10-09_1402.log')
  const { status: ok, why } = status([good])
  assert.equal(ok.siteFreshness, 'green', 'seven hours after the last cycle deployed is not stale: the night is that long')
  assert.equal(ok.lastCycle, 'green')
  assert.equal(ok.timer, 'green')
  assert.equal(ok.overall, 'green')
  assert.match(why.siteFreshness, /built by the last cycle/)

  const aborted = cycleOf(ABORTED, 'cycle-2026-10-09_1803.log')
  const after = status([aborted, good], { alert: { reason: 'cycle exited 1 before publishing', consecutive: 1 } })
  assert.equal(after.status.lastCycle, 'red')
  assert.match(after.why.lastCycle, /weekly limit/)
  assert.equal(after.status.siteFreshness, 'amber', 'one cycle owed')
  assert.equal(after.status.cycleTiming, 'unknown', '22 seconds to an abort is not a fast cycle')
  assert.equal(after.status.pubRate, 'unknown')
  assert.equal(after.status.alert, 'red')
  assert.equal(after.status.overall, 'red')
  assert.equal(status([aborted, aborted, good]).status.siteFreshness, 'red', 'two owed')
})

test('the daily cycle is timed against its own bar, and a quiet cycle is not a failed one', () => {
  const took = (seconds, name) => ({ ...sound(name), totalSeconds: seconds })
  assert.equal(status([took(1700, 'cycle-2026-10-09_0501.log')]).status.cycleTiming, 'green', 'the 05:00 cycle writes the dispatches and the briefing')
  assert.equal(status([took(1700, 'cycle-2026-10-09_1402.log')]).status.cycleTiming, 'amber')
  assert.equal(status([took(2500, 'cycle-2026-10-09_1402.log')]).status.cycleTiming, 'red')

  const ended = cycleOf(logText({ writer: 'All selections already published', end: '' }), 'cycle-2026-10-09_1803.log')
  assert.equal(ended.benign, true)
  // As such a cycle is: a minute long, nothing written.
  const quiet = { ...ended, totalSeconds: 60, funnel: { ...ended.funnel, written: 0, validated: 0, published: 0 } }
  const after = status([quiet, sound('cycle-2026-10-09_1402.log')])
  assert.deepEqual([after.status.lastCycle, after.status.siteFreshness, after.status.overall], ['green', 'green', 'green'])
})

test('a timer that is not armed is red, and the sources colour the whole', () => {
  const good = sound('cycle-2026-10-09_1402.log')
  const unarmed = systemdView(shown('inactive').replace('ActiveState=active', 'ActiveState=inactive'))
  assert.equal(status([good], { systemd: unarmed }).status.timer, 'red')
  const withSources = status([good], { sources: { status: 'red', red: 1, amber: 2, total: 28 } })
  assert.deepEqual([withSources.status.sources, withSources.status.overall, withSources.why.sources], ['red', 'red', '1 failing · 2 degraded'])
})

// ── Writing targets ──────────────────────────────────────────────────

test('a week breaches the targets it misses, and a metric with no target cannot', () => {
  assert.deepEqual(writingBreaches({ passiveHookRatePct: 0.8, pressEraHits: 10, multiSourceRatePct: 30.9, titleEchoRatePct: 48.2, acronymViolations: 215 }), ['press-era phrases'])
  assert.deepEqual(writingBreaches({ multiSourceRatePct: 29 }), ['multi-source'])
  assert.deepEqual(writingBreaches(null), [])
  for (const key of ['titleEchoRatePct', 'acronymViolations', 'charOver350Pct']) assert.equal(WRITING_TARGETS[key], undefined, key)
})

// ── Sources ──────────────────────────────────────────────────────────

const NOW = Date.parse('2026-10-09T21:00:00Z')
/** A finished cycle that reached every stage, started at this hour of 2026-10-09. */
const ranAll = (hour, marks = []) => ({
  id: `2026-10-09_${hour}00`, startedAt: `2026-10-09T${hour}:00:00Z`, finished: true,
  ran: ['0', '1', '3.4', '3.4b', '3.4b2', '3.4b3', '3.4b4', '3.4c', '3.4c2', '3.4c3', '3.4c4', '3.4c5', '3.9', '4'],
  marks, exits: { selector: 0, writer: 0, editor: 0, build: 0, deploy: 0 }, abort: null, cause: null,
})
/**
 * What every source left on disk after the 14:00 cycle, all of it whole.
 *
 * @returns {Record<string, any>}
 */
const disk = () => ({
  feedApi: { fetchedAt: '2026-10-09T14:00:10Z', stories: [{}, {}], tokens: { estTokens: 18 } },
  feedSourceStats: { fetchedAt: '2026-10-09T14:00:15Z', sources: [{ name: 'Bellingcat', fetched: 10, used: 3, error: null }] },
  trendsLatest: { fetchedAt: '2026-10-09T14:12:00Z', releaseCalendarAsOf: '2026-10-09', releaseCalendar: [{}], indicators: [{ id: 'brent', source: 'fred', cadence: 'daily', asOf: '2026-10-06' }] },
  markets: { generated: '2026-10-09T14:12:53Z', exchanges: [{ id: 'bist', asOf: '2026-10-08' }], skipped: [] },
  conflict: { generated: '2026-10-09T14:13:03Z', windowEnd: '2026-08-31', events: [{}], ucdpVersion: '26.0.8' },
  aiModels: { fetched: '2026-10-08T20:00:00Z', models: 274, labs: [] },
  tweetLog: [{ timestamp: '2026-10-09T14:16:14Z', sent: true, tweetId: '1' }],
})
const rowsOf = (files, cycles) => {
  const view = sourcesView({ read: (name) => files[name] ?? null, cycles, now: NOW })
  return Object.fromEntries(view.groups.flatMap((g) => g.rows).map((r) => [r.id, r]))
}

test('a source is judged by the stamp inside its file, against the last cycle that reached its stage', () => {
  const rows = rowsOf(disk(), [ranAll('14'), ranAll('10')])
  assert.equal(rows.newsapi.status, 'green')
  assert.equal(rows.conflict.status, 'green')
  assert.equal(rows['ai-models'].status === 'red', false, 'fetched 18 hours ago, and kept for twenty')
  assert.equal(rows.gdacs.status, 'red', 'nothing on disk')

  // The 18:00 cycle ran its fetchers and this one kept its snapshot: amber. Again at 22:00: red.
  assert.equal(rowsOf(disk(), [ranAll('18'), ranAll('14')]).markets.status, 'amber')
  assert.equal(rowsOf(disk(), [ranAll('20'), ranAll('18'), ranAll('14')]).markets.status, 'red')
})

// The selector failed at 18:03 on 2026-10-09 and no fetcher ran. Nothing was stale.
test('a cycle that ended before a stage does not count against its source, and one still running is not read', () => {
  const aborted = { ...ranAll('18'), ran: ['0', '1'], exits: { selector: 1 }, abort: 'Selector failed (exit 1) — aborting cycle', cause: 'weekly limit' }
  const files = { ...disk(), feedApi: { ...disk().feedApi, fetchedAt: '2026-10-09T18:00:10Z' } }
  const rows = rowsOf(files, [aborted, ranAll('14')])
  assert.equal(rows.markets.status, 'green')
  assert.equal(rows.newsapi.status, 'green', 'the feed was fetched before the abort')
  assert.equal(rows.claude.status, 'red')
  assert.match(rows.claude.note, /selector exit 1 — weekly limit/)
  assert.deepEqual(rows.claude.failed, { n: 1, of: 2 })

  const running = { ...ranAll('20'), finished: false }
  assert.equal(rowsOf(disk(), [running, ranAll('14')]).markets.status, 'green')
})

test('what came in is held against what should have: missing rows, stale ones, a series behind', () => {
  const files = disk()
  files.markets = { ...files.markets, skipped: [{ id: 'tadawul', reason: 'no series' }], exchanges: [{ id: 'bist', asOf: '2026-10-08' }, { id: 'jse', asOf: '2026-10-08', stale: true }] }
  files.trendsLatest.indicators.push({ id: 'wheat', source: 'fred', cadence: 'monthly', asOf: '2026-07-01' }, { id: 'us-cpi', source: 'fred', cadence: 'monthly', asOf: '2026-08-01' })
  const marks = [{ stage: '3.4b2', name: 'yahoo:^TASI.SR', message: 'only 1/1 points' }, { stage: '3.4', name: 'fred:WHEAT', message: 'HTTP 500' }]
  const rows = rowsOf(files, [ranAll('14', marks), ranAll('10')])
  assert.equal(rows.markets.status, 'amber')
  assert.match(rows.markets.note, /no data: tadawul/)
  assert.match(rows.markets.note, /stale or from the cache: jse/)
  assert.deepEqual(rows.markets.failed, { n: 1, of: 2 })
  assert.equal(rows['trends-fred'].status, 'amber')
  assert.match(rows['trends-fred'].note, /behind: wheat \(2026-07-01\)$/, 'a monthly series two months back is on time; three is not')
  assert.deepEqual(rows['trends-fred'].failed, { n: 1, of: 2 })
  assert.deepEqual(rows['trends-crypto'].failed, { n: 0, of: 2 }, 'another source\'s mark is not this one\'s')
  assert.equal(rows['trends-crypto'].status, 'red', 'no series at all')
})

// X answered "credits depleted" to 98 posts in a row from 2026-09-18, as a
// warning line in the log and nothing on the page.
test('a channel is red when its last posts all failed, and a push held back is not an attempt', () => {
  const refused = (day) => ({ timestamp: `2026-10-0${day}T14:16:14Z`, sent: false, error: 'credits depleted' })
  /** @type {Record<string, any>} */
  const files = { ...disk(), tweetLog: [{ timestamp: '2026-09-18T12:24:05Z', sent: true }, ...[3, 4, 5, 6, 7].map(refused)] }
  files.pushLog = [{ timestamp: '2026-10-09T10:12:51Z', sent: true, response: { pushed: 1, tokens: 5 } }, { timestamp: '2026-10-09T14:16:04Z', sent: false, skipReason: 'all 12 candidates below coverage threshold 1' }]
  const rows = rowsOf(files, [ranAll('14')])
  assert.equal(rows.x.status, 'red')
  assert.match(rows.x.note, /credits depleted · last sent 2026-09-18/)
  assert.deepEqual([rows.push.status, rows.push.got, rows.push.expected], ['green', 1, 1])
  assert.equal(rows.instagram.status, 'unknown')
  assert.equal(rowsOf({ ...files, tweetLog: [...files.tweetLog, { timestamp: '2026-10-08T14:16:14Z', sent: true }] }, [ranAll('14')]).x.status, 'amber')
})

// Two fetchers are scripts and cannot be imported; these are their numbers.
test('the bars copied from two fetchers are still theirs', () => {
  const read = (name) => readFileSync(join(ROOT, 'scripts', name), 'utf-8')
  assert.equal(KEPT_FOR_MS.aiModels, 20 * 3600_000)
  assert.match(read('fetch-ai-models.js'), /^const REFETCH_AFTER_MS = 20 \* 3600_000$/m)
  assert.equal(KEPT_FOR_MS.conflict, 6 * 3600_000)
  assert.match(read('fetch-conflict.js'), /^const CACHE_MAX_AGE_MS = 6 \* 60 \* 60 \* 1000$/m)
  assert.match(read('fetch-conflict.js'), new RegExp(`DATASET_STALE_DAYS = ${CONFLICT_STALE_DAYS}\\b`))
})

test('a cycle is handed to the sources view by what its log says it reached', () => {
  const facts = cycleFacts({ ...parseCycleLog(ABORTED), cause: 'weekly limit' }, 'cycle-2026-10-09_1803.log')
  assert.deepEqual([facts.id, facts.startedAt, facts.finished, facts.ran, facts.exits.selector, facts.cause], ['2026-10-09_1803', '2026-10-09T18:03:32Z', true, ['0', '1'], 1, 'weekly limit'])
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
