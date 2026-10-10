#!/usr/bin/env node
// zuhd.news pipeline dashboard — port 7777, zero dependencies
//
// It reads: the cycle logs, the snapshots and logs each source leaves, the
// metrics and trend files, the built feed, and what systemd says of the
// cycle's units. It starts nothing else and writes nothing: the page is
// public, and every route is a GET.

import { createServer } from 'node:http'
import { readFileSync, readdirSync, existsSync, statSync, watch } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { tryReadArticle } from '../lib/article.js'
import { cycleIdOf, parseCycleLog } from '../lib/cycle-log.js'
import { pathOf } from '../lib/datasets.js'
import { scoreDir } from '../lib/quality-score.js'
import { regionFromCoords } from '../lib/regions.js'
import { ROOT } from '../lib/paths.js'
import { latestTrendsPath } from '../lib/trends-snapshot.js'
import { SENT, SYSTEMD_SHOW, WRITING_TARGETS, abortCause, byFileState, cycleFacts, cycleStatus, cycleView, isCycleLog, listener, nextLog, systemdView, tailOf, writingBreaches } from './data.js'
import { sourcesView } from './sources.js'

// Loopback unless the unit says otherwise: `DASHBOARD_HOST=0.0.0.0` in
// `zuhd-dashboard.service` is what puts the page on the public address. A
// second copy for looking at a change takes another `DASHBOARD_PORT`.
const PORT = Number(process.env.DASHBOARD_PORT) || 7777
const HOST = process.env.DASHBOARD_HOST || '127.0.0.1'

// Where the state is, by its name in the catalog (`lib/datasets.js`). The
// built site is not state, and is spelled.
const LOGS_DIR = pathOf('cycleLogs')
const ARTICLES_DIR = pathOf('articles')
const DIST_DIR = join(ROOT, 'dist')
const DASHBOARD_DIR = join(ROOT, 'scripts', 'dashboard')

// ── Cycle logs ──────────────────────────────────────────────────────

/**
 * A log, read by `lib/cycle-log.js`, once for as long as the file stays as it
 * is. Six answers are made from the logs and each parsed every file for
 * itself: a week of them, 42 files and 3.5 MB, up to five times on one
 * refresh of the page and again every fifteen seconds for the overview. A
 * finished log never changes; only the running cycle's is read again.
 */
const logOf = byFileState((path) => {
  const text = readFileSync(path, 'utf-8')
  const log = parseCycleLog(text)
  return { ...log, cause: abortCause(text, log.abort) }
})

/** The cycle logs on disk, newest first. */
function getLogFiles() {
  if (!existsSync(LOGS_DIR)) return []
  const files = readdirSync(LOGS_DIR).filter(isCycleLog).sort().reverse()
  logOf.only(files.map((f) => join(LOGS_DIR, f)))
  return files
}

/** A log by its name, or null: a cycle prunes week-old logs as it ends, between a listing and a read. */
function logAt(filename) {
  try {
    return logOf(join(LOGS_DIR, filename))
  } catch {
    return null
  }
}

function getAllCycles() {
  return getLogFiles().flatMap((f) => {
    const log = logAt(f)
    return log ? [cycleView(log, f)] : []
  })
}

function getLogTail(filename, lines = 50) {
  try {
    return readFileSync(join(LOGS_DIR, filename), 'utf-8').split('\n').slice(-lines).join('\n')
  } catch {
    return ''
  }
}

// ── Systemd Queries ─────────────────────────────────────────────────

/**
 * One question to systemd, with a deadline. `spawnSync` and not `execSync`:
 * whatever status `systemctl` exits with, what it printed is what is read
 * (`systemdView`), and a call that fails or runs out of time reads as nothing
 * known rather than taking the request down.
 */
function systemdStatus() {
  const res = spawnSync('systemctl', SYSTEMD_SHOW, { encoding: 'utf-8', timeout: 2000 })
  return systemdView(res.stdout)
}

// ── What a dataset says ─────────────────────────────────────────────

/** A JSON file parsed, once for as long as it stays as it is; null when it is missing or not JSON. */
const jsonAt = byFileState((path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
})

/** @param {string} path */
function readPath(path) {
  try {
    return jsonAt(path)
  } catch {
    return null
  }
}

/** A dataset by its name in the catalog, parsed, or null. */
const readDataset = (name) => readPath(name === 'trendsLatest' ? (latestTrendsPath() ?? '') : pathOf(name))

// ── Articles Per Day ────────────────────────────────────────────────

function articlesPerDay(days = 7) {
  if (!existsSync(ARTICLES_DIR)) return {}
  const files = readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.md'))
  const counts = {}
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
    counts[d] = files.filter(f => f.startsWith(d)).length
  }
  return counts
}

/**
 * An article's category, read through the parser once for as long as the file
 * stays as it is: the two charts below ask for every article of a week, or of
 * an experiment's whole run, on each refresh.
 */
const categoryAt = byFileState((path) => {
  const { article } = tryReadArticle(path)
  return article ? String(article.meta.category ?? '') : ''
})

/** How many of these article files are in each category, and how many there are. */
function categoryCounts(files) {
  const counts = { politics: 0, economy: 0, science: 0, tech: 0, total: 0 }
  for (const f of files) {
    try {
      const category = categoryAt(join(ARTICLES_DIR, f))
      if (category !== 'total' && Object.hasOwn(counts, category)) counts[category]++
      counts.total++
    } catch {}
  }
  return counts
}

function categoriesPerDay(days = 7) {
  if (!existsSync(ARTICLES_DIR)) return []
  const files = readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.md'))
  const result = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
    const { total: _total, ...cats } = categoryCounts(files.filter(f => f.startsWith(d)))
    result.push({ date: d, ...cats })
  }
  return result
}

// ── Caching ─────────────────────────────────────────────────────────

const cache = {}

function cached(key, ttlMs, fn) {
  const now = Date.now()
  if (cache[key] && cache[key].staleAt > now) return cache[key].data
  const data = fn()
  cache[key] = { data, staleAt: now + ttlMs }
  return data
}

function clearCaches() {
  for (const k of Object.keys(cache)) delete cache[k]
}

// ── Route Handlers ──────────────────────────────────────────────────

/** Every source and whether it is working: `sources.js`. */
function handleSources() {
  return cached('sources', 60_000, () => {
    const cycles = getLogFiles().flatMap((f) => {
      const log = logAt(f)
      return log ? [cycleFacts(log, f)] : []
    })
    return { now: new Date().toISOString(), ...sourcesView({ read: readDataset, cycles }) }
  })
}

function handleOverview() {
  return cached('overview', 15_000, () => {
    const cycles = getAllCycles()
    const last = cycles.find((c) => c.completed) || null
    const meta = readPath(join(DIST_DIR, 'api', 'meta.json'))
    const metaAge = meta?.generated ? (Date.now() - new Date(meta.generated).getTime()) / 3600000 : null
    const sd = systemdStatus()
    const alert = readDataset('cycleAlert')
    const { status, why } = cycleStatus({ cycles, metaGenerated: meta?.generated ?? null, systemd: sd, alert, sources: handleSources().summary })
    // A log with no last line is a cycle running only while systemd says one
    // is: a cycle that was killed leaves the same log.
    const running = cycles[0] && !cycles[0].completed && sd.serviceActive ? cycles[0] : null

    return {
      now: new Date().toISOString(),
      metaAge: metaAge !== null ? Math.round(metaAge * 10) / 10 : null,
      serviceActive: sd.serviceActive,
      serviceState: sd.serviceState,
      timerActive: sd.timerActive,
      nextFire: sd.nextFire,
      lastTrigger: sd.lastTrigger,
      alert,
      lastCycle: last ? {
        filename: last.filename,
        date: last.date,
        scheduledHour: last.scheduledHour,
        totalSeconds: last.totalSeconds,
        published: last.funnel.published,
        target: last.target,
        finishedAt: last.finishedAt,
        aborted: last.aborted,
        benign: last.benign,
        cause: last.cause,
      } : null,
      runningCycle: running ? {
        filename: running.filename,
        startedAt: running.startedAt,
        stages: running.stages,
        allStages: running.allStages,
      } : null,
      status,
      why,
    }
  })
}

function handleCycles() {
  return cached('cycles', 120_000, () => getAllCycles())
}

function handleCycleDetail(filename) {
  // Only a cycle log's own name reaches the disk.
  if (!isCycleLog(filename)) return null
  const log = logAt(filename)
  return log ? { ...cycleView(log, filename), tail: getLogTail(filename, 50) } : null
}

function handleQuality() {
  return cached('quality', 300_000, () => {
    const result = { categories: null, sources: null, regions: null, freshness: null, articlesPerDay: articlesPerDay(7) }

    // From feed.json
    const feedPath = join(DIST_DIR, 'api', 'feed.json')
    if (existsSync(feedPath)) {
      try {
        const feed = JSON.parse(readFileSync(feedPath, 'utf-8'))
        // Category counts
        result.categories = {}
        for (const [cat, articles] of Object.entries(feed.categories || {})) {
          result.categories[cat] = articles.length
        }
        // Source + region diversity from today's articles
        const allArticles = Object.values(feed.categories || {}).flat()
        const sourceMap = {}
        const regionMap = {}
        for (const a of allArticles) {
          for (const s of (a.sources || [])) {
            sourceMap[s.name] = (sourceMap[s.name] || 0) + 1
          }
          const region = regionFromCoords(a.lat, a.lng) ?? 'unknown'
          regionMap[region] = (regionMap[region] || 0) + 1
        }
        result.sources = { unique: Object.keys(sourceMap).length, top: Object.entries(sourceMap).sort((a, b) => b[1] - a[1]).slice(0, 8) }
        result.regions = regionMap
      } catch {}
    }

    // From the day's metrics, when the tuning stage has left them
    const metricsPath = pathOf('metrics')
    if (existsSync(metricsPath)) {
      try {
        const m = JSON.parse(readFileSync(metricsPath, 'utf-8'))
        if (m.freshness?.today) result.freshness = m.freshness.today
        result.duplicates = m.duplicates?.today || null
      } catch {}
    }

    // Validation failures from logs (7 days)
    const cycles = getAllCycles()
    let totalRemoved = 0
    for (const c of cycles) {
      const removed = c.funnel.written - c.funnel.validated
      if (removed > 0) totalRemoved += removed
    }
    result.validationFailures = totalRemoved
    result.categoriesPerDay = categoriesPerDay(7)

    return result
  })
}

// ── Writing Quality (from measure-quality.js trend file) ───────────

function handleWritingQuality() {
  return cached('writing-quality', 60_000, () => {
    const trendPath = pathOf('qualityTrend')
    if (!existsSync(trendPath)) return { current: null, history: [], delta: null }
    let trend = []
    try { trend = JSON.parse(readFileSync(trendPath, 'utf-8')) } catch { return { current: null, history: [], delta: null } }
    if (trend.length === 0) return { current: null, history: [], delta: null }
    const current = trend[trend.length - 1]
    const prior = trend.length >= 2 ? trend[trend.length - 2] : null
    const delta = {}
    if (prior) {
      for (const k of Object.keys(current.metrics)) {
        const a = current.metrics[k]
        const b = prior.metrics[k]
        if (typeof a === 'number' && typeof b === 'number') {
          delta[k] = +(a - b).toFixed(1)
        }
      }
    }
    return { current, delta, history: trend.slice(-12), targets: WRITING_TARGETS, breaches: writingBreaches(current.metrics) }
  })
}

// Per-article objective quality scoring (specificity, hedges, title-echo),
// over the most recent N articles, computed on a request. There is no trend:
// the one there was kept a day's mean whenever someone opened the tab, which
// in five months was twice, and a GET on a public page wrote a tracked file
// to keep it.
function handleSpecificity() {
  return cached('specificity', 5 * 60_000, () => {
    if (!existsSync(ARTICLES_DIR)) return { current: null, worst: [] }

    const N = 60
    const { rows, mean } = scoreDir(ARTICLES_DIR, N)
    if (!mean) return { current: null, worst: [] }

    const current = {
      articleCount: mean.articleCount,
      specificity: +mean.specificity.toFixed(2),
      digits: +mean.digits.toFixed(2),
      properNouns: +mean.properNouns.toFixed(2),
      hedges: +mean.hedges.toFixed(3),
      titleEcho: +mean.titleEcho.toFixed(3),
      sentences: +mean.sentences.toFixed(2),
    }
    // Bottom 5 by specificity for drill-down
    const worst = rows.slice().sort((a, b) => a.specificity - b.specificity).slice(0, 5).map(r => ({
      file: r.file, specificity: r.specificity, digits: r.digits, hedges: r.hedges, titleEcho: +r.titleEcho.toFixed(2),
    }))

    return { current, worst, windowArticles: N }
  })
}

// Article-image preview: the latest articles' source-level image URLs.
function handleArticleImages() {
  return cached('article-images', 5 * 60_000, () => {
    if (!existsSync(ARTICLES_DIR)) return { articles: [], total: 0, withImage: 0 }

    const files = readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.md')).sort().reverse().slice(0, 30)
    const out = []
    let withImage = 0
    for (const f of files) {
      const { article } = tryReadArticle(join(ARTICLES_DIR, f))
      if (!article) continue
      const { meta } = article
      // A `date:` written without quotes is a date to YAML, not a string.
      const date = /** @type {unknown} */ (meta.date)
      const images = (Array.isArray(meta.sources) ? meta.sources : [])
        .filter((src) => src?.name && src?.image)
        .map((src) => ({ source: String(src.name), url: String(src.image) }))
      if (images.length) withImage++
      out.push({
        slug: article.slug,
        title: String(meta.title || f),
        date: date instanceof Date ? date.toISOString() : String(date ?? ''),
        category: String(meta.category ?? ''),
        images,
      })
    }
    return { articles: out, total: out.length, withImage }
  })
}

// ── Experiment Tracking ─────────────────────────────────────────────

function handleExperiment() {
  return cached('experiment', 60_000, () => {
    const expPath = pathOf('experiments')
    if (!existsSync(expPath)) return { active: null, history: [], tracking: null }

    const data = JSON.parse(readFileSync(expPath, 'utf-8'))
    const activeAll = Array.isArray(data.activeExperiments)
      ? data.activeExperiments
      : (data.activeExperiment ? [data.activeExperiment] : [])
    const queued = Array.isArray(data.queuedExperiments) ? data.queuedExperiments : []
    const result = {
      active: activeAll[0] || null,
      activeAll,
      queued,
      history: (data.history || []).slice().reverse(),
      tracking: null,
      // A freeze on new experiments, and why: the tab is otherwise empty with no word of it.
      holdUntil: data.noNewExperimentsUntil ?? null,
      holdReason: data.noNewExperimentsUntilReason ?? null,
    }

    // If there's an active experiment, compute daily tracking data
    if (result.active) {
      const exp = result.active
      const startDate = exp.startDate
      const evalDate = exp.evaluateAfter
      const today = new Date().toISOString().slice(0, 10)
      const daysElapsed = Math.floor((Date.now() - new Date(startDate).getTime()) / 86400000)
      const daysTotal = Math.floor((new Date(evalDate).getTime() - new Date(startDate).getTime()) / 86400000)

      // Compute the target metric per day since experiment started
      const articleFiles = existsSync(ARTICLES_DIR) ? readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.md')) : []
      const dailyMetrics = []

      // Include 3 days before start as baseline context
      for (let i = -3; i <= Math.max(daysElapsed, 0); i++) {
        const d = new Date(new Date(startDate).getTime() + i * 86400000).toISOString().slice(0, 10)
        if (d > today) break
        dailyMetrics.push({
          date: d,
          isBaseline: i < 0,
          ...categoryCounts(articleFiles.filter(f => f.startsWith(d))),
        })
      }

      result.tracking = {
        daysElapsed,
        daysTotal,
        startDate,
        evalDate,
        dailyMetrics,
      }
    }

    return result
  })
}

// ── Push Notifications & Audio Briefing ─────────────────────────────

function handleMedia() {
  return cached('media', 120_000, () => {
    const result = { pushHistory: [], briefing: null, channels: {} }

    // Every push a cycle sent: the breaking story's, and the daily briefing's
    for (const f of getLogFiles()) {
      // `2026-10-09_0501`
      const id = cycleIdOf(f)
      for (const push of logAt(f)?.pushes ?? []) {
        if (!push.payload) continue
        result.pushHistory.push({
          kind: push.kind,
          date: id.slice(0, 10),
          hour: `${id.slice(11, 13)}:${id.slice(13, 15)}`,
          articles: push.payload.articles || [],
          title: push.payload.title ?? null,
          pushed: push.response?.pushed ?? null,
          skipped: push.response?.skipped ?? null,
          devices: push.response?.tokens ?? null,
        })
      }
    }

    // The last posts to X and Instagram, newest first: sent, or why not
    for (const [channel, dataset] of [['x', 'tweetLog'], ['instagram', 'instagramLog']]) {
      const log = readDataset(dataset)
      result.channels[channel] = (Array.isArray(log) ? log : []).slice(-8).reverse().map((e) => ({
        timestamp: e.timestamp ?? null,
        slug: e.slug ?? null,
        sent: e.sent === true,
        error: e.error ? String(e.error).slice(0, 160) : null,
      }))
    }

    // Audio briefing meta
    const metaPath = pathOf('briefingMeta')
    if (existsSync(metaPath)) {
      try {
        const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
        // List available briefing files
        const audioDir = pathOf('audio')
        const mp3s = readdirSync(audioDir)
          .filter(f => /^briefing-\d{4}-\d{2}-\d{2}\.mp3$/.test(f))
          .sort()
          .reverse()
          .map(f => {
            const s = statSync(join(audioDir, f))
            return { file: f, date: f.slice(9, 19), sizeMB: Math.round(s.size / 1024 / 1024 * 10) / 10 }
          })
        result.briefing = {
          ...meta,
          durationMin: meta.duration ? Math.round(meta.duration / 60 * 10) / 10 : null,
          ageHours: Math.round((Date.now() - new Date(meta.generated).getTime()) / 3600000 * 10) / 10,
          files: mp3s,
        }
      } catch {}
    }

    return result
  })
}

// ── Operations (NewsAPI tokens) ─────────────────────────────────────

function handleOperations() {
  return cached('operations', 120_000, () => {
    // Last 35 cycles ≈ 7 days at 5 cycles/day
    const cycles = getAllCycles().slice(0, 35).reverse() // chronological
    const series = cycles.map((c) => ({
      filename: c.filename,
      date: c.date,
      hour: c.scheduledHour,
      tokens: c.newsApiTokens,
      published: c.funnel?.published ?? 0,
    }))
    const counted = series.filter((c) => c.tokens != null)
    const tokenSum = counted.reduce((s, c) => s + c.tokens, 0)
    return {
      series,
      summary: {
        cycles: series.length,
        tokenSum,
        // Over the cycles whose log has the figure; 0, not NaN, when none does.
        tokenAvg: counted.length ? Math.round(tokenSum / counted.length) : 0,
      },
    }
  })
}

// ── Production-cycle RVS trend ──────────────────────────────────────

function handleRvsTrend() {
  return cached('rvsTrend', 60_000, () => {
    const path = pathOf('rvsTrend')
    if (!existsSync(path)) return { empty: true }
    let trend = []
    try { trend = JSON.parse(readFileSync(path, 'utf-8')) } catch { return { empty: true, error: 'parse error' } }
    if (trend.length === 0) return { empty: true }
    const recent = trend.slice(-50) // last ~50 cycles ≈ 10 days
    const last = trend[trend.length - 1]
    const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
    const meanCluster = (xs) => {
      const ys = xs.filter((v) => v != null)
      return ys.length ? +avg(ys).toFixed(2) : null
    }
    const summary = {
      latest: last,
      meanLast20: trend.length >= 5 ? +avg(trend.slice(-20).map((r) => r.rvs)).toFixed(2) : null,
      clusterMeansLast20: trend.length >= 5 ? {
        picking: meanCluster(trend.slice(-20).map((r) => r.clusters.picking)),
        writing: meanCluster(trend.slice(-20).map((r) => r.clusters.writing)),
        briefing: meanCluster(trend.slice(-20).map((r) => r.clusters.briefing)),
        sourcing: meanCluster(trend.slice(-20).map((r) => r.clusters.sourcing)),
        coverage: meanCluster(trend.slice(-20).map((r) => r.clusters.coverage)),
      } : null,
      cycleCount: trend.length,
    }
    return { series: recent, summary }
  })
}

// ── Editorial Data ──────────────────────────────────────────────────

function handleEditorial() {
  return cached('editorial', 300_000, () => {
    const result = { audit: null }

    const auditJsonPath = pathOf('dailyAudit')
    if (existsSync(auditJsonPath)) {
      try {
        const stat = statSync(auditJsonPath)
        const data = JSON.parse(readFileSync(auditJsonPath, 'utf-8'))
        result.audit = {
          format: 'json',
          data,
          updatedAt: stat.mtime.toISOString(),
          ageHours: Math.round((Date.now() - stat.mtime.getTime()) / 3600000 * 10) / 10,
        }
      } catch {}
    }

    return result
  })
}

// ── SSE Live Tailing ────────────────────────────────────────────────

/**
 * The newest log, a line at a time as it is written, and the next cycle's
 * when one starts.
 *
 * It used to hold on to the log that was newest when the page connected. A
 * tab opened before a cycle saw that cycle's start announced and none of its
 * lines, and the announcement came again with every line written.
 */
function handleLive(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })
  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`)

  /** @type {string | null} */
  let following = null
  let tail = null
  let debounceTimer = null

  const sendNew = () => {
    const lines = tail ? tail.read() : []
    for (const line of lines) send({ type: 'line', text: line })
    if (lines.some((line) => line.startsWith('Finished:'))) {
      send({ type: 'complete' })
      clearCaches()
    }
  }
  /** @param {string} filename @param {'start' | 'end'} from */
  const follow = (filename, from) => {
    following = filename
    tail = tailOf(join(LOGS_DIR, filename), from)
  }

  const newest = getLogFiles()[0]
  if (newest) follow(newest, 'end')
  send(newest ? { type: systemdStatus().serviceActive ? 'running' : 'idle', filename: newest } : { type: 'idle' })

  // One watch on the directory tells of both: a line written to the log being
  // followed, and a new log, which is a new cycle. That is said once, and the
  // new log followed from its first line.
  let dirWatcher
  try {
    dirWatcher = watch(LOGS_DIR, (_event, name) => {
      const next = nextLog(following, name)
      if (next) {
        clearCaches()
        send({ type: 'new_cycle', filename: next })
        follow(next, 'start')
      } else if (name !== following) {
        return
      }
      if (debounceTimer) return
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        sendNew()
      }, 100)
    })
  } catch {}

  req.on('close', () => {
    if (dirWatcher) dirWatcher.close()
    if (debounceTimer) clearTimeout(debounceTimer)
  })
  return SENT
}

// ── HTTP Server ─────────────────────────────────────────────────────

function sendFile(res, filepath, contentType) {
  try {
    const content = readFileSync(filepath)
    const headers = { 'Content-Type': contentType, 'Content-Length': content.length }
    if (contentType === 'font/woff2') headers['Cache-Control'] = 'public, max-age=86400'
    res.writeHead(200, headers)
    res.end(content)
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
  return SENT
}

// A route that throws answers 500 and the server stays up: `listener`.
const server = createServer(listener([
  ['/', (_req, res) => sendFile(res, join(DASHBOARD_DIR, 'index.html'), 'text/html')],
  ['/style.css', (_req, res) => sendFile(res, join(DASHBOARD_DIR, 'style.css'), 'text/css')],
  [/^\/fonts\/([\w.-]+\.woff2)$/, (_req, res, font) => sendFile(res, join(ROOT, 'public', 'fonts', font), 'font/woff2')],

  ['/api/overview', handleOverview],
  ['/api/cycles', handleCycles],
  ['/api/quality', handleQuality],
  ['/api/writing-quality', handleWritingQuality],
  ['/api/specificity', handleSpecificity],
  ['/api/article-images', handleArticleImages],
  ['/api/editorial', handleEditorial],
  ['/api/sources', handleSources],
  ['/api/operations', handleOperations],
  ['/api/rvs-trend', handleRvsTrend],
  ['/api/media', handleMedia],
  ['/api/experiment', handleExperiment],
  ['/api/live', handleLive],
  // /api/cycle/cycle-2026-04-11_1702.log
  [/^\/api\/cycle\/(.+)$/, (_req, _res, filename) => handleCycleDetail(filename)],
]))

server.listen(PORT, HOST, () => {
  console.log(`zuhd.news dashboard → http://${HOST}:${PORT}`)
})
