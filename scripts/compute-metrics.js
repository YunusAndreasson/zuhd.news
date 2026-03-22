#!/usr/bin/env node
// compute-metrics.js — deterministic daily metrics for the tuning loop
// Reads today's articles + cycle logs, outputs JSON to stdout
// No LLM calls — pure data extraction

import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, basename } from 'path'

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
      return {
        slug: basename(f, '.md'),
        title: get('title'),
        date: get('date'),
        source: get('source'),
        sourceUrl: get('sourceUrl'),
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

function regionFromCoords(lat, lng) {
  if (lat === null || lng === null) return 'unknown'
  if (lat > 15 && lat < 45 && lng > 25 && lng < 75) return 'ME'   // Middle East + Central Asia
  if (lat > -10 && lat < 55 && lng > 60 && lng < 150) return 'AS' // Asia-Pacific
  if (lat > -40 && lat < 40 && lng > -20 && lng < 55) return 'AF' // Africa
  if (lat > 35 && lat < 72 && lng > -25 && lng < 60) return 'EU'  // Europe
  if (lat > -60 && lat < 75 && lng > -170 && lng < -30) return 'AM' // Americas
  if (lat > -50 && lat < -10 && lng > 110 && lng < 180) return 'OC' // Oceania
  return 'GL'
}

// ── Freshness ────────────────────────────────────────────────────────

function computeFreshness(articles) {
  const ages = articles
    .map(a => {
      const pubDate = new Date(a.date).getTime()
      // Article filename date = when we published it
      const publishDate = new Date(a.slug.slice(0, 10)).getTime()
      if (isNaN(pubDate) || isNaN(publishDate)) return null
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
  const sources = tally(articles, a => a.source)
  const regions = tally(articles, a => regionFromCoords(a.lat, a.lng))
  const uniqueSources = Object.keys(sources).length
  const uniqueRegions = Object.keys(regions).filter(r => r !== 'unknown').length
  const scienceSources = [...new Set(articles.filter(a => a.category === 'science').map(a => a.source))]

  return { categories, sources, regions, uniqueSources, uniqueRegions, scienceSources }
}

// ── Educational Value ────────────────────────────────────────────────

function computeEducational(articles) {
  const science = articles.filter(a => a.category === 'science')
  const tech = articles.filter(a => a.category === 'tech')
  return {
    scienceCount: science.length,
    techCount: tech.length,
    sciTechRatio: articles.length > 0 ? Math.round((science.length + tech.length) / articles.length * 100) : 0,
    scienceSources: [...new Set(science.map(a => a.source))],
    techSources: [...new Set(tech.map(a => a.source))],
  }
}

// ── Duplicates ───────────────────────────────────────────────────────

function findDuplicates(articles) {
  const urlMap = {}
  for (const a of articles) {
    if (a.sourceUrl) (urlMap[a.sourceUrl] = urlMap[a.sourceUrl] || []).push(a.slug)
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
      const totalMatch = content.match(/total (\d+)s/)
      const fetchMatch = content.match(/Feed fetch done — (\d+)s/)
      const haikusMatch = content.match(/Haiku dedup: (\d+) checked, (\d+) removed, ([\d.]+)s/)
      const qualityMatch = content.match(/Haiku quality: (\d+) checked, (\d+) junk, ([\d.]+)s/)
      const dedupMatch = content.match(/Existing-article dedup: (\d+) url, (\d+) age, (\d+) slug, (\d+) fingerprint/)
      const freshMatch = content.match(/Fresh stories: (\d+), suspects: (\d+)/)
      const selectedMatch = content.match(/Selected (\d+) stories/)
      const deployMatch = content.match(/Deploy exit: (\d+)/)
      const articleCount = (content.match(/Built: \d{4}/g) || []).length

      return {
        file: f,
        totalSeconds: totalMatch ? parseInt(totalMatch[1]) : null,
        fetchSeconds: fetchMatch ? parseInt(fetchMatch[1]) : null,
        haikuDedup: haikusMatch ? { checked: +haikusMatch[1], removed: +haikusMatch[2], seconds: +haikusMatch[3] } : null,
        haikuQuality: qualityMatch ? { checked: +qualityMatch[1], junk: +qualityMatch[2], seconds: +qualityMatch[3] } : null,
        dedup: dedupMatch ? { url: +dedupMatch[1], age: +dedupMatch[2], slug: +dedupMatch[3], fp: +dedupMatch[4] } : null,
        freshStories: freshMatch ? +freshMatch[1] : null,
        suspects: freshMatch ? +freshMatch[2] : null,
        selected: selectedMatch ? +selectedMatch[1] : null,
        deploySuccess: deployMatch ? deployMatch[1] === '0' : null,
        articlesBuilt: articleCount || null,
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
      haikuDedup: todayLogs.filter(l => l.haikuDedup).map(l => l.haikuDedup),
      haikuQuality: todayLogs.filter(l => l.haikuQuality).map(l => l.haikuQuality),
    },
    yesterday: {
      count: yesterdayLogs.length,
      completed: yesterdayLogs.filter(l => l.deploySuccess).length,
    },
  },
}

console.log(JSON.stringify(metrics, null, 2))
