#!/usr/bin/env node
// compute-metrics.js — deterministic daily metrics for the tuning loop
// Reads today's articles + cycle logs, outputs JSON to stdout
// No LLM calls — pure data extraction

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { recapMatch, titleWords } from './lib/dedup.js'
import { parseFrontmatter } from './lib/frontmatter.js'
import { soleClassifiedSource } from './lib/outlet-class.js'
import { regionFromCoords } from './lib/regions.js'

const ROOT = new URL('..', import.meta.url).pathname
const ARTICLES_DIR = join(ROOT, 'content', 'articles')
const LOGS_DIR = join(ROOT, 'logs')

const today = new Date().toISOString().slice(0, 10)
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

function readArticles(datePrefix) {
  if (!existsSync(ARTICLES_DIR)) return []
  return readdirSync(ARTICLES_DIR)
    .filter(f => f.startsWith(datePrefix) && f.endsWith('.md'))
    .map(f => {
      const content = readFileSync(join(ARTICLES_DIR, f), 'utf-8')
      const get = key => (content.match(new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, 'm')) || [])[1] || ''
      // Parse sources array from YAML frontmatter
      const sources = []
      const sourcesMatch = content.match(/^sources:\n((?:\s+-[\s\S]*?)?)(?=\n[a-z]|\n---|\n$)/m)
      if (sourcesMatch) {
        for (const m of sourcesMatch[1].matchAll(/- name:\s*["']?(.+?)["']?\s*$/gm)) {
          sources.push(m[1])
        }
      }
      const urlMatch = content.match(/^\s+url:\s*["']?(.+?)["']?\s*$/m)
      return {
        slug: basename(f, '.md'),
        title: get('title'),
        date: get('date'),
        source: sources[0] || '',
        sources,
        sourceUrl: urlMatch ? urlMatch[1] : '',
        category: get('category'),
        location: get('location'),
        lat: parseFloat(get('lat')) || null,
        lng: parseFloat(get('lng')) || null,
      }
    })
}

function tally(items, keyFn) {
  const counts = {}
  for (const item of items) {
    const k = keyFn(item) || 'unknown'
    counts[k] = (counts[k] || 0) + 1
  }
  return counts
}

// ── Freshness ────────────────────────────────────────────────────────

function computeFreshness(articles) {
  const ages = articles
    .map(a => {
      const pubDate = new Date(a.date).getTime()
      // Article filename date = when we published it
      const publishDate = new Date(a.slug.slice(0, 10)).getTime()
      if (Number.isNaN(pubDate) || Number.isNaN(publishDate)) return null
      return (publishDate - pubDate) / 86400000  // days between source pub and our pub
    })
    .filter(a => a !== null && a >= 0)
    .sort((a, b) => a - b)

  if (ages.length === 0) return { median: null, p90: null, max: null, count: 0 }
  const median = ages[Math.floor(ages.length / 2)]
  const p90 = ages[Math.floor(ages.length * 0.9)]
  return {
    median: Math.round(median * 10) / 10,
    p90: Math.round(p90 * 10) / 10,
    max: Math.round(Math.max(...ages) * 10) / 10,
    count: ages.length,
  }
}

// ── Diversity ────────────────────────────────────────────────────────

function computeDiversity(articles) {
  const categories = tally(articles, a => a.category)
  const allSourceNames = articles.flatMap(a => a.sources.length > 0 ? a.sources : [a.source || 'unknown'])
  const sources = {}
  for (const s of allSourceNames) { sources[s || 'unknown'] = (sources[s || 'unknown'] || 0) + 1 }
  const regions = tally(articles, a => regionFromCoords(a.lat, a.lng) ?? 'unknown')
  const uniqueSources = Object.keys(sources).length
  const uniqueRegions = Object.keys(regions).filter(r => r !== 'unknown').length
  const scienceSources = [...new Set(articles.filter(a => a.category === 'science').flatMap(a => a.sources))]

  const multiSource = articles.filter(a => a.sources.length > 1).length

  return { categories, sources, regions, uniqueSources, uniqueRegions, scienceSources, multiSource }
}

// ── Educational Value ────────────────────────────────────────────────

function computeEducational(articles) {
  const science = articles.filter(a => a.category === 'science')
  const tech = articles.filter(a => a.category === 'tech')
  return {
    scienceCount: science.length,
    techCount: tech.length,
    sciTechRatio: articles.length > 0 ? Math.round((science.length + tech.length) / articles.length * 100) : 0,
    scienceSources: [...new Set(science.flatMap(a => a.sources))],
    techSources: [...new Set(tech.flatMap(a => a.sources))],
  }
}

// ── Duplicates ───────────────────────────────────────────────────────

function findDuplicates(articles) {
  const urlMap = {}
  for (const a of articles) {
    // biome-ignore lint/suspicious/noAssignInExpressions: the (x ??= []) group-by idiom, in statement position. The rule is here for `if (a = b)`.
    if (a.sourceUrl) (urlMap[a.sourceUrl] ??= []).push(a.slug)
  }
  const dupes = Object.entries(urlMap).filter(([, slugs]) => slugs.length > 1)
  return { count: dupes.length, details: dupes.map(([url, slugs]) => ({ url: url.slice(0, 80), slugs })) }
}

// ── Sourcing and datelines ───────────────────────────────────────────
//
// Added 2026-09-25 because every goal the tuner is scored on was trivially met
// ("multi-source ≥ 4/day" against ~60 articles, 72% of them single-source;
// "regions ≥ 4" while a third of datelines were in the US), so the audit read
// "all metrics within targets" over the pipeline's actual weaknesses. These are
// the numbers the 2026-09-25 evaluation had to compute by hand.

// Contiguous US by bounding box: regionFromCoords files the US under 'AM'
// together with Latin America, which is what hid the imbalance.
const inUs = (lat, lng) => lat != null && lng != null && lat > 24 && lat < 50 && lng > -125 && lng < -66

function computeSourcing(datePrefix) {
  if (!existsSync(ARTICLES_DIR)) return null
  const names = readdirSync(ARTICLES_DIR).filter(f => f.startsWith(datePrefix))
  const rows = []
  for (const f of names.filter(n => n.endsWith('.md'))) {
    try {
      const raw = readFileSync(join(ARTICLES_DIR, f), 'utf-8')
      const { meta } = parseFrontmatter(raw)
      const body = raw.replace(/^---[\s\S]*?---\s*/, '').trim()
      const sources = Array.isArray(meta.sources) ? meta.sources : []
      rows.push({ slug: basename(f, '.md'), title: String(meta.title || ''), sources, body, lat: Number(meta.lat), lng: Number(meta.lng) })
    } catch { /* an unparseable file is the validator's business */ }
  }
  const n = rows.length
  const pct = k => (n ? Math.round((k / n) * 100) : 0)
  const single = rows.filter(r => r.sources.length <= 1).length
  const classified = rows.map(r => ({ r, cls: soleClassifiedSource(r.sources) })).filter(x => x.cls)
  const us = rows.filter(r => inUs(r.lat, r.lng)).length
  const latAm = rows.filter(r => regionFromCoords(r.lat, r.lng) === 'AM' && !inUs(r.lat, r.lng) && r.lat < 33).length
  const noDateline = rows.filter(r => !/^[^\n—]{2,60}? — /.test(r.body)).map(r => r.slug)
  const withImage = rows.filter(r => r.sources.some(s => typeof s?.image === 'string' && s.image)).length
  // Same event twice in a day: the title-overlap test prefilter uses, run
  // pairwise over what actually shipped.
  const sameEvent = []
  for (let i = 0; i < rows.length; i++) {
    const earlier = rows.slice(0, i).map(r => ({ slug: r.slug, words: titleWords(r.title) }))
    const hit = recapMatch(rows[i].title, earlier)
    if (hit) sameEvent.push([hit, rows[i].slug])
  }
  return {
    articles: n,
    singleSourcePct: pct(single),
    multiSourcePct: pct(n - single),
    stateOrAdvocacyOnly: classified.length,
    stateOrAdvocacyOnlySlugs: classified.map(x => x.r.slug),
    usDatelinePct: pct(us),
    latAmDatelinePct: pct(latAm),
    missingDateline: noDateline.length,
    missingDatelineSlugs: noDateline,
    imageUrlPct: pct(withImage),
    sameEventDuplicates: sameEvent.length,
    sameEventPairs: sameEvent,
    quarantined: names.filter(f => f.endsWith('.md.bad')).length,
  }
}

// ── Log Parsing ──────────────────────────────────────────────────────

function parseLogs(datePrefix) {
  if (!existsSync(LOGS_DIR)) return []
  return readdirSync(LOGS_DIR)
    .filter(f => f.startsWith(`cycle-${datePrefix}`) && f.endsWith('.log'))
    .sort()
    .map(f => {
      const content = readFileSync(join(LOGS_DIR, f), 'utf-8')
      // Timing
      const totalMatch = content.match(/total (\d+)s/)
      const feedMatch = content.match(/Merged feed:.*— (\d+)s/)
      const selectorMatch = content.match(/Selector exit: \d+ — (\d+)s/)
      const writerMatch = content.match(/Writer exit: \d+ — (\d+)s/)
      const editorMatch = content.match(/Editor exit: \d+ — (\d+)s/)
      // Pipeline counts
      const selectedMatch = content.match(/Selection contains (\d+) stories/)
      const dedupMatch = content.match(/Deduped selection: (\d+) → (\d+)/)
      const deployMatch = content.match(/Deploy exit: (\d+)/)
      // Funnel (bottom of log)
      const funnelWritten = content.match(/Written:\s+(\d+)/)
      const funnelPublished = content.match(/Published:\s+(\d+)/)

      return {
        file: f,
        totalSeconds: totalMatch ? parseInt(totalMatch[1], 10) : null,
        feedSeconds: feedMatch ? parseInt(feedMatch[1], 10) : null,
        selectorSeconds: selectorMatch ? parseInt(selectorMatch[1], 10) : null,
        writerSeconds: writerMatch ? parseInt(writerMatch[1], 10) : null,
        editorSeconds: editorMatch ? parseInt(editorMatch[1], 10) : null,
        selected: selectedMatch ? +selectedMatch[1] : null,
        dedupBefore: dedupMatch ? +dedupMatch[1] : null,
        dedupAfter: dedupMatch ? +dedupMatch[2] : null,
        written: funnelWritten ? +funnelWritten[1] : null,
        published: funnelPublished ? +funnelPublished[1] : null,
        deploySuccess: deployMatch ? deployMatch[1] === '0' : null,
      }
    })
}

// ── Main ─────────────────────────────────────────────────────────────

const todayArticles = readArticles(today)
const yesterdayArticles = readArticles(yesterday)
const todayLogs = parseLogs(today)
const yesterdayLogs = parseLogs(yesterday)

const metrics = {
  date: today,
  articlesPublished: { today: todayArticles.length, yesterday: yesterdayArticles.length },
  freshness: {
    today: computeFreshness(todayArticles),
    yesterday: computeFreshness(yesterdayArticles),
  },
  diversity: {
    today: computeDiversity(todayArticles),
    yesterday: computeDiversity(yesterdayArticles),
  },
  educational: {
    today: computeEducational(todayArticles),
    yesterday: computeEducational(yesterdayArticles),
  },
  duplicates: {
    today: findDuplicates(todayArticles),
    yesterday: findDuplicates(yesterdayArticles),
  },
  sourcing: {
    today: computeSourcing(today),
    yesterday: computeSourcing(yesterday),
  },
  cycles: {
    today: {
      count: todayLogs.length,
      completed: todayLogs.filter(l => l.deploySuccess).length,
      avgDuration: todayLogs.length > 0
        ? Math.round(todayLogs.reduce((s, l) => s + (l.totalSeconds || 0), 0) / todayLogs.length)
        : null,
      avgSelectorSeconds: todayLogs.length > 0
        ? Math.round(todayLogs.reduce((s, l) => s + (l.selectorSeconds || 0), 0) / todayLogs.length)
        : null,
      avgWriterSeconds: todayLogs.length > 0
        ? Math.round(todayLogs.reduce((s, l) => s + (l.writerSeconds || 0), 0) / todayLogs.length)
        : null,
      avgEditorSeconds: todayLogs.length > 0
        ? Math.round(todayLogs.reduce((s, l) => s + (l.editorSeconds || 0), 0) / todayLogs.length)
        : null,
      avgPublished: todayLogs.length > 0
        ? Math.round(todayLogs.reduce((s, l) => s + (l.published || 0), 0) / todayLogs.length)
        : null,
    },
    yesterday: {
      count: yesterdayLogs.length,
      completed: yesterdayLogs.filter(l => l.deploySuccess).length,
    },
  },
}

console.log(JSON.stringify(metrics, null, 2))
