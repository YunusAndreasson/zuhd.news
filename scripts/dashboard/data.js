// What the dashboard does that can be asked without starting it.
//
// `server.js` listens as soon as it is loaded, so nothing in it could be
// tested, and nothing was. The parts with a behaviour of their own live here
// and the server is what wires them to a port.

import { existsSync, statSync } from 'node:fs'
import { cycleIdOf, cycleLogName, isoFromDateOutput } from '../lib/cycle-log.js'
import { readJson, writeJson } from '../lib/json-file.js'

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

// ── A series the dashboard keeps ─────────────────────────────────────

/**
 * A series as it is on disk: `[]` when there is no file yet, null when there
 * is one and it does not hold a series. The difference is the point: the
 * first is a place to start, the second a history not to write over.
 *
 * @param {string} path
 * @returns {any[] | null}
 */
export function readSeries(path) {
  if (!existsSync(path)) return []
  const kept = readJson(path, null)
  return Array.isArray(kept) ? kept : null
}

/**
 * `series` with `entry` standing where the entry of its `date` stood, or at
 * the end when the date is new; its last `keep`.
 *
 * @template {{ date: string }} T
 * @param {T[]} series
 * @param {T} entry
 * @param {number} keep
 * @returns {T[]}
 */
export function withDay(series, entry, keep) {
  const at = series.findIndex((e) => e.date === entry.date)
  const next = at === -1 ? [...series, entry] : series.map((e, i) => (i === at ? entry : e))
  return next.slice(-keep)
}

/**
 * Put the day's entry into the series kept at `path`, and return the series
 * to show.
 *
 * This is the one file the dashboard writes, and it writes it while answering
 * a GET, so it is careful in three ways. The write is `writeJson`'s, a
 * sibling renamed over, because the file is tracked and a cycle may be
 * committing `content/` at that moment. Nothing is written when the entry
 * changes nothing. And a file that is there and does not hold a series is
 * left as it is: read as empty, it was written back as today's entry alone.
 *
 * @template {{ date: string }} T
 * @param {string} path
 * @param {T} entry
 * @param {number} keep
 * @returns {{ series: T[], written: boolean }}
 */
export function keepDay(path, entry, keep) {
  const kept = readSeries(path)
  const series = withDay(kept ?? [], entry, keep)
  if (kept === null) {
    console.error(`dashboard: ${path} is there and is not a series — left as it is, today's entry is not kept`)
    return { series, written: false }
  }
  if (JSON.stringify(kept) === JSON.stringify(series)) return { series, written: false }
  writeJson(path, series)
  return { series, written: true }
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
 * @param {CycleLog} log
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
 * In how many of these cycles each feed source failed: the `✗ name: reason`
 * lines of Stage 0, the feed fetch, a source counted once a cycle.
 *
 * Every `✗` in the log was counted, a line at a time. Stage 3.4 prints four
 * a cycle for exchanges with one day of data (`✗ yahoo:^TASI.SR: only 1/1
 * points`), so `yahoo` stood in the feed's table at four failures a cycle,
 * and the page showed the sum as "n/35 cycles".
 *
 * @param {CycleLog[]} logs
 * @returns {Record<string, number>}
 */
export function feedFailures(logs) {
  /** @type {Record<string, number>} */
  const cycles = {}
  for (const log of logs) {
    const failed = new Set(log.marks.filter((mark) => mark.stage === '0').map((mark) => mark.name))
    for (const name of failed) cycles[name] = (cycles[name] || 0) + 1
  }
  return cycles
}
