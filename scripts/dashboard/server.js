#!/usr/bin/env node
// zuhd.news pipeline dashboard — localhost:7777, zero dependencies
// Read-only: parses cycle logs, reads metrics/meta JSON, queries systemd

import { createServer } from 'node:http'
import { readFileSync, readdirSync, existsSync, statSync, watch } from 'node:fs'
import { join, extname } from 'node:path'
import { execSync } from 'node:child_process'
import { parseFrontmatter } from '../lib/frontmatter.js'

const PORT = 7777
const HOST = '127.0.0.1'

const ROOT = new URL('../..', import.meta.url).pathname
const LOGS_DIR = join(ROOT, 'logs')
const ARTICLES_DIR = join(ROOT, 'content', 'articles')
const DIST_DIR = join(ROOT, 'dist')
const DASHBOARD_DIR = new URL('.', import.meta.url).pathname

// ── Log Parsing ─────────────────────────────────────────────────────

function parseCycleLog(filepath) {
  const content = readFileSync(filepath, 'utf-8')
  const filename = filepath.split('/').pop()

  // Date + scheduled hour from filename: cycle-2026-04-11_1702.log
  const fnMatch = filename.match(/cycle-(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})/)
  const date = fnMatch ? fnMatch[1] : null
  const scheduledHour = fnMatch ? fnMatch[2] : null

  const started = content.match(/^Started: (.+)$/m)
  const finished = content.match(/^Finished: (.+?) — total (\d+)s$/m)

  // Stage timing + exit codes
  const feed = content.match(/Merged feed:.*— (\d+)s/)
  const selector = content.match(/Selector exit: (\d+) — (\d+)s/)
  const writer = content.match(/Writer exit: (\d+) — (\d+)s/)
  const editor = content.match(/Editor exit: (\d+) — (\d+)s/)
  const edu = content.match(/Edu context exit: (\d+) — (\d+)s/)
  const trends = content.match(/Trends: offered (\d+) indicators to editor, picked (\d+) across (\d+) articles/)
  const build = content.match(/Build exit: (\d+)/)
  const deploy = content.match(/Deploy exit: (\d+)/)
  const briefing = content.match(/Briefing exit: (\d+)/)
  const tuning = content.match(/Tuning exit: (\d+)/)
  const reflection = content.match(/Reflection exit: (\d+)/)

  // Selection detail
  const selCount = content.match(/Selection contains (\d+) stories/)
  const dedupSel = content.match(/Deduped selection: (\d+) → (\d+)/)
  const newArticles = content.match(/Found (\d+) new\/modified articles/)

  // NewsAPI token usage + backfill operational signals
  const newsApiTokens = content.match(/NewsAPI tokens this cycle:\s*~?(\d+)/)
  const backfillFires = [...content.matchAll(/Backfill: added (\d+) stories/g)]
  const backfillFailed = /Backfill: no viable candidates found/.test(content)

  // Funnel block
  const funnelFeed = content.match(/^Feed:\s+(.+)$/m)
  const funnelSel = content.match(/^Selected:\s+(\d+)/m)
  const funnelDed = content.match(/^Deduped:\s+(\d+)(?:\s+\((.+)\))?/m)
  const funnelWrit = content.match(/^Written:\s+(\d+)/m)
  const funnelVal = content.match(/^Validated:\s+(\d+)(?:\s+\((.+)\))?/m)
  const funnelPub = content.match(/^Published:\s+(\d+)/m)

  // Abort messages
  const aborted = content.match(/Selector failed|No selection file|Selection is empty|All selections already published|No new articles/)

  return {
    filename,
    date,
    scheduledHour,
    startedAt: started ? started[1] : null,
    finishedAt: finished ? finished[1] : null,
    totalSeconds: finished ? parseInt(finished[2]) : null,
    completed: !!finished,
    aborted: aborted ? aborted[0] : null,
    stages: {
      feed:      { seconds: feed ? parseInt(feed[1]) : null },
      selector:  { exit: selector ? parseInt(selector[1]) : null, seconds: selector ? parseInt(selector[2]) : null },
      writer:    { exit: writer ? parseInt(writer[1]) : null, seconds: writer ? parseInt(writer[2]) : null },
      editor:    { exit: editor ? parseInt(editor[1]) : null, seconds: editor ? parseInt(editor[2]) : null },
      edu:       { exit: edu ? parseInt(edu[1]) : null, seconds: edu ? parseInt(edu[2]) : null },
      trends:    { offered: trends ? parseInt(trends[1]) : null, picked: trends ? parseInt(trends[2]) : null, articles: trends ? parseInt(trends[3]) : null },
      build:     { exit: build ? parseInt(build[1]) : null },
      deploy:    { exit: deploy ? parseInt(deploy[1]) : null },
      briefing:  { exit: briefing ? parseInt(briefing[1]) : null },
      tuning:    { exit: tuning ? parseInt(tuning[1]) : null },
      reflection: { exit: reflection ? parseInt(reflection[1]) : null },
    },
    selectionCount: selCount ? parseInt(selCount[1]) : null,
    dedupBefore: dedupSel ? parseInt(dedupSel[1]) : null,
    dedupAfter: dedupSel ? parseInt(dedupSel[2]) : null,
    articlesWritten: newArticles ? parseInt(newArticles[1]) : null,
    newsApiTokens: newsApiTokens ? parseInt(newsApiTokens[1]) : null,
    backfillAdded: backfillFires.reduce((sum, m) => sum + parseInt(m[1]), 0),
    backfillFailed,
    funnel: {
      feed: funnelFeed ? funnelFeed[1] : null,
      selected: funnelSel ? parseInt(funnelSel[1]) : 0,
      deduped: funnelDed ? parseInt(funnelDed[1]) : 0,
      dedupNote: funnelDed ? funnelDed[2] || null : null,
      written: funnelWrit ? parseInt(funnelWrit[1]) : 0,
      validated: funnelVal ? parseInt(funnelVal[1]) : 0,
      validNote: funnelVal ? funnelVal[2] || null : null,
      published: funnelPub ? parseInt(funnelPub[1]) : 0,
    },
  }
}

function getLogFiles() {
  if (!existsSync(LOGS_DIR)) return []
  return readdirSync(LOGS_DIR)
    .filter(f => /^cycle-\d{4}-\d{2}-\d{2}_\d{4}\.log$/.test(f))
    .sort()
    .reverse()
}

function getAllCycles() {
  return getLogFiles().map(f => parseCycleLog(join(LOGS_DIR, f)))
}

function getLogTail(filename, lines = 50) {
  const filepath = join(LOGS_DIR, filename)
  if (!existsSync(filepath) || !/^cycle-[\d_-]+\.log$/.test(filename)) return ''
  const content = readFileSync(filepath, 'utf-8')
  return content.split('\n').slice(-lines).join('\n')
}

// ── Systemd Queries ─────────────────────────────────────────────────

function systemdStatus() {
  try {
    const isActive = execSync('systemctl is-active zuhd-news-cycle.service 2>/dev/null', { encoding: 'utf-8' }).trim()
    const timerShow = execSync(
      'systemctl show zuhd-news-cycle.timer --property=NextElapseUSecRealtime,LastTriggerUSec 2>/dev/null',
      { encoding: 'utf-8' }
    )
    const nextMatch = timerShow.match(/NextElapseUSecRealtime=(.+)/)
    const lastMatch = timerShow.match(/LastTriggerUSec=(.+)/)
    return {
      serviceActive: isActive === 'active' || isActive === 'activating',
      nextFire: nextMatch ? nextMatch[1] : null,
      lastTrigger: lastMatch ? lastMatch[1] : null,
    }
  } catch {
    return { serviceActive: false, nextFire: null, lastTrigger: null }
  }
}

// ── Health Indicators ───────────────────────────────────────────────

function computeStatus(lastCycle, metaAge) {
  const s = {}

  // Site freshness
  if (metaAge === null) s.siteFreshness = 'unknown'
  else if (metaAge < 6) s.siteFreshness = 'green'
  else if (metaAge < 12) s.siteFreshness = 'amber'
  else s.siteFreshness = 'red'

  if (!lastCycle || !lastCycle.completed) {
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

function categoriesPerDay(days = 7) {
  if (!existsSync(ARTICLES_DIR)) return []
  const files = readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.md'))
  const result = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
    const dayFiles = files.filter(f => f.startsWith(d))
    const cats = { date: d, politics: 0, economy: 0, science: 0, tech: 0 }
    for (const f of dayFiles) {
      try {
        const content = readFileSync(join(ARTICLES_DIR, f), 'utf-8')
        const catMatch = content.match(/^category:\s*["']?(\w+)["']?/m)
        if (catMatch && cats.hasOwnProperty(catMatch[1])) cats[catMatch[1]]++
      } catch {}
    }
    result.push(cats)
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
  if (!/^cycle-[\d_-]+\.log$/.test(filename)) return null
  const key = `cycle:${filename}`
  return cached(key, 60_000, () => {
    const filepath = join(LOGS_DIR, filename)
    if (!existsSync(filepath)) return null
    const parsed = parseCycleLog(filepath)
    parsed.tail = getLogTail(filename, 50)
    return parsed
  })
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
          const region = regionFromCoords(a.lat, a.lng)
          regionMap[region] = (regionMap[region] || 0) + 1
        }
        result.sources = { unique: Object.keys(sourceMap).length, top: Object.entries(sourceMap).sort((a, b) => b[1] - a[1]).slice(0, 8) }
        result.regions = regionMap
      } catch {}
    }

    // From metrics.json (if available)
    const metricsPath = '/tmp/zuhd-metrics.json'
    if (existsSync(metricsPath)) {
      try {
        const m = JSON.parse(readFileSync(metricsPath, 'utf-8'))
        if (m.freshness?.today) result.freshness = m.freshness.today
      } catch {}
    }

    // Story arcs from ledger
    const ledgerPath = join(ROOT, 'content', '.story-ledger.json')
    if (existsSync(ledgerPath)) {
      try {
        const ledger = JSON.parse(readFileSync(ledgerPath, 'utf-8'))
        const arcs = { breaking: 0, developing: 0, ongoing: 0, fading: 0 }
        for (const s of (ledger.stories || [])) {
          if (arcs.hasOwnProperty(s.arc)) arcs[s.arc]++
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
    const briefsPath = join(ROOT, 'content', '.context-briefs.json')
    if (existsSync(briefsPath)) {
      try {
        const allBriefs = JSON.parse(readFileSync(briefsPath, 'utf-8'))
        const totalBriefs = Object.keys(allBriefs).length
        const articleFiles = existsSync(ARTICLES_DIR) ? readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.md')) : []
        const totalArticles = articleFiles.length
        // Recent coverage (7 days)
        const recentDate = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
        const recentArticles = articleFiles.filter(f => f >= recentDate).length
        const recentBriefs = Object.keys(allBriefs).filter(k => k >= recentDate).length
        result.eduContext = {
          totalBriefs, totalArticles,
          coveragePct: totalArticles > 0 ? Math.round(totalBriefs / totalArticles * 100) : 0,
          recentBriefs, recentArticles,
          recentPct: recentArticles > 0 ? Math.round(recentBriefs / recentArticles * 100) : 0,
        }
      } catch {}
    }

    // Duplicates from metrics
    const metricsPath2 = '/tmp/zuhd-metrics.json'
    if (existsSync(metricsPath2)) {
      try {
        const m = JSON.parse(readFileSync(metricsPath2, 'utf-8'))
        result.duplicates = m.duplicates?.today || null
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

function regionFromCoords(lat, lng) {
  if (lat == null || lng == null) return 'unknown'
  if (lat > 15 && lat < 45 && lng > 25 && lng < 75) return 'ME'
  if (lat > -10 && lat < 55 && lng > 60 && lng < 150) return 'AS'
  if (lat > -40 && lat < 40 && lng > -20 && lng < 55) return 'AF'
  if (lat > 35 && lat < 72 && lng > -25 && lng < 60) return 'EU'
  if (lat > -60 && lat < 75 && lng > -170 && lng < -30) return 'AM'
  if (lat > -50 && lat < -10 && lng > 110 && lng < 180) return 'OC'
  return 'GL'
}

// ── Experiment Tracking ─────────────────────────────────────────────

function handleExperiment() {
  return cached('experiment', 60_000, () => {
    const expPath = join(ROOT, 'content', '.experiments.json')
    if (!existsSync(expPath)) return { active: null, history: [], tracking: null }

    const data = JSON.parse(readFileSync(expPath, 'utf-8'))
    const result = {
      active: data.activeExperiment || null,
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
        const dayFiles = articleFiles.filter(f => f.startsWith(d))
        const cats = { politics: 0, economy: 0, science: 0, tech: 0, total: 0 }
        for (const f of dayFiles) {
          try {
            const content = readFileSync(join(ARTICLES_DIR, f), 'utf-8')
            const catMatch = content.match(/^category:\s*["']?(\w+)["']?/m)
            if (catMatch && cats.hasOwnProperty(catMatch[1])) cats[catMatch[1]]++
            cats.total++
          } catch {}
        }
        dailyMetrics.push({
          date: d,
          isBaseline: i < 0,
          ...cats,
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

    // Parse push notifications from logs
    const logFiles = getLogFiles()
    for (const f of logFiles) {
      try {
        const content = readFileSync(join(LOGS_DIR, f), 'utf-8')
        const pushMatch = content.match(/Pushing breaking news: (.+)/m)
        if (pushMatch) {
          try {
            const payload = JSON.parse(pushMatch[1])
            const responseMatch = content.match(/\{"pushed":\d+.*\}/m)
            const response = responseMatch ? JSON.parse(responseMatch[0]) : null
            const dateMatch = f.match(/cycle-(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})/)
            result.pushHistory.push({
              date: dateMatch ? dateMatch[1] : null,
              hour: dateMatch ? dateMatch[2] + ':' + dateMatch[3] : null,
              articles: payload.articles || [],
              pushed: response?.pushed ?? null,
              skipped: response?.skipped ?? null,
              tokens: response?.tokens ?? null,
            })
          } catch {}
        }
      } catch {}
    }

    // Audio briefing meta
    const metaPath = join(ROOT, 'content', 'audio', 'briefing-meta.json')
    if (existsSync(metaPath)) {
      try {
        const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
        const stat = statSync(metaPath)
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

    // Parse historical per-source data from logs (look for ✗ errors)
    const logFiles = getLogFiles().slice(0, 35) // Last 7 days
    const sourceFails = {} // source name → count of cycles where it failed
    const sourceOK = {}
    for (const f of logFiles) {
      try {
        const content = readFileSync(join(LOGS_DIR, f), 'utf-8')
        // Find error lines: "  ✗ SourceName: error message"
        const errors = content.matchAll(/✗ (.+?): (.+)/g)
        const failedThisCycle = new Set()
        for (const m of errors) {
          const name = m[1]
          failedThisCycle.add(name)
          sourceFails[name] = (sourceFails[name] || 0) + 1
        }
        // Count OK from "Fetching N RSS" + "Raw items: N" lines
        // Any source NOT in failedThisCycle was OK
        const rssMatch = content.match(/Fetching (\d+) RSS/)
        if (rssMatch) {
          // We know the source list from the stats file or can infer
          // For now just track failures
        }
      } catch {}
    }
    result.failCounts = sourceFails
    result.totalCycles = logFiles.length

    return result
  })
}

// ── Operations (NewsAPI tokens, trends pick rate, backfill) ─────────

function handleOperations() {
  return cached('operations', 120_000, () => {
    // Last 35 cycles ≈ 7 days at 5 cycles/day
    const cycles = getAllCycles().slice(0, 35).reverse() // chronological
    const series = cycles.map((c) => ({
      filename: c.filename,
      date: c.date,
      hour: c.scheduledHour,
      tokens: c.newsApiTokens,
      trendsOffered: c.stages.trends?.offered ?? null,
      trendsPicked: c.stages.trends?.picked ?? null,
      trendsArticles: c.stages.trends?.articles ?? null,
      backfillAdded: c.backfillAdded || 0,
      backfillFailed: c.backfillFailed || false,
      published: c.funnel?.published ?? 0,
    }))
    const tokenSum = series.reduce((s, c) => s + (c.tokens || 0), 0)
    const tokenAvg = series.length ? Math.round(tokenSum / series.filter((c) => c.tokens != null).length) : 0
    const pickedSum = series.reduce((s, c) => s + (c.trendsPicked || 0), 0)
    const offeredSum = series.reduce((s, c) => s + (c.trendsOffered || 0), 0)
    const trendsPickRate = offeredSum > 0 ? pickedSum / offeredSum : 0
    return {
      series,
      summary: {
        cycles: series.length,
        tokenSum,
        tokenAvg,
        trendsPickRate,
        backfillFireCount: series.filter((c) => c.backfillAdded > 0).length,
        backfillFailCount: series.filter((c) => c.backfillFailed).length,
      },
    }
  })
}

// ── Block-type adoption from context briefs ─────────────────────────

function handleBlocks() {
  return cached('blocks', 300_000, () => {
    const briefsPath = join(ROOT, 'content', '.context-briefs.json')
    if (!existsSync(briefsPath)) return { empty: true }
    const briefs = JSON.parse(readFileSync(briefsPath, 'utf-8'))
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
  })
}

// ── Editorial Data ──────────────────────────────────────────────────

function handleReach() {
  return cached('reach', 300_000, () => {
    const path1 = join(ROOT, 'content', '.analytics.json')
    const errPath = join(ROOT, 'content', '.analytics-error.json')
    if (existsSync(path1)) {
      try {
        const data = JSON.parse(readFileSync(path1, 'utf-8'))
        const stat = statSync(path1)
        // Join with article metadata for recency/category/origin context.
        // Small per-article additions only; don't read every body.
        const articlesDir = join(ROOT, 'content', 'articles')
        const withMeta = (data.articles || []).slice(0, 100).map(a => {
          const md = join(articlesDir, a.slug + '.md')
          let meta = {}
          if (existsSync(md)) {
            const { meta: fm } = parseFrontmatter(readFileSync(md, 'utf-8'))
            meta = { category: fm.category, date: fm.date, origin: fm.origin, eventCoverage: +(fm.eventCoverage || 0) }
          }
          return { ...a, ...meta }
        })
        return {
          fetchedAt: data.fetchedAt,
          ageHours: Math.round((Date.now() - stat.mtime.getTime()) / 3600000 * 10) / 10,
          windowDays: data.windowDays,
          totalRequests: data.totalRequests,
          perDay: data.perDay,
          articles: withMeta,
        }
      } catch (e) {
        return { error: `parse error: ${e.message}` }
      }
    }
    if (existsSync(errPath)) {
      try { return { error: JSON.parse(readFileSync(errPath, 'utf-8')) } } catch {}
    }
    return { empty: true, hint: 'Run scripts/fetch-analytics.js (requires Zone > Analytics > Read)' }
  })
}

function handleEditorial() {
  return cached('editorial', 300_000, () => {
    const result = { audit: null, reflection: null, experiments: null }

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

    // Weekly reflection
    const reflectPath = join(ROOT, 'content', '.weekly-reflection.md')
    if (existsSync(reflectPath)) {
      try {
        const stat = statSync(reflectPath)
        result.reflection = {
          content: readFileSync(reflectPath, 'utf-8'),
          updatedAt: stat.mtime.toISOString(),
          ageHours: Math.round((Date.now() - stat.mtime.getTime()) / 3600000 * 10) / 10,
        }
      } catch {}
    }


    // Experiments
    const expPath = join(ROOT, 'content', '.experiments.json')
    if (existsSync(expPath)) {
      try {
        const stat = statSync(expPath)
        const data = JSON.parse(readFileSync(expPath, 'utf-8'))
        result.experiments = {
          active: data.activeExperiment || null,
          history: (data.history || []).slice().reverse(),
          updatedAt: stat.mtime.toISOString(),
        }
      } catch {}
    }

    return result
  })
}

// ── SSE Live Tailing ────────────────────────────────────────────────

function handleLive(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })

  const logFiles = getLogFiles()
  if (!logFiles.length) {
    res.write(`data: ${JSON.stringify({ type: 'idle' })}\n\n`)
    // Watch logs dir for new files
    let dirWatcher
    try {
      dirWatcher = watch(LOGS_DIR, (event, fn) => {
        if (fn && /^cycle-.*\.log$/.test(fn)) {
          res.write(`data: ${JSON.stringify({ type: 'new_cycle', filename: fn })}\n\n`)
        }
      })
    } catch {}
    req.on('close', () => { if (dirWatcher) dirWatcher.close() })
    return
  }

  const newestLog = join(LOGS_DIR, logFiles[0])
  let offset = 0
  try { offset = statSync(newestLog).size } catch {}

  // Send initial status
  const sd = systemdStatus()
  res.write(`data: ${JSON.stringify({ type: sd.serviceActive ? 'running' : 'idle', filename: logFiles[0] })}\n\n`)

  let debounceTimer = null
  let watcher
  try {
    watcher = watch(newestLog, () => {
      if (debounceTimer) return
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        try {
          const content = readFileSync(newestLog, 'utf-8')
          const newContent = content.slice(offset)
          offset = content.length
          if (!newContent) return
          const lines = newContent.split('\n').filter(Boolean)
          for (const line of lines) {
            res.write(`data: ${JSON.stringify({ type: 'line', text: line })}\n\n`)
          }
          if (newContent.includes('Finished:')) {
            res.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`)
            clearCaches()
          }
        } catch {}
      }, 100)
    })
  } catch {}

  // Also watch for new log files appearing
  let dirWatcher
  try {
    dirWatcher = watch(LOGS_DIR, (event, fn) => {
      if (fn && /^cycle-.*\.log$/.test(fn) && fn !== logFiles[0]) {
        res.write(`data: ${JSON.stringify({ type: 'new_cycle', filename: fn })}\n\n`)
      }
    })
  } catch {}

  req.on('close', () => {
    if (watcher) watcher.close()
    if (dirWatcher) dirWatcher.close()
    if (debounceTimer) clearTimeout(debounceTimer)
  })
}

// ── HTTP Server ─────────────────────────────────────────────────────

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2' }

function sendJSON(res, data, status = 200) {
  const body = JSON.stringify(data)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) })
  res.end(body)
}

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
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}`)
  const path = url.pathname

  // Static files
  if (path === '/') return sendFile(res, join(DASHBOARD_DIR, 'index.html'), 'text/html')
  if (path === '/style.css') return sendFile(res, join(DASHBOARD_DIR, 'style.css'), 'text/css')
  if (path.startsWith('/fonts/')) {
    const fontFile = path.slice(7)
    if (!/^[\w.-]+\.woff2$/.test(fontFile)) { res.writeHead(404); return res.end() }
    return sendFile(res, join(ROOT, 'public', 'fonts', fontFile), 'font/woff2')
  }

  // API routes
  if (path === '/api/overview') return sendJSON(res, handleOverview())
  if (path === '/api/cycles') return sendJSON(res, handleCycles())
  if (path === '/api/quality') return sendJSON(res, handleQuality())
  if (path === '/api/writing-quality') return sendJSON(res, handleWritingQuality())
  if (path === '/api/editorial') return sendJSON(res, handleEditorial())
  if (path === '/api/feed-health') return sendJSON(res, handleFeedHealth())
  if (path === '/api/operations') return sendJSON(res, handleOperations())
  if (path === '/api/blocks') return sendJSON(res, handleBlocks())
  if (path === '/api/media') return sendJSON(res, handleMedia())
  if (path === '/api/experiment') return sendJSON(res, handleExperiment())
  if (path === '/api/reach') return sendJSON(res, handleReach())
  if (path === '/api/live') return handleLive(req, res)

  // Parameterized: /api/cycle/cycle-2026-04-11_1702.log
  const cycleMatch = path.match(/^\/api\/cycle\/(.+)$/)
  if (cycleMatch) {
    const data = handleCycleDetail(decodeURIComponent(cycleMatch[1]))
    if (!data) { res.writeHead(404); return res.end('Not found') }
    return sendJSON(res, data)
  }

  res.writeHead(404)
  res.end('Not found')
})

server.listen(PORT, HOST, () => {
  console.log(`zuhd.news dashboard → http://${HOST}:${PORT}`)
})
