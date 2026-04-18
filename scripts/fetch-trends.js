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

import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { INDICATORS, SOURCES } from './lib/trends-registry.js'

const ROOT = new URL('..', import.meta.url).pathname
const TRENDS_DIR = join(ROOT, 'content', 'trends')
const FX_CACHE = join(TRENDS_DIR, '.fx-history.json')
const DIGEST_PATH = '/tmp/zuhd-trends-digest.json'

const today = new Date().toISOString().slice(0, 10)
const SNAPSHOT_PATH = join(TRENDS_DIR, `${today}.json`)

// ── Run ────────────────────────────────────────────────────────────────────

const started = Date.now()
console.log(`Fetching trends for ${today}`)

const indicators = [] // populated snapshot entries

// Generic dispatch: each source declares its mode in trends-registry.js.
// Adding a new source = add one entry to SOURCES + registry rows. No
// changes required here.
for (const [name, def] of Object.entries(SOURCES)) {
  const missingEnv = def.requiredEnv.filter((k) => !process.env[k])
  if (missingEnv.length > 0) {
    console.warn(`  ⚠ ${name}: missing env ${missingEnv.join(', ')} — skipping`)
    continue
  }

  if (def.mode === 'dynamic') {
    console.log(`${name}: top markets`)
    const results = await def.fetcher()
    if (results) for (const r of results) indicators.push(r)
    continue
  }

  const matched = INDICATORS.filter((i) => i.source === name)
  if (matched.length === 0) continue

  if (def.mode === 'perIndicator') {
    console.log(`${name}: ${matched.length} series`)
    const apiKey = def.requiredEnv[0] ? process.env[def.requiredEnv[0]] : undefined
    for (const ind of matched) {
      const data = apiKey != null ? await def.fetcher(ind, apiKey) : await def.fetcher(ind)
      if (data) indicators.push(buildIndicatorEntry(ind, data))
    }
    continue
  }

  if (def.mode === 'batched') {
    console.log(`${name}: ${matched.length} series (batched)`)
    const seriesIds = matched.map((i) => i.seriesId)
    const apiKey = process.env[def.requiredEnv[0]]
    const map = await def.fetcher(seriesIds, apiKey, FX_CACHE)
    if (map) {
      for (const ind of matched) {
        const data = map[ind.seriesId]
        if (data) indicators.push(buildIndicatorEntry(ind, data))
      }
    }
  }
}

// Catch silent ID collisions early — trends-expand.js's find() returns the
// first match, so a dupe means a chart pick can resolve to the wrong series.
const seenIds = new Set()
for (const i of indicators) {
  if (seenIds.has(i.id)) console.warn(`  ⚠ duplicate indicator id: ${i.id}`)
  seenIds.add(i.id)
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
    ...(ind.field ? { field: ind.field } : {}),
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
