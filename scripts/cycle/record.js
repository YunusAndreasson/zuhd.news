#!/usr/bin/env node
// The record of one cycle: `logs/runs/<id>/run.json`, and its line in
// `logs/cycles.jsonl`.
//
// What a cycle did used to be readable only out of its log, by regex, for the
// seven days the log is kept. The record says it as data — which stages ran
// and how each exited, the funnel, the commits, the articles and what became
// of each — and the series is never rotated. It is read back out of the log
// for now (`lib/cycle-log.js`), plus the few things only the exit trap knows,
// which arrive in the environment.
//
//   node scripts/cycle/record.js <cycle log>   the last thing run-cycle.sh's exit trap does
//   node scripts/cycle/record.js --backfill    a record for each log on disk that has none
//   node scripts/cycle/record.js --backfill --force   …rebuilding the ones that do

import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { hasFlag } from '../lib/argv.js'
import { cycleIdOf, parseCycleLog, runRecord } from '../lib/cycle-log.js'
import { writeJson } from '../lib/json-file.js'
import { ROOT } from '../lib/paths.js'

const LOGS_DIR = join(ROOT, 'logs')
const RUNS_DIR = join(LOGS_DIR, 'runs')
const SERIES = join(LOGS_DIR, 'cycles.jsonl')
// The batch run-cycle.sh lists for the editor. Read only by the trap's call,
// and only when it is this cycle's: the file outlives the cycle that wrote it.
const NEW_ARTICLES = '/tmp/zuhd-new-articles.txt'

const runPath = (id) => join(RUNS_DIR, id, 'run.json')

/** Whether `scripts/` differs from the commit it was checked out at. Null when git cannot say. */
function scriptsDirty() {
  try {
    const out = execFileSync('git', ['status', '--porcelain', '--', 'scripts'], {
      cwd: ROOT,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out.trim().length > 0
  } catch {
    return null
  }
}

/** The slugs the writer left this cycle, or none when the list on disk is an earlier cycle's. */
function writtenSince(startedAt) {
  try {
    if (!startedAt || statSync(NEW_ARTICLES).mtimeMs < Date.parse(startedAt)) return []
    return readFileSync(NEW_ARTICLES, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((f) => f.replace(/^.*\//, '').replace(/\.md$/, ''))
  } catch {
    return []
  }
}

/**
 * Put `records` into the series, each replacing the line that carries its id.
 *
 * The series is the only copy of every cycle older than a week, so a line
 * that does not parse is never the reason to rewrite the file: the new
 * records are appended instead, and a duplicate id is the lesser loss.
 *
 * @param {import('../lib/schema.js').RunRecord[]} records
 */
function upsertSeries(records) {
  mkdirSync(LOGS_DIR, { recursive: true })
  const lines = existsSync(SERIES) ? readFileSync(SERIES, 'utf-8').split('\n').filter(Boolean) : []
  /** @type {Map<string, string>} */
  const byId = new Map()
  try {
    for (const line of lines) byId.set(JSON.parse(line).id, line)
  } catch (err) {
    console.error(`record: ${SERIES} has a line that is not JSON (${err.message}) — appending, not rewriting`)
    appendFileSync(SERIES, records.map((r) => `${JSON.stringify(r)}\n`).join(''))
    return
  }
  for (const r of records) byId.set(r.id, JSON.stringify(r))
  const sorted = [...byId.keys()].sort().map((id) => byId.get(id))
  const tmp = `${SERIES}.${process.pid}.tmp`
  writeFileSync(tmp, `${sorted.join('\n')}\n`)
  renameSync(tmp, SERIES)
}

if (hasFlag('backfill')) {
  const force = hasFlag('force')
  const logs = existsSync(LOGS_DIR) ? readdirSync(LOGS_DIR).filter((f) => cycleIdOf(f)).sort() : []
  const records = []
  for (const f of logs) {
    const id = /** @type {string} */ (cycleIdOf(f))
    // A record the trap wrote knows more than its log does.
    if (!force && existsSync(runPath(id))) continue
    records.push(runRecord(parseCycleLog(readFileSync(join(LOGS_DIR, f), 'utf-8')), { id }))
  }
  for (const r of records) writeJson(runPath(r.id), r)
  if (records.length) upsertSeries(records)
  console.log(`Run records: ${records.length} written from ${logs.length} cycle logs`)
} else {
  const logPath = process.argv.slice(2).find((a) => !a.startsWith('--'))
  const id = process.env.ZUHD_RUN_ID || (logPath && cycleIdOf(logPath))
  if (!logPath || !id) {
    console.error('usage: record.js <cycle log> | --backfill [--force]')
    process.exit(2)
  }
  const log = parseCycleLog(readFileSync(logPath, 'utf-8'))
  const exit = Number.parseInt(process.env.ZUHD_EXIT_STATUS ?? '', 10)
  const record = runRecord(log, {
    id,
    exit: Number.isNaN(exit) ? null : exit,
    startedAt: process.env.ZUHD_RUN_STARTED || null,
    gitHead: process.env.ZUHD_GIT_HEAD || null,
    scriptsDirty: scriptsDirty(),
    startHour: process.env.ZUHD_START_HOUR || null,
    dailyHour: process.env.ZUHD_DAILY_HOUR || null,
    written: writtenSince(process.env.ZUHD_RUN_STARTED),
  })
  writeJson(runPath(id), record)
  upsertSeries([record])
  console.log(`Run record: logs/runs/${id}/run.json`)
}
