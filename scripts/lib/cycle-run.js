// What a cycle is made of, for the runner (`scripts/cycle/run.js`) to run the
// stage list (`scripts/cycle/stages.js`) with.
//
// A shell script was the orchestrator for two years (`run-cycle.legacy.sh`,
// while it is kept): a thousand lines of bash in which the order of the
// stages, what each one's failure does, and where each one's output goes were
// all the same kind of line. This is that
// behaviour as an engine, and nothing more: it starts commands, sends their
// output where the script sent it, keeps the funnel, and on the way out does
// what the script's exit trap did. Which commands, in which order, under
// which conditions, is the list's.
//
// It reproduces the script, and is held to that by the recordings in
// `lib/fixtures/cycle/`: the same commands with the same arguments,
// environment and input, the same log and the same journal, in every
// scenario. Three things follow from that and should not be tidied away:
//
// - **Every stage is a child process, started by name.** A stage is never
//   imported: the cycle pulls from the remote half way through, and what runs
//   after the pull has to be the file as pulled.
// - **Where output goes is per stage.** Some stages' lines reach the log and
//   the journal, some the log alone, some are read by the next step and shown
//   nowhere. The dashboard reads the log, the journal is the long record, and
//   several stdouts are a prompt's input.
// - **A deadline is `timeout`'s.** The binary, not a timer here: its exit
//   status (124) is what the retry rules and the log's readers know.

import { spawn, spawnSync } from 'node:child_process'
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs'
import { constants } from 'node:os'
import { join } from 'node:path'
import { DATASETS, pathOf } from './datasets.js'
import { modelFor } from './models.js'
import { ROOT } from './paths.js'

/** `CLAUDE_MODEL` as the script set it: `ZUHD_MODEL` when given, or the pin. */
const SESSION_MODEL = modelFor('session', {})

// ── Time, as the script printed it ───────────────────────────────────

const pad = (/** @type {number} */ n) => String(n).padStart(2, '0')
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * The forms of a moment the cycle writes down, each as `date` gave it to the
 * script. All in UTC: the server's zone is UTC, and the two forms the script
 * took in local time (the log's name and the bare `date` line) are the same
 * there.
 */
export const when = {
  /** `2026-10-08_1804`: the cycle's id, and its log's name. @param {Date} d */
  stamp: (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`,
  /** `2026-10-08T18:04:59Z` @param {Date} d */
  iso: (d) => `${when.day(d)}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`,
  /** `2026-10-08T18:04`, in commit messages. @param {Date} d */
  minute: (d) => `${when.day(d)}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  /** `2026-10-08 18:04 UTC`, in the cycle's own commit. @param {Date} d */
  spoken: (d) => `${when.day(d)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`,
  /** `2026-10-08` @param {Date} d */
  day: (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
  /** `18` @param {Date} d */
  hour: (d) => pad(d.getUTCHours()),
  /** Monday is `1`, Sunday `7`. @param {Date} d */
  weekday: (d) => String(d.getUTCDay() || 7),
  /**
   * `Thu Oct  8 06:04:59 PM UTC 2026`: `date` with no format, under the
   * service's locale. `lib/cycle-log.js` reads the `Started:` and `Finished:`
   * lines in this form.
   *
   * @param {Date} d
   */
  bare: (d) => {
    const h = d.getUTCHours()
    const clock = `${pad(h % 12 || 12)}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${h < 12 ? 'AM' : 'PM'}`
    return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, ' ')} ${clock} UTC ${d.getUTCFullYear()}`
  },
}

// ── Output ───────────────────────────────────────────────────────────

/**
 * Write all of `text` to a descriptor, or as much as it will take. Never
 * through `process.stdout`: asking node for that stream can leave a pipe
 * non-blocking, and a line the journal was slow to take would then throw
 * instead of waiting.
 *
 * It does not throw. A full disk or a closed journal costs the line, as it
 * cost `tee` the line, and the cycle goes on: on this machine a full disk is
 * a thing that happens, and the stages after it still have to run.
 *
 * @param {number} fd
 * @param {string | Buffer} text
 */
function put(fd, text) {
  const bytes = typeof text === 'string' ? Buffer.from(text) : text
  let at = 0
  while (at < bytes.length) {
    try {
      at += writeSync(fd, bytes, at)
    } catch (err) {
      if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'EAGAIN') return
    }
  }
}

/**
 * A named location as git is told of it: its path from the repository root,
 * with a slash on the end when it is a directory.
 *
 * @param {keyof typeof DATASETS} name
 */
export function pathspec(name) {
  const { path } = DATASETS[name]
  return /\.[a-z]+$/.test(path) ? path : `${path}/`
}

/** What `$(…)` leaves of a command's output: everything but the newlines at its end. @param {string} text */
export const captured = (text) => text.replace(/\n+$/, '')

/** How many lines `wc -l` counts in what `echo "$X"` prints. @param {string} value */
export const lineCount = (value) => value.split('\n').length

/**
 * Where a command's two streams go. Named for what the script wrote:
 *
 * - `tee`: `cmd 2>&1 | tee -a "$LOG"`. Both to the log and the journal, in
 *   the order written.
 * - `log`: `cmd >> "$LOG" 2>&1`. Both to the log, and only there.
 * - `errlog`: `cmd 2>>"$LOG"`. Errors to the log; stdout to the journal.
 * - `plain`: nothing redirected. Both to the journal.
 *
 * @typedef {'tee' | 'log' | 'errlog' | 'plain'} Route
 */

/**
 * Where the errors of a command go when its stdout is being read:
 * `quiet` (`2>/dev/null`), `journal` (not redirected) or `log` (`2>>"$LOG"`).
 *
 * @typedef {'quiet' | 'journal' | 'log'} ErrRoute
 */

/**
 * @typedef {object} Funnel
 * @property {string} [feed]
 * @property {number} [selected]
 * @property {number} [deduped]
 * @property {string} [dedupNote]
 * @property {number} [written]
 * @property {number} [validated]
 * @property {string} [validNote]
 * @property {number} [published]
 */

/**
 * A child's exit status, once it has gone and its streams have closed: 127
 * when it could not be started, 128 and the signal's number when one ended it,
 * as the shell counts them.
 *
 * Every child is waited for this way and never with `spawnSync`: while one
 * runs, this process must still be able to hear a signal. systemd stops the
 * unit by signalling everything in it, and the cycle's way out (the alert, the
 * record) has to happen then, not after whatever stage comes next.
 *
 * @param {import('node:child_process').ChildProcess} child
 * @returns {Promise<number>}
 */
function exited(child) {
  return new Promise((resolve) => {
    child.on('error', () => resolve(127))
    child.on('close', (status, signal) => resolve(status ?? 128 + (signal ? (constants.signals[signal] ?? 0) : 0)))
  })
}

/**
 * What a child printed, and how it ended.
 *
 * @param {import('node:child_process').ChildProcess} child one with a pipe for its stdout
 * @param {string} [input] written to its stdin, which is then closed
 */
async function printed(child, input) {
  /** @type {Buffer[]} */
  const chunks = []
  child.stdout?.on('data', (chunk) => chunks.push(chunk))
  if (input !== undefined) {
    child.stdin?.on('error', () => {})
    child.stdin?.end(input)
  }
  const status = await exited(child)
  const raw = Buffer.concat(chunks).toString('utf8')
  return { status, out: captured(raw), raw }
}

/** Thrown to end the cycle from inside a stage: the script's `exit N`. */
export class CycleExit extends Error {
  /** @param {number} status */
  constructor(status) {
    super(`cycle exit ${status}`)
    this.status = status
  }
}

/**
 * One cycle: its identity, its log, its funnel, and the ways it starts a
 * command. A stage is handed this and nothing else.
 */
export class Cycle {
  /**
   * @param {object} [opts]
   * @param {() => Date} [opts.clock]
   * @param {Record<string, string | undefined>} [opts.env] the environment children are started in; changed in place as the cycle exports its own variables
   */
  constructor({ clock = () => new Date(), env = process.env } = {}) {
    this.clock = clock
    this.env = env
    this.began = performance.now()
    /** @type {Funnel} */
    this.funnel = {}
    /** What the stages leave for one another: counts, exit codes, the list of new articles. @type {Record<string, any>} */
    this.state = {}
    this.logFd = -1
    this.logPath = ''
    this.id = ''
    this.startHour = ''
    this.finished = false
  }

  /** Whole seconds since the cycle began, as bash's `SECONDS` counted them. */
  seconds() {
    return Math.floor((performance.now() - this.began) / 1000)
  }

  /** A stopwatch for one stage: call it for the seconds since. */
  timer() {
    const from = this.seconds()
    return () => this.seconds() - from
  }

  // ── The log ────────────────────────────────────────────────────────

  /**
   * Name the cycle and its log. The log is not opened yet: the script made it
   * with its first line, and until then nothing has been written.
   */
  name() {
    mkdirSync(pathOf('cycleLogs'), { recursive: true })
    this.id = when.stamp(this.clock())
    this.logPath = join(pathOf('cycleLogs'), `cycle-${this.id}.log`)
  }

  /**
   * The log's descriptor, opened to append on first use. When the log cannot
   * be opened at all, what would have gone to it goes nowhere (`/dev/null`):
   * the journal still has the cycle's own lines.
   */
  log() {
    if (this.logFd === -1) {
      try {
        this.logFd = openSync(this.logPath, 'a')
      } catch {
        this.logFd = openSync('/dev/null', 'a')
      }
    }
    return this.logFd
  }

  /**
   * A line of the cycle's own, to the log and the journal:
   * `echo "…" | tee -a "$LOG"`.
   *
   * @param {string} [line]
   */
  say(line = '') {
    put(this.log(), `${line}\n`)
    put(1, `${line}\n`)
  }

  /** Text for the log alone, as it stands. @param {string} text */
  logOnly(text) {
    put(this.log(), text)
  }

  /**
   * The cycle's first line. It starts the log over: the script wrote this one
   * with `tee` and every later one with `tee -a`, so a second cycle in the
   * same minute replaces the first one's log rather than adding to it.
   */
  banner() {
    if (this.logFd !== -1) closeSync(this.logFd)
    this.logFd = -1
    try {
      closeSync(openSync(this.logPath, 'w'))
    } catch {
      /* `log()` deals with a log that cannot be opened */
    }
    this.say('=== zuhd.news editorial cycle ===')
    this.say(`Started: ${when.bare(this.clock())}`)
  }

  /** The two lines that open a stage in the log. @param {string} heading what follows `--- ` */
  header(heading) {
    this.say()
    this.say(`--- ${heading} ---`)
  }

  // ── Commands ───────────────────────────────────────────────────────

  /**
   * The environment a child is started in.
   *
   * @param {Record<string, string>} [extra] for this one command, as `VAR=x cmd` gave it
   */
  childEnv(extra) {
    return /** @type {NodeJS.ProcessEnv} */ (extra ? { ...this.env, ...extra } : this.env)
  }

  /**
   * Start a command, wait for it, and send its output where the script did.
   *
   * `tee` is read as the command writes, so a stage's lines reach the log
   * while it runs: the dashboard follows the log, and a cycle killed half way
   * leaves what it had said. Both streams come down one pipe, joined by the
   * shell before the command starts, or an error line and the line before it
   * could change places.
   *
   * @param {string[]} argv the command and its arguments; found through PATH
   * @param {{ route?: Route, env?: Record<string, string>, into?: string }} [opts]
   *   `into` sends stdout to a file instead, emptied first: the shell's `> file`
   * @returns {Promise<number>} its exit status; 127 when it could not be started
   */
  async run(argv, { route = 'tee', env, into } = {}) {
    if (route !== 'tee') {
      const file = into === undefined ? -1 : openSync(into, 'w')
      const out = file !== -1 ? file : route === 'log' ? this.log() : 'inherit'
      const err = route === 'plain' ? 'inherit' : this.log()
      try {
        return await exited(spawn(argv[0], argv.slice(1), { stdio: ['inherit', out, err], env: this.childEnv(env) }))
      } finally {
        if (file !== -1) closeSync(file)
      }
    }
    const log = this.log()
    const child = spawn('/bin/sh', ['-c', 'exec "$@" 2>&1', 'sh', ...argv], { stdio: ['inherit', 'pipe', 'inherit'], env: this.childEnv(env) })
    child.stdout.on('data', (chunk) => {
      put(log, chunk)
      put(1, chunk)
    })
    return exited(child)
  }

  /**
   * Start a command and read what it prints: `X=$(cmd)`. The newlines at the
   * end of its output are dropped, as the shell dropped them.
   *
   * @param {string[]} argv
   * @param {{ err?: ErrRoute, env?: Record<string, string>, input?: string }} [opts]
   * @returns {Promise<{ status: number, out: string, raw: string }>} `raw` is the output as printed
   */
  async read(argv, { err = 'quiet', env, input } = {}) {
    const stderr = err === 'quiet' ? 'ignore' : err === 'journal' ? 'inherit' : this.log()
    const child = spawn(argv[0], argv.slice(1), { stdio: [input === undefined ? 'inherit' : 'pipe', 'pipe', stderr], env: this.childEnv(env) })
    return printed(child, input)
  }

  /**
   * Start a command and read both its streams as one, in the order written:
   * `X=$(cmd 2>&1)`.
   *
   * @param {string[]} argv
   * @returns {Promise<{ status: number, out: string, raw: string }>}
   */
  async readBoth(argv) {
    return printed(spawn('/bin/sh', ['-c', 'exec "$@" 2>&1', 'sh', ...argv], { stdio: ['inherit', 'pipe', 'inherit'], env: this.childEnv() }))
  }

  // ── What the script's functions did ────────────────────────────────

  /**
   * Keep the selection as it stands beside the cycle's record:
   * `logs/runs/<id>/selection.<step>.json`. `/tmp/zuhd-selection.json` is one
   * file that four stages write in turn and the next cycle deletes, so which
   * story was dropped where could only be read off the log's prose. Never the
   * cycle's business if it fails: no stage reads these.
   *
   * @param {string} step `1-selected`, `2-enriched`, `3-deduped`, `4-offered`
   */
  keepSelection(step) {
    try {
      const dir = join(pathOf('cycleRuns'), this.id)
      mkdirSync(dir, { recursive: true })
      copyFileSync(pathOf('selection'), join(dir, `selection.${step}.json`))
    } catch {
      /* a copy for people, not for the cycle */
    }
  }

  /**
   * Commit exactly the paths named, leaving anything else a person has staged
   * alone.
   *
   * `git add X && git commit` does *not* commit only X. A bare `git commit`
   * writes the whole index, so any change already staged in the working tree
   * rides along under this cycle's message. Not hypothetical: on 2026-07-30 a
   * staged `public/og-image.png` deletion, mid-edit and not ready, was
   * published inside "Editorial cycle 2026-07-30 17:21 UTC: 12 articles".
   *
   * `--only` is the fix and has one sharp edge: a pathspec matching nothing
   * known to git aborts the entire commit. `content/.context-briefs.json` is
   * exactly that risk, so a path is passed on only if it exists on disk or
   * git already tracks it. An empty list is a no-op rather than a `git commit`
   * with no pathspec, which would be the original bug again.
   *
   * The `git add` is still required and is not the bug: `--only` sees only
   * what git already knows about, so a *new* article, which is most of what a
   * cycle produces, is silently skipped without it.
   *
   * @param {string} message
   * @param {(keyof typeof DATASETS)[]} datasets what to commit, by name
   */
  async commitOnly(message, datasets) {
    const paths = datasets.map(pathspec)
    const kept = []
    for (const p of paths) {
      if (existsSync(join(ROOT, p)) || (await exited(spawn('git', ['ls-files', '--error-unmatch', p], { stdio: 'ignore', env: this.childEnv() }))) === 0) kept.push(p)
    }
    if (kept.length === 0) {
      this.say(`commit_only: no existing paths among: ${paths.join(' ')} — nothing committed`)
      return
    }
    await this.run(['git', 'add', ...kept])
    await this.run(['git', 'commit', '--only', ...kept, '-m', message])
  }

  /**
   * Pull, install and push: what follows every commit that has to reach the
   * remote. Each may fail and the cycle goes on, with a line that says so.
   *
   * `--autostash`: the working tree always carries uncommitted churn that a
   * plain `pull --rebase` refuses to run over, which let the remote drift
   * unmerged and every later push fail (2026-05-22 to 27). The install picks
   * up any build dependency the pull brought, so the next build does not
   * crash on a missing module.
   */
  async sync() {
    if ((await this.run(['git', 'pull', '--rebase', '--autostash', 'origin', 'master'])) !== 0) {
      this.say('WARNING: git pull --rebase failed (likely a mobile/backend file overlap — investigate)')
    }
    if ((await this.run(['npm', 'install', '--no-audit', '--no-fund'])) !== 0) this.say('WARNING: npm install after pull failed')
    if ((await this.run(['git', 'push', 'origin', 'master'])) !== 0) this.say('WARNING: git push failed')
  }

  /**
   * Build the site, trying again while another build holds the lock. The lock
   * stops two builds racing `dist/`, but a long-lived local `npm run dev`
   * rebuilds on every article write and can hold it right when this starts,
   * which once cost six of seven cycles their publication. A dev build takes
   * seconds; three tries 20 s apart clears it.
   *
   * @returns {Promise<number>} the build's exit status
   */
  async build() {
    for (let attempt = 1; ; attempt++) {
      const { status, out } = await this.readBoth(['node', 'scripts/build.js'])
      this.say(out)
      if (status === 0 || attempt >= 3 || !out.includes('Another build is already running')) return status
      this.say(`Build lock held — retrying in 20s (attempt ${attempt}/3)`)
      await exited(spawn('sleep', ['20'], { stdio: 'inherit', env: this.childEnv() }))
    }
  }

  // ── The way out ────────────────────────────────────────────────────

  /**
   * What the script's exit trap did, whichever way the cycle ends: the funnel,
   * the alert or its removal, the two prunes, and the cycle's record. Once.
   *
   * @param {number} status the cycle's exit status
   */
  finish(status) {
    if (this.finished) return
    this.finished = true
    const f = this.funnel
    this.say()
    // Funnel summary — one glance to see where stories were gained or lost
    this.say('=== Funnel ===')
    this.say(`Feed:      ${f.feed || '?'}`)
    this.say(`Selected:  ${f.selected ?? 0}`)
    this.say(`Deduped:   ${f.deduped ?? 0}${f.dedupNote ? ` (${f.dedupNote})` : ''}`)
    this.say(`Written:   ${f.written ?? 0}`)
    this.say(`Validated: ${f.validated ?? 0}${f.validNote ? ` (${f.validNote})` : ''}`)
    this.say(`Published: ${f.published ?? 0}`)
    this.say()
    this.say(`Finished: ${when.bare(this.clock())} — total ${this.seconds()}s`)

    this.alert(status)
    const logs = pathOf('cycleLogs')
    spawnSync('find', [logs, '-name', 'cycle-*.log', '-mtime', '+7', '-delete'], { stdio: 'ignore' })
    spawnSync('find', [pathOf('cycleRuns'), '-name', 'selection.*.json', '-mtime', '+7', '-delete'], { stdio: 'ignore' })
    // The cycle as a record: logs/runs/<id>/run.json and a line in
    // logs/cycles.jsonl, read back out of the log this has just finished
    // (scripts/cycle/record.js). Last, and behind a timeout. What it prints
    // goes to the journal, not into the log it reads.
    spawnSync('timeout', ['30', 'node', join(ROOT, 'scripts', 'cycle', 'record.js'), this.logPath], {
      stdio: 'inherit',
      env: this.childEnv({ ZUHD_EXIT_STATUS: String(status), ZUHD_START_HOUR: this.startHour, ZUHD_DAILY_HOUR: DAILY_HOUR }),
    })
    if (this.logFd !== -1) closeSync(this.logFd)
    this.logFd = -1
  }

  /**
   * A cycle that ends without publishing leaves `content/.cycle-alert.json`
   * and a loud ALERT line; the first one that publishes clears it. The count
   * it carries is what tells a single quiet cycle (everything already
   * covered) from a dead pipeline.
   *
   * @param {number} status
   */
  alert(status) {
    const file = pathOf('cycleAlert')
    if ((this.funnel.published ?? 0) > 0) {
      rmSync(file, { force: true })
      return
    }
    let reason = 'no articles published'
    let log = ''
    try {
      log = readFileSync(this.logPath, 'utf8')
    } catch {
      /* no log to read: the reason stays the plain one */
    }
    if (/Failed to authenticate|OAuth (session|token).*(expired|invalid)|Please run \/login/i.test(log)) {
      reason = "claude CLI authentication failed — re-run 'claude' interactively on the server to log in"
    } else if (status !== 0) {
      reason = `cycle exited ${status} before publishing`
    }
    const env = this.childEnv({ CYCLE_ALERT: file, ALERT_REASON: reason, ALERT_LOG: this.logPath })
    const res = spawnSync('/bin/sh', ['-c', 'exec "$@" 2>&1', 'sh', 'node', join(ROOT, 'scripts', 'cycle', 'alert.js')], { stdio: ['inherit', 'pipe', 'inherit'], env })
    if (res.stdout?.length) {
      put(this.log(), res.stdout)
      put(1, res.stdout)
    }
  }
}

/**
 * The cycle that also runs the daily jobs (full indicator dispatch, events,
 * analytics, audio briefing). The first cycle of the news day: the schedule
 * (05, 10, 14, 18, 22 UTC since 2026-09-25) follows when English-language news
 * is published — quiet 23-06 UTC, peaking 14-20 — so this one sees the whole
 * previous day closed plus Asia's morning.
 */
export const DAILY_HOUR = '05'

/** The cycle that also runs the day's tuning; on a Sunday, the weekly quality scan too. */
export const TUNING_HOUR = '22'

// ── Running the list ─────────────────────────────────────────────────

/** @typedef {import('../cycle/stages.js').Stage} Stage */

/**
 * Which of the cycles a moment's cycle is.
 *
 * @param {string} hour the hour it started, `05`
 * @param {string} weekday `1` to `7`, Sunday last
 */
export const kindOf = (hour, weekday) => ({
  daily: hour === DAILY_HOUR,
  'not-daily': hour !== DAILY_HOUR,
  tuning: hour === TUNING_HOUR,
  weekly: weekday === '7' && hour === TUNING_HOUR,
})

/**
 * Whether the cycle has what a stage needs by the time it comes to it.
 *
 * @param {Cycle} cycle
 * @param {Stage['needs']} needs
 */
function has(cycle, needs) {
  const { articles, buildExit, deployExit } = cycle.state
  if (!needs) return true
  if (!articles) return false
  if (needs === 'articles') return true
  if (buildExit !== 0) return false
  return needs === 'built' || deployExit === 0
}

/**
 * Run one stage: its header, what it runs, and what the log says after.
 *
 * @param {Cycle} cycle
 * @param {Stage} stage
 */
export async function runStage(cycle, stage) {
  if (stage.on && !kindOf(cycle.startHour, when.weekday(cycle.clock()))[stage.on]) {
    if (stage.skipped) cycle.header(`Stage ${stage.number}: ${stage.title} (${stage.skipped(cycle)})`)
    return
  }
  if (!has(cycle, stage.needs)) return

  if (stage.title) cycle.header(`Stage ${stage.number}: ${stage.title}`)
  const took = cycle.timer()
  stage.before?.(cycle)
  if (stage.run) {
    await stage.run(cycle)
  } else if (stage.command) {
    const argv = stage.timeout ? ['timeout', String(stage.timeout), ...stage.command] : stage.command
    const status = await cycle.run(argv, { route: stage.route })
    if (status !== 0 && stage.warning) cycle.say(stage.warning)
    if (stage.exit) cycle.say(`${stage.exit} exit: ${status}${stage.timed ? ` — ${took()}s` : ''}`)
  }
  if (stage.took) cycle.say(`${stage.took} — ${took()}s`)
  if (stage.commit) await cycle.commitOnly(`${stage.commit.message} ${when.minute(cycle.clock())}`, stage.commit.datasets)
  await stage.after?.(cycle)
}

/**
 * A cycle, from its first line to its last.
 *
 * @param {Stage[]} stages
 * @param {{ clock?: () => Date, env?: Record<string, string | undefined> }} [opts]
 * @returns {Promise<number>} the cycle's exit status
 */
export async function runCycle(stages, opts) {
  const cycle = new Cycle(opts)
  // The writer's model, for every stage that follows it (`lib/models.js`).
  cycle.env.ZUHD_MODEL = cycle.env.ZUHD_MODEL || SESSION_MODEL
  cycle.name()

  // The cycle's identity: the log's own stamp, when it began, and the commit
  // it began from. In the environment, so the record the way out writes can
  // carry them and any stage can read them.
  const started = when.iso(cycle.clock())
  const head = (await cycle.read(['git', '-C', ROOT.replace(/\/$/, ''), 'rev-parse', 'HEAD'])).out
  Object.assign(cycle.env, { ZUHD_RUN_ID: cycle.id, ZUHD_RUN_STARTED: started, ZUHD_GIT_HEAD: head })

  /** @param {number} status */
  const end = (status) => {
    cycle.finish(status)
    return status
  }
  // systemd stops the unit by signalling every process in it. What the way out
  // does is synchronous, so it is done here, at once; then the signal is let
  // through and ends this process as it would have.
  //
  // The status handed on is 0, because that is what the script's exit trap
  // saw: bash gives a trap the status of the last command to finish, not of
  // the signal, so a cycle stopped at its deadline has always been recorded as
  // one that exited 0 without publishing. Kept for now; saying 143 changes
  // what the alert and the record hold.
  for (const signal of /** @type {const} */ (['SIGHUP', 'SIGINT', 'SIGTERM'])) {
    process.once(signal, () => {
      end(0)
      process.kill(process.pid, signal)
    })
  }

  // Whatever goes wrong in this process, the way out is still taken.
  for (const event of /** @type {const} */ (['uncaughtException', 'unhandledRejection'])) {
    process.once(event, (err) => {
      put(2, `${/** @type {Error} */ (err)?.stack ?? err}\n`)
      process.exit(end(1))
    })
  }

  try {
    process.chdir(ROOT)
    // The start hour decides the cycle's kind, not the clock twenty minutes in.
    cycle.startHour = when.hour(cycle.clock())
    cycle.banner()
    // Clear the last cycle's selection, so a selector that fails cannot leave the writer yesterday's picks.
    for (const name of /** @type {const} */ (['selection', 'newArticles', 'feed'])) rmSync(pathOf(name), { force: true })
    for (const stage of stages) await runStage(cycle, stage)
    return end(0)
  } catch (err) {
    if (err instanceof CycleExit) return end(err.status)
    put(2, `${/** @type {Error} */ (err)?.stack ?? err}\n`)
    return end(1)
  }
}

/**
 * What a cycle at an hour would run, one stage a line. Conditions the cycle
 * only learns on the way (new articles, a build, a deploy) are named, not
 * decided.
 *
 * @param {Stage[]} stages
 * @param {string} hour `05`
 * @param {string} weekday `1` to `7`
 */
export function plan(stages, hour, weekday) {
  const kind = kindOf(hour, weekday)
  const lines = [`A cycle starting ${hour}:00 UTC on weekday ${weekday}${kind.daily ? ', with the daily jobs' : ''}${kind.tuning ? ', with the tuning' : ''}${kind.weekly ? ' and the weekly scan' : ''}:`]
  for (const s of stages) {
    if (s.on && !kind[s.on]) continue
    const what = s.command ? s.command.join(' ') : '(several steps)'
    const limit = s.timeout ? `${s.timeout}s` : ''
    const needs = s.needs ? `if ${s.needs}` : ''
    lines.push(`  ${(s.number ?? '').padEnd(6)} ${s.id.padEnd(24)} ${limit.padEnd(6)} ${needs.padEnd(12)} ${what}`.trimEnd())
  }
  return lines.join('\n')
}
