#!/usr/bin/env node
// compute-metrics.js — deterministic daily metrics for the tuning loop
// Reads today's articles + cycle logs, outputs JSON to stdout
// No LLM calls — pure data extraction

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
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
