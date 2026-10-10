// What the dashboard does that can be asked without starting it.
//
// `server.js` listens as soon as it is loaded, so nothing in it could be
// tested, and nothing was. The parts with a behaviour of their own live here
// and the server is what wires them to a port.

import { closeSync, openSync, readSync, statSync } from 'node:fs'
import { cycleIdOf, cycleLogName, isoFromDateOutput } from '../lib/cycle-log.js'
import { DAILY_HOUR } from '../lib/cycle-run.js'

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
 * @returns {{ serviceActive: boolean, serviceState: string | null, timerActive: boolean | null, nextFire: string | null, lastTrigger: string | null }}
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
    // `failed` after a cycle that exited non-zero, until the next one starts.
    serviceState: service?.ActiveState ?? null,
    timerActive: timer ? timer.ActiveState === 'active' : null,
    nextFire: isoFromSystemd(timer?.NextElapseUSecRealtime),
    lastTrigger: isoFromSystemd(timer?.LastTriggerUSec),
  }
}

// ── What a file says, kept until the file changes ────────────────────

/**
 * `read(path)`, asked again only when the file's modification time or size
 * has moved. For a file that is costly to read and seldom changes: a cycle
 * log that is finished, the archive of context briefs.
 *
 * `keep` what `read` returns small. The value stays in memory for as long as
 * the file stays as it is, and the server's unit is capped at 128 MB.
 *
 * @template T
 * @param {(path: string) => T} read
 * @returns {((path: string) => T) & { only: (paths: string[]) => void }}
 */
export function byFileState(read) {
  /** @type {Map<string, { mtimeMs: number, size: number, value: T }>} */
  const kept = new Map()
  /** @param {string} path */
  const ask = (path) => {
    const { mtimeMs, size } = statSync(path)
    const was = kept.get(path)
    if (was && was.mtimeMs === mtimeMs && was.size === size) return was.value
    const value = read(path)
    kept.set(path, { mtimeMs, size, value })
    return value
  }
  /** Forget every file but these: the ones that are still there. @param {string[]} paths */
  ask.only = (paths) => {
    const still = new Set(paths)
    for (const path of kept.keys()) if (!still.has(path)) kept.delete(path)
  }
  return ask
}

// ── Cycles, from their logs ──────────────────────────────────────────

/** @typedef {ReturnType<typeof import('../lib/cycle-log.js').parseCycleLog>} CycleLog */

/**
 * Whether `name` is a cycle's log and nothing else: no directory in it, no
 * other file's name around it. What is listed and what a request may name
 * are both held to it.
 *
 * @param {string} name
 */
export function isCycleLog(name) {
  const id = cycleIdOf(name)
  return id !== null && name === cycleLogName(id)
}

/**
 * One cycle as the page reads it, from its log as `lib/cycle-log.js` read it.
 * This is the shape `index.html` was built against, which is why a retried
 * stage still shows its first attempt here, as it always did.
 *
 * The two moments are ISO. The log carries them as `date` printed them
 * (`Fri Oct  9 05:01:27 AM UTC 2026`), and the page handed that to
 * `new Date()` for each browser to make of it what it could.
 *
 * `aborted` is the line that ended the cycle short, whichever one the log's
 * reader knows (`ABORTS`). The server matched it against a list of its own
 * that had fallen one behind: a cycle whose build failed was not one.
 *
 * @param {CycleLog & { cause?: string | null }} log with why it ended short, when the caller has read that (`abortCause`)
 * @param {string} filename `cycle-2026-10-09_0501.log`
 */
export function cycleView(log, filename) {
  const id = cycleIdOf(filename)
  /** @param {string} stage */
  const first = (stage) => log.stages.find((s) => s.id === stage)?.attempts[0] ?? { exit: null, seconds: null }
  const funnel = log.funnel

  return {
    filename,
    date: id ? id.slice(0, 10) : null,
    scheduledHour: id ? id.slice(11, 13) : null,
    startedAt: isoFromDateOutput(log.startedText),
    finishedAt: isoFromDateOutput(log.finishedText),
    totalSeconds: log.totalSeconds,
    completed: log.finishedText !== null,
    aborted: log.abort,
    benign: isBenignEnd(log.abort),
    cause: log.cause ?? null,
    daily: id ? id.slice(11, 13) === DAILY_HOUR : false,
    target: log.selection.target,
    warnings: log.warnings.length,
    // Every stage that printed a status or a time, as it last ran.
    allStages: [
      ...(log.feed.seconds != null ? [{ id: 'feed', exit: null, seconds: log.feed.seconds, retried: false }] : []),
      ...log.stages.map((s) => ({ id: s.id, exit: s.attempts.at(-1)?.exit ?? null, seconds: s.attempts.at(-1)?.seconds ?? null, retried: s.attempts.length > 1 })),
    ],
    stages: {
      feed: { seconds: log.feed.seconds },
      selector: { exit: first('selector').exit, seconds: first('selector').seconds },
      writer: { exit: first('writer').exit, seconds: first('writer').seconds },
      editor: { exit: first('editor').exit, seconds: first('editor').seconds },
      build: { exit: first('build').exit },
      deploy: { exit: first('deploy').exit },
      briefing: { exit: first('briefing').exit },
      tuning: { exit: first('tuning').exit },
    },
    selectionCount: log.selection.count,
    dedupBefore: log.selection.dedupBefore,
    dedupAfter: log.selection.dedupAfter,
    articlesWritten: log.selection.newArticles,
    newsApiTokens: log.newsApiTokens,
    funnel: {
      feed: funnel?.feed ?? null,
      selected: funnel?.selected ?? 0,
      deduped: funnel?.deduped ?? 0,
      dedupNote: funnel?.dedupNote ?? null,
      written: funnel?.written ?? 0,
      validated: funnel?.validated ?? 0,
      validNote: funnel?.validNote ?? null,
      published: funnel?.published ?? 0,
    },
  }
}

/**
 * Whether a line that ended a cycle short is the cycle working: every story
 * it chose was already out. The other endings are failures.
 *
 * @param {string | null | undefined} abort
 */
export const isBenignEnd = (abort) => /^All selections already published/.test(abort ?? '')

/**
 * Why a cycle ended short, in the log's own words: the last thing printed
 * before the failed stage's status line. The abort line names the stage
 * (`Selector failed (exit 1) — aborting cycle`); the line above its status is
 * what the stage said (`You've hit your weekly limit · resets 9pm (UTC)`),
 * and the page showed a red dot and neither.
 *
 * @param {string} text the log
 * @param {string | null | undefined} abort its abort line
 * @returns {string | null}
 */
export function abortCause(text, abort) {
  if (!abort || isBenignEnd(abort)) return null
  const lines = String(text).split('\n')
  let at = lines.indexOf(abort) - 1
  while (at >= 0 && (!lines[at].trim() || / exit: \d+/.test(lines[at]))) at--
  const said = at >= 0 ? lines[at].trim() : ''
  return said && !said.startsWith('---') ? said.slice(0, 200) : null
}

/**
 * What the sources view asks of a cycle (`sources.js`): which stages it
 * reached, what they marked as failed, and how the ones with a status ended.
 *
 * @param {CycleLog & { cause?: string | null }} log
 * @param {string} filename
 * @returns {import('./sources.js').CycleFacts}
 */
export function cycleFacts(log, filename) {
  return {
    id: cycleIdOf(filename) ?? filename,
    startedAt: isoFromDateOutput(log.startedText),
    finished: log.finishedText !== null,
    ran: log.headers.filter((h) => !h.skipped).map((h) => h.n),
    marks: log.marks,
    exits: Object.fromEntries(log.stages.map((s) => [s.id, s.attempts.at(-1)?.exit ?? null])),
    abort: log.abort,
    cause: log.cause ?? null,
  }
}

// ── Health ───────────────────────────────────────────────────────────

/** A cycle is slow past the first of these seconds and too slow past the second. The daily one also writes the dispatches and the briefing. */
export const SLOW_SECONDS = { cycle: [1500, 2400], daily: [2100, 3000] }

/**
 * The page's health lights, each with the sentence that explains it.
 *
 * What they were got wrong in ways that made the page red or amber with
 * nothing the matter, and green with something: the site was "stale" at six
 * hours, and seven pass between the 22:00 cycle and the 05:00 one every
 * night; one bar for duration, which every daily cycle is over; a cycle that
 * aborted in 22 seconds scored green for speed; five stories was a good cycle
 * when the cycle is asked for eleven to fifteen; and a failed unit read as
 * "idle".
 *
 * @param {{ cycles: ReturnType<typeof cycleView>[], metaGenerated: string | null,
 *   systemd: ReturnType<typeof systemdView>, alert: { reason?: string, consecutive?: number } | null,
 *   sources?: { status: string, red: number, amber: number, total: number } | null, now?: number }} from
 *   `cycles` newest first
 */
export function cycleStatus({ cycles, metaGenerated, systemd, alert, sources = null, now = Date.now() }) {
  /** @type {Record<string, string>} */
  const s = {}
  /** @type {Record<string, string>} */
  const why = {}
  /** @param {string} key @param {string} status @param {string} text */
  const set = (key, status, text) => {
    s[key] = status
    why[key] = text
  }
  const finished = cycles.filter((c) => c.completed)
  const last = finished[0] ?? null
  /** @param {ReturnType<typeof cycleView>} c */
  const deployed = (c) => c.stages.deploy.exit === 0

  // The site: owed a deploy by every cycle that should have made one.
  const owedAt = finished.findIndex((c) => deployed(c))
  const owed = finished.slice(0, owedAt === -1 ? finished.length : owedAt).filter((c) => !c.benign).length
  const ageHours = metaGenerated ? (now - Date.parse(metaGenerated)) / 3600_000 : null
  if (ageHours === null || Number.isNaN(ageHours)) set('siteFreshness', 'unknown', 'no built site to read')
  else if (ageHours > 24) set('siteFreshness', 'red', `built ${Math.round(ageHours)}h ago`)
  else if (owed >= 2) set('siteFreshness', 'red', `the last ${owed} cycles did not deploy`)
  else if (owed === 1) set('siteFreshness', 'amber', 'the last cycle did not deploy')
  else set('siteFreshness', 'green', 'built by the last cycle')

  if (!last) {
    for (const key of ['lastCycle', 'cycleTiming', 'pubRate', 'validation']) set(key, 'unknown', 'no finished cycle on record')
  } else {
    const failedStages = last.allStages.filter((st) => st.exit != null && st.exit !== 0).map((st) => st.id)
    if (last.aborted && !last.benign) set('lastCycle', 'red', last.cause ? `${last.aborted} (${last.cause})` : last.aborted)
    else if (last.benign) set('lastCycle', 'green', 'nothing new: every story chosen was already published')
    else if (!deployed(last)) set('lastCycle', 'red', 'ended without a deploy')
    else if (failedStages.length) set('lastCycle', 'amber', `deployed; failed on the way: ${failedStages.join(', ')}`)
    else set('lastCycle', 'green', 'deployed')

    const [slow, tooSlow] = last.daily ? SLOW_SECONDS.daily : SLOW_SECONDS.cycle
    const t = last.totalSeconds
    if (t === null || last.aborted) set('cycleTiming', 'unknown', 'not timed: the cycle ended short')
    else set('cycleTiming', t < slow ? 'green' : t < tooSlow ? 'amber' : 'red', `${Math.round(t / 60)} min, against ${slow / 60} for ${last.daily ? 'the daily cycle' : 'a cycle'}`)

    const pub = last.funnel.published
    if (last.benign) set('pubRate', 'unknown', 'nothing new to publish')
    else if (last.aborted) set('pubRate', 'unknown', 'nothing published: the cycle ended short')
    else if (!last.target) set('pubRate', pub > 0 ? 'green' : 'red', `${pub} published`)
    else set('pubRate', pub * 2 >= last.target ? 'green' : pub > 0 ? 'amber' : 'red', `${pub} published of ${last.target} asked for`)

    const removed = last.funnel.written - last.funnel.validated
    set('validation', removed <= 0 ? 'green' : removed <= 2 ? 'amber' : 'red', removed > 0 ? `${removed} of ${last.funnel.written} written did not pass` : 'every article written passed')
  }

  if (systemd.timerActive === false) set('timer', 'red', 'the timer is not active: no cycle will start')
  else if (!systemd.nextFire) set('timer', 'unknown', 'systemd did not say when the next cycle fires')
  else set('timer', 'green', 'armed')

  if (alert?.reason) set('alert', 'red', `${alert.reason}${(alert.consecutive ?? 0) > 1 ? `, ${alert.consecutive} cycles running` : ''}`)

  if (sources) {
    const text = sources.red || sources.amber ? `${sources.red} failing · ${sources.amber} degraded` : `all ${sources.total} working`
    set('sources', sources.status, text)
  }

  const vals = Object.values(s)
  s.overall = vals.includes('red') ? 'red' : vals.includes('amber') ? 'amber' : vals.includes('green') ? 'green' : 'unknown'
  return { status: s, why }
}

// ── Writing targets ──────────────────────────────────────────────────

/**
 * The targets the weekly writing metrics (`measure-quality.js`) are held to
 * on the page: a metric, the side of the number that is good, and the number.
 *
 * They stood in `index.html` three times and had drifted: multi-source was
 * 40 there and 30 in the daily audit, which is the one the tuner answers to.
 * Three metrics have no line here on purpose, and are shown as figures with
 * no verdict. Title echo is redefined by the trend's schema 4 and its old bar
 * of 10 has never been met under any definition. Acronym violations counts
 * outlet names (TASS, RT) and runs in the hundreds. The soft length target is
 * information, never a gate. With those three always in breach the quality
 * light was red whatever the writing did.
 *
 * @type {Record<string, { below?: number, above?: number, is?: number, label: string }>}
 */
export const WRITING_TARGETS = {
  passiveHookRatePct: { below: 15, label: 'passive hook' },
  passiveBodyRatePct: { below: 15, label: 'passive (any sentence)' },
  semicolonRatePct: { is: 0, label: 'semicolons' },
  hedgeRatePct: { below: 5, label: 'hedges' },
  causalClaimHits: { is: 0, label: 'causal claims' },
  pressEraHits: { is: 0, label: 'press-era phrases' },
  countryNullCount: { is: 0, label: 'country:null' },
  multiSourceRatePct: { above: 30, label: 'multi-source' },
  topOutletSharePct: { below: 35, label: 'top outlet share' },
  charOver400Pct: { below: 5, label: 'over the character cap' },
}

/**
 * The targets a week's metrics miss, by their labels.
 *
 * @param {Record<string, unknown> | null | undefined} metrics
 * @returns {string[]}
 */
export function writingBreaches(metrics) {
  return Object.entries(WRITING_TARGETS).flatMap(([key, t]) => {
    const v = metrics?.[key]
    if (typeof v !== 'number') return []
    const met = t.is != null ? v === t.is : t.below != null ? v < t.below : v >= /** @type {number} */ (t.above)
    return met ? [] : [t.label]
  })
}

// ── The live tail ────────────────────────────────────────────────────

/**
 * Read `length` bytes of a file from `from`.
 *
 * @param {string} path
 * @param {number} from
 * @param {number} length
 */
function bytesAt(path, from, length) {
  const bytes = Buffer.alloc(length)
  const fd = openSync(path, 'r')
  try {
    return bytes.subarray(0, readSync(fd, bytes, 0, length, from))
  } finally {
    closeSync(fd)
  }
}

/**
 * Follow a file as it grows: each `read()` answers the whole lines written
 * since the one before, and keeps its place in bytes.
 *
 * The tail took its starting place from the file's size, which is bytes, and
 * then cut the file's text at that number, which counts characters. A cycle
 * log is full of `✓`, `→` and `—`, three bytes each, so the first lines after
 * a page connected were cut short or lost, by as many characters as the log
 * had such signs. Here the place is bytes throughout, and it only ever rests
 * after a newline: a line half written, or a sign split between two writes,
 * waits for its end.
 *
 * `from: 'end'` starts after the last whole line there is, `'start'` at the
 * top. A file that got shorter was begun again (a cycle's first line starts
 * its log over) and is read from the top. One that is not there has no lines.
 *
 * @param {string} path
 * @param {'start' | 'end'} [from]
 */
export function tailOf(path, from = 'end') {
  let at = 0
  if (from === 'end') {
    try {
      const { size } = statSync(path)
      // The last line may be half written: go back to where it begins.
      const last = bytesAt(path, Math.max(0, size - 65_536), Math.min(size, 65_536))
      at = size - last.length + last.lastIndexOf(0x0a) + 1
    } catch {
      /* nothing there yet: from the top, when there is */
    }
  }
  return {
    /** @returns {string[]} */
    read() {
      try {
        const { size } = statSync(path)
        if (size < at) at = 0
        if (size === at) return []
        const fresh = bytesAt(path, at, size - at)
        const end = fresh.lastIndexOf(0x0a)
        if (end === -1) return []
        at += end + 1
        return fresh.subarray(0, end).toString('utf8').split('\n').filter(Boolean)
      } catch {
        return []
      }
    },
  }
}

/**
 * The log to follow next, when the logs directory reports a name: a cycle's
 * log newer than the one being followed. Null for anything else, the log
 * already followed among them: a directory reports every write to it.
 *
 * @param {string | null} following
 * @param {string | null | undefined} name
 * @returns {string | null}
 */
export const nextLog = (following, name) => (name && isCycleLog(name) && (!following || name > following) ? name : null)
