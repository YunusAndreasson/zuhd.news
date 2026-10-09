#!/usr/bin/env node
// zuhd.news pipeline dashboard — localhost:7777, zero dependencies
//
// It reads: the cycle logs, the metrics and trend files, the built feed, and
// what systemd says of the cycle's units. It starts nothing else. It writes
// one file, the specificity trend, a day's mean at a time (`handleSpecificity`).

import { createServer } from 'node:http'
import { readFileSync, readdirSync, existsSync, statSync, watch } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { tryReadArticle } from '../lib/article.js'
import { cycleIdOf, parseCycleLog } from '../lib/cycle-log.js'
import { scoreDir } from '../lib/quality-score.js'
import { regionFromCoords } from '../lib/regions.js'
import { ROOT } from '../lib/paths.js'
import { SENT, SYSTEMD_SHOW, byFileState, cycleView, feedFailures, isCycleLog, keepDay, listener, nextLog, systemdView, tailOf } from './data.js'

const PORT = 7777
const HOST = '127.0.0.1'

const LOGS_DIR = join(ROOT, 'logs')
const ARTICLES_DIR = join(ROOT, 'content', 'articles')
const DIST_DIR = join(ROOT, 'dist')
const DASHBOARD_DIR = new URL('.', import.meta.url).pathname

// ── Cycle logs ──────────────────────────────────────────────────────

/**
 * A log, read by `lib/cycle-log.js`, once for as long as the file stays as it
 * is. Six answers are made from the logs and each parsed every file for
 * itself: a week of them, 42 files and 3.5 MB, up to five times on one
 * refresh of the page and again every fifteen seconds for the overview. A
 * finished log never changes; only the running cycle's is read again.
 */
const logOf = byFileState((path) => parseCycleLog(readFileSync(path, 'utf-8')))

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

// ── Health Indicators ───────────────────────────────────────────────

function computeStatus(lastCycle, metaAge) {
  const s = {}

  // Site freshness
  if (metaAge === null) s.siteFreshness = 'unknown'
  else if (metaAge < 6) s.siteFreshness = 'green'
  else if (metaAge < 12) s.siteFreshness = 'amber'
  else s.siteFreshness = 'red'

  if (!lastCycle?.completed) {
    s.lastCycle = lastCycle ? 'red' : 'unknown'
    s.cycleTiming = 'unknown'
    s.pubRate = 'unknown'
    s.validation = 'unknown'
  } else {
    // Last cycle outcome
    const deployOk = lastCycle.stages.deploy?.exit === 0
    const selectorFail = lastCycle.stages.selector?.exit !== 0 && lastCycle.stages.selector?.exit !== null
    s.lastCycle = selectorFail ? 'red' : deployOk ? 'green' : 'amber'

    // Timing
    const t = lastCycle.totalSeconds
    s.cycleTiming = t === null ? 'unknown' : t < 1500 ? 'green' : t < 2400 ? 'amber' : 'red'

    // Publication rate
    const pub = lastCycle.funnel.published
    s.pubRate = pub >= 5 ? 'green' : pub >= 3 ? 'amber' : 'red'

    // Validation
    const removed = lastCycle.funnel.written - lastCycle.funnel.validated
    s.validation = removed <= 0 ? 'green' : removed <= 2 ? 'amber' : 'red'
  }

  const vals = Object.values(s)
  s.overall = vals.includes('red') ? 'red' : vals.includes('amber') ? 'amber' : vals.includes('unknown') ? 'unknown' : 'green'

  return s
}

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

function handleOverview() {
  return cached('overview', 15_000, () => {
    const cycles = getAllCycles()
    const completed = cycles.filter(c => c.completed)
    const last = completed[0] || null

    // Meta freshness
    let metaAge = null
    const metaPath = join(DIST_DIR, 'api', 'meta.json')
    if (existsSync(metaPath)) {
      try {
        const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
        metaAge = (Date.now() - new Date(meta.generated).getTime()) / 3600000
      } catch {}
    }

    const sd = systemdStatus()
    const status = computeStatus(last, metaAge)

    return {
      now: new Date().toISOString(),
      metaAge: metaAge !== null ? Math.round(metaAge * 10) / 10 : null,
      serviceActive: sd.serviceActive,
      nextFire: sd.nextFire,
      lastTrigger: sd.lastTrigger,
      lastCycle: last ? {
        filename: last.filename,
        date: last.date,
        scheduledHour: last.scheduledHour,
        totalSeconds: last.totalSeconds,
        published: last.funnel.published,
        finishedAt: last.finishedAt,
      } : null,
      // If there's a running (incomplete) cycle, include it
      runningCycle: cycles[0] && !cycles[0].completed ? {
        filename: cycles[0].filename,
        startedAt: cycles[0].startedAt,
        stages: cycles[0].stages,
      } : null,
      status,
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
    const result = { categories: null, sources: null, regions: null, freshness: null, arcs: null, articlesPerDay: articlesPerDay(7) }

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
    const metricsPath = '/tmp/zuhd-metrics.json'
    if (existsSync(metricsPath)) {
      try {
        const m = JSON.parse(readFileSync(metricsPath, 'utf-8'))
        if (m.freshness?.today) result.freshness = m.freshness.today
        result.duplicates = m.duplicates?.today || null
      } catch {}
    }

    // Story arcs from ledger
    const ledgerPath = join(ROOT, 'content', '.story-ledger.json')
    if (existsSync(ledgerPath)) {
      try {
        const ledger = JSON.parse(readFileSync(ledgerPath, 'utf-8'))
        const arcs = { breaking: 0, developing: 0, ongoing: 0, fading: 0 }
        for (const s of (ledger.stories || [])) {
          if (Object.hasOwn(arcs, s.arc)) arcs[s.arc]++
        }
        result.arcs = arcs
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

    // Edu context coverage
    if (existsSync(BRIEFS_PATH)) {
      try {
        const briefKeys = briefsDigest(BRIEFS_PATH).keys
        const totalBriefs = briefKeys.length
        const articleFiles = existsSync(ARTICLES_DIR) ? readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.md')) : []
        const totalArticles = articleFiles.length
        // Recent coverage (7 days)
        const recentDate = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
        const recentArticles = articleFiles.filter(f => f >= recentDate).length
        const recentBriefs = briefKeys.filter(k => k >= recentDate).length
        result.eduContext = {
          totalBriefs, totalArticles,
          coveragePct: totalArticles > 0 ? Math.round(totalBriefs / totalArticles * 100) : 0,
          recentBriefs, recentArticles,
          recentPct: recentArticles > 0 ? Math.round(recentBriefs / recentArticles * 100) : 0,
        }
      } catch {}
    }

    return result
  })
}

// ── Writing Quality (from measure-quality.js trend file) ───────────

function handleWritingQuality() {
  return cached('writing-quality', 60_000, () => {
    const trendPath = join(ROOT, 'content', '.quality-trend.json')
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
    return { current, delta, history: trend.slice(-12) }
  })
}

// Per-article objective quality scoring (specificity, hedges, title-echo).
// Computed from the most recent N articles on a request, and the day's mean
// kept, so there is a trend without a stage in the cycle. It is therefore a
// trend of the days someone opened the Quality tab: its one record until
// 2026-10-09 was the day the panel was written, 2026-05-02.
function handleSpecificity() {
  return cached('specificity', 5 * 60_000, () => {
    if (!existsSync(ARTICLES_DIR)) return { current: null, history: [], perArticle: [] }

    const N = 60
    const { rows, mean } = scoreDir(ARTICLES_DIR, N)
    if (!mean) return { current: null, history: [], perArticle: [] }

    const snapshot = {
      date: new Date().toISOString().slice(0, 10),
      articleCount: mean.articleCount,
      specificity: +mean.specificity.toFixed(2),
      digits: +mean.digits.toFixed(2),
      properNouns: +mean.properNouns.toFixed(2),
      hedges: +mean.hedges.toFixed(3),
      titleEcho: +mean.titleEcho.toFixed(3),
      sentences: +mean.sentences.toFixed(2),
    }
    // One snapshot per day: today's replaces today's, a new day is appended.
    // A write that fails costs the trend a day, not the panel its answer.
    let trend = [snapshot]
    try {
      trend = keepDay(join(ROOT, 'content', '.specificity-trend.json'), snapshot, 60).series
    } catch (err) {
      console.error(`dashboard: the specificity trend was not written: ${err.message}`)
    }

    const prior = trend.length >= 2 ? trend[trend.length - 2] : null
    const delta = {}
    if (prior) {
      for (const k of ['specificity', 'digits', 'properNouns', 'hedges', 'titleEcho']) {
        if (typeof snapshot[k] === 'number' && typeof prior[k] === 'number') {
          delta[k] = +(snapshot[k] - prior[k]).toFixed(2)
        }
      }
    }

    // Bottom 5 by specificity for drill-down
    const worst = rows.slice().sort((a, b) => a.specificity - b.specificity).slice(0, 5).map(r => ({
      file: r.file, specificity: r.specificity, digits: r.digits, hedges: r.hedges, titleEcho: +r.titleEcho.toFixed(2),
    }))

    return { current: snapshot, delta, history: trend, worst, windowArticles: N }
  })
}

// Article-image preview: scan latest articles for source-level image URLs.
// Captured starting 2026-05-02 by flipping NewsAPI's includeArticleImage flag.
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
    const expPath = join(ROOT, 'content', '.experiments.json')
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
    const result = { pushHistory: [], briefing: null }

    // The breaking push of each cycle that sent one
    for (const f of getLogFiles()) {
      const push = logAt(f)?.pushes.find((p) => p.kind === 'breaking')
      if (!push?.payload) continue
      // `2026-10-09_0501`
      const id = cycleIdOf(f)
      result.pushHistory.push({
        date: id.slice(0, 10),
        hour: `${id.slice(11, 13)}:${id.slice(13, 15)}`,
        articles: push.payload.articles || [],
        pushed: push.response?.pushed ?? null,
        skipped: push.response?.skipped ?? null,
        tokens: push.response?.tokens ?? null,
      })
    }

    // Audio briefing meta
    const metaPath = join(ROOT, 'content', 'audio', 'briefing-meta.json')
    if (existsSync(metaPath)) {
      try {
        const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
        // List available briefing files
        const audioDir = join(ROOT, 'content', 'audio')
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

// ── Feed Source Health ───────────────────────────────────────────────

function handleFeedHealth() {
  return cached('feedHealth', 120_000, () => {
    const result = { current: null, history: [] }

    // Current stats from latest fetch
    const statsPath = '/tmp/zuhd-feed-source-stats.json'
    if (existsSync(statsPath)) {
      try {
        result.current = JSON.parse(readFileSync(statsPath, 'utf-8'))
      } catch {}
    }

    // In how many of the last week's cycles each source failed its fetch
    const logFiles = getLogFiles().slice(0, 35) // Last 7 days
    result.failCounts = feedFailures(logFiles.map(logAt).filter(Boolean))
    result.totalCycles = logFiles.length

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

// ── Block-type adoption from context briefs ─────────────────────────

const BRIEFS_PATH = join(ROOT, 'content', '.context-briefs.json')

/**
 * What the two brief panels need of `content/.context-briefs.json`: its keys
 * (the coverage figures on `/api/quality`) and the block counts
 * (`/api/blocks`).
 *
 * The file is 15.9 MB and has not changed since 2026-06-14, when the stage
 * that wrote it had its last cycle. Each panel parsed it for itself and the
 * Quality tab asks for both at once, in a unit capped at 128 MB. It is parsed
 * when it changes, and only these two answers are kept: the parsed file
 * would not fit beside everything else.
 */
const briefsDigest = byFileState((path) => {
  const briefs = JSON.parse(readFileSync(path, 'utf-8'))
  return { keys: Object.keys(briefs), blocks: blockAdoption(briefs) }
})

function handleBlocks() {
  if (!existsSync(BRIEFS_PATH)) return { empty: true }
  return briefsDigest(BRIEFS_PATH).blocks
}

function blockAdoption(briefs) {
  const SHAPE_SPECIFIC = new Set(['timeline', 'rank', 'sankey', 'treemap'])
  const ALWAYS_CHEAP = new Set(['prose', 'quiz', 'locations', 'compare', 'actors', 'quote'])
  // Per-day adoption: derive date from slug prefix (slugs start with YYYY-MM-DD-)
  const byDay = {}
  for (const [slug, brief] of Object.entries(briefs)) {
    const m = slug.match(/^(\d{4}-\d{2}-\d{2})/)
    if (!m) continue
    const day = m[1]
    if (!byDay[day]) byDay[day] = { day, briefs: 0, entries: 0, blocks: 0, types: {} }
    const d = byDay[day]
    d.briefs++
    for (const e of brief.timeline || []) {
      d.entries++
      for (const b of e.blocks || []) {
        d.blocks++
        d.types[b.type] = (d.types[b.type] || 0) + 1
      }
    }
  }
  const days = Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day))
  // Last 14 days
  const recent = days.slice(-14)

  // Aggregate type counts across all-time + last-14-day
  const allTypes = {}
  for (const [, b] of Object.entries(briefs)) {
    for (const e of b.timeline || []) for (const blk of e.blocks || []) {
      allTypes[blk.type] = (allTypes[blk.type] || 0) + 1
    }
  }
  const recentTypes = {}
  for (const d of recent) {
    for (const [t, n] of Object.entries(d.types)) recentTypes[t] = (recentTypes[t] || 0) + n
  }

  const tierTotals = (counts) => {
    let shape = 0, cheap = 0, charts = 0, other = 0
    for (const [t, n] of Object.entries(counts)) {
      if (SHAPE_SPECIFIC.has(t)) shape += n
      else if (ALWAYS_CHEAP.has(t)) cheap += n
      else if (['trend', 'chart', 'multi-chart'].includes(t)) charts += n
      else other += n
    }
    return { shape, cheap, charts, other }
  }

  return {
    totalBriefs: Object.keys(briefs).length,
    allTypes,
    recentTypes,
    allTiers: tierTotals(allTypes),
    recentTiers: tierTotals(recentTypes),
    recent: recent.map((d) => ({ ...d, tiers: tierTotals(d.types) })),
  }
}

// ── Production-cycle RVS trend ──────────────────────────────────────

function handleRvsTrend() {
  return cached('rvsTrend', 60_000, () => {
    const path = join(ROOT, 'content', '.rvs-trend.json')
    if (!existsSync(path)) return { empty: true, hint: 'available after the next production cycle (script: score-production-cycle.js)' }
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

// ── Autoresearch session history ────────────────────────────────────
//
// The sessions of 2026-04-26, as the harness left them. The harness itself
// is gone (it had not been able to run since May); what it recorded is kept.

function handleAutoresearch() {
  return cached('autoresearch', 60_000, () => {
    const dir = join(ROOT, 'content', '.autoresearch-history')
    if (!existsSync(dir)) return { empty: true, hint: 'no autoresearch sessions on record' }
    const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort().reverse()
    if (files.length === 0) return { empty: true }

    const sessions = []
    for (const f of files.slice(0, 30)) {
      const sessionId = f.replace(/\.jsonl$/, '')
      try {
        const lines = readFileSync(join(dir, f), 'utf-8').trim().split('\n').filter(Boolean)
        const records = lines.map((l) => JSON.parse(l))
        const baseline = records.find((r) => r.kind === 'baseline')
        const replays = records.filter((r) => r.kind === 'replay')
        const accepted = replays.filter((r) => r.decision === 'accept')
        const rejected = replays.filter((r) => r.decision !== 'accept')
        const startedAt = baseline?.ts ?? records[0]?.ts ?? null
        const finishedAt = records[records.length - 1]?.ts ?? null
        const bestRvs = replays.length > 0
          ? Math.max(...replays.map((r) => r.rvs ?? -Infinity))
          : (baseline?.rvs ?? null)
        sessions.push({
          sessionId,
          startedAt,
          finishedAt,
          baselineRvs: baseline?.rvs ?? null,
          baselineClusters: baseline?.clusters ?? null,
          bestRvs,
          delta: bestRvs != null && baseline?.rvs != null ? +(bestRvs - baseline.rvs).toFixed(2) : null,
          iterCount: replays.length,
          acceptedCount: accepted.length,
          rejectedCount: rejected.length,
          accepted: accepted.map((r) => ({
            iter: r.iter,
            rvs: r.rvs,
            delta: r.delta,
            file: r.diff?.file,
            targetCluster: r.diff?.targetCluster,
            rationale: r.diff?.rationale,
          })),
          rejected: rejected.map((r) => ({
            iter: r.iter,
            rvs: r.rvs,
            delta: r.delta,
            decision: r.decision,
            file: r.diff?.file,
            targetCluster: r.diff?.targetCluster,
            rationale: r.diff?.rationale?.slice(0, 200),
          })),
        })
      } catch (err) {
        sessions.push({ sessionId, error: err.message })
      }
    }

    return {
      sessions,
      summary: {
        sessionCount: sessions.length,
        totalIters: sessions.reduce((s, x) => s + (x.iterCount || 0), 0),
        totalAccepted: sessions.reduce((s, x) => s + (x.acceptedCount || 0), 0),
      },
    }
  })
}

// ── Editorial Data ──────────────────────────────────────────────────

function handleEditorial() {
  return cached('editorial', 300_000, () => {
    const result = { audit: null }

    // Daily audit — prefer JSON, fall back to markdown
    const auditJsonPath = join(ROOT, 'content', '.daily-audit.json')
    const auditMdPath = join(ROOT, 'content', '.daily-audit.md')
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
    } else if (existsSync(auditMdPath)) {
      try {
        const stat = statSync(auditMdPath)
        result.audit = {
          format: 'markdown',
          content: readFileSync(auditMdPath, 'utf-8'),
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
  ['/api/feed-health', handleFeedHealth],
  ['/api/operations', handleOperations],
  ['/api/blocks', handleBlocks],
  ['/api/rvs-trend', handleRvsTrend],
  ['/api/autoresearch', handleAutoresearch],
  ['/api/media', handleMedia],
  ['/api/experiment', handleExperiment],
  ['/api/live', handleLive],
  // /api/cycle/cycle-2026-04-11_1702.log
  [/^\/api\/cycle\/(.+)$/, (_req, _res, filename) => handleCycleDetail(filename)],
]))

server.listen(PORT, HOST, () => {
  console.log(`zuhd.news dashboard → http://${HOST}:${PORT}`)
})
