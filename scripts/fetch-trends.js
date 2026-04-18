#!/usr/bin/env node
// Trends fetcher for zuhd.news.
// Reads scripts/lib/trends-registry.js, calls the configured sources, and
// writes two files:
//   - content/trends/YYYY-MM-DD.json   (full snapshot, committed)
//   - /tmp/zuhd-trends-digest.json     (compact, fed to the editor stage)
//
// Design principles copied from fetch-news.js:
//  - Native fetch with 10s timeout + one retry (retry lives in the per-source module).
//  - Partial-failure tolerant: one source failing doesn't block the others.
//  - Missing API keys → skip that source with a warning (graceful), do not abort.
//  - Idempotent: writing the same day twice overwrites the snapshot.

import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { INDICATORS } from './lib/trends-registry.js'
import { fetchFredSeries } from './lib/trends-sources/fred.js'
import { fetchOerRates } from './lib/trends-sources/oer.js'
import { fetchPolymarketTop } from './lib/trends-sources/polymarket.js'
import { fetchPortWatchChokepoint } from './lib/trends-sources/portwatch.js'

const ROOT = new URL('..', import.meta.url).pathname
const TRENDS_DIR = join(ROOT, 'content', 'trends')
const FX_CACHE = join(TRENDS_DIR, '.fx-history.json')
const DIGEST_PATH = '/tmp/zuhd-trends-digest.json'

const FRED_KEY = process.env.FRED_API_KEY
const OER_ID = process.env.OER_APP_ID

const today = new Date().toISOString().slice(0, 10)
const SNAPSHOT_PATH = join(TRENDS_DIR, `${today}.json`)

// ── Run ────────────────────────────────────────────────────────────────────

const started = Date.now()
console.log(`Fetching trends for ${today}`)

const indicators = [] // populated snapshot entries

// --- FRED ---
const fredIndicators = INDICATORS.filter((i) => i.source === 'fred')
if (FRED_KEY && fredIndicators.length > 0) {
  console.log(`FRED: ${fredIndicators.length} series`)
  for (const ind of fredIndicators) {
    const data = await fetchFredSeries(ind, FRED_KEY)
    if (data) indicators.push(buildIndicatorEntry(ind, data))
  }
} else if (!FRED_KEY) {
  console.warn('  ⚠ FRED_API_KEY not set — skipping FRED series (register at https://fred.stlouisfed.org/docs/api/api_key.html)')
}

// --- OER (single batched call across all fx- indicators) ---
const oerIndicators = INDICATORS.filter((i) => i.source === 'oer')
if (OER_ID && oerIndicators.length > 0) {
  console.log(`OER: ${oerIndicators.length} currencies`)
  const currencies = oerIndicators.map((i) => i.seriesId)
  const rates = await fetchOerRates(currencies, OER_ID, FX_CACHE)
  if (rates) {
    for (const ind of oerIndicators) {
      const data = rates[ind.seriesId]
      if (data) indicators.push(buildIndicatorEntry(ind, data))
    }
  }
} else if (!OER_ID) {
  console.warn('  ⚠ OER_APP_ID not set — skipping currency basket (register at https://openexchangerates.org/signup/free)')
}

// --- PortWatch (no auth) ---
const pwIndicators = INDICATORS.filter((i) => i.source === 'portwatch')
if (pwIndicators.length > 0) {
  console.log(`PortWatch: ${pwIndicators.length} chokepoints`)
  for (const ind of pwIndicators) {
    const data = await fetchPortWatchChokepoint(ind)
    if (data) indicators.push(buildIndicatorEntry(ind, data))
  }
}

// --- Polymarket (no auth, dynamic indicators) ---
console.log(`Polymarket: top markets`)
const polyResults = await fetchPolymarketTop()
if (polyResults) {
  for (const r of polyResults) {
    indicators.push(r) // already in snapshot shape
  }
}

// ── Write snapshot ─────────────────────────────────────────────────────────

mkdirSync(TRENDS_DIR, { recursive: true })

const snapshot = {
  fetchedAt: new Date().toISOString(),
  asOf: today,
  indicators,
}

writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2))
console.log(`Wrote ${SNAPSHOT_PATH} — ${indicators.length} indicators`)

// ── Write digest (editor-facing compact view) ──────────────────────────────
//
// The digest is what the edu-context Claude stage sees. It must be small
// enough to fit comfortably in the prompt alongside the article list. We drop
// the full values/periods arrays here — Claude only needs to know WHAT is
// available and its latest value so it can decide relevance. The full series
// lives in the snapshot and gets re-hydrated by the dry-run / generator when
// Claude emits a pick.

const digest = {
  asOf: today,
  indicators: indicators.map((i) => ({
    id: i.id,
    label: i.label,
    unit: i.unit,
    sourceLabel: i.sourceLabel,
    asOf: i.asOf,
    latest: i.values[i.values.length - 1],
    previous: i.values.length > 1 ? i.values[i.values.length - 2] : null,
    topicTags: i.topicTags,
    countryTags: i.countryTags || [],
    points: i.values.length,
    outcomeLabel: i.outcomeLabel, // polymarket only
    marketUrl: i.marketUrl,       // polymarket only
  })),
}

writeFileSync(DIGEST_PATH, JSON.stringify(digest, null, 2))
console.log(`Wrote ${DIGEST_PATH} — ${digest.indicators.length} entries`)

const elapsed = Math.round((Date.now() - started) / 1000)
console.log(`Trends: ${indicators.length} indicators fetched — ${elapsed}s`)

// ── Helpers ────────────────────────────────────────────────────────────────

/** Merge a fetched series into its registry entry, producing a snapshot row. */
function buildIndicatorEntry(ind, data) {
  return {
    id: ind.id,
    label: ind.label,
    unit: ind.unit,
    source: ind.source,
    seriesId: ind.seriesId,
    cadence: ind.cadence,
    topicTags: ind.topicTags,
    countryTags: ind.countryTags || [],
    defaultHighlight: ind.defaultHighlight || 'last',
    sourceLabel: ind.sourceLabel,
    values: data.values,
    periods: data.periods,
    asOf: data.asOf,
  }
}
