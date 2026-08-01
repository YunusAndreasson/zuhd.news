#!/usr/bin/env node
// Stock-exchange snapshot for the situational map's markets layer.
//
// Output: content/.markets.json
// Shape:  { generated, exchanges: [{ id, name, indexName, city, iso2, lat, lng,
//          level, changePct, currency, tz, sessionStart, sessionEnd, days,
//          series: { periods, values }, asOf, sourceLabel, stale?, blurb,
//          topicTags, countryTags }] }
//
// Reads MARKET_TRACKED from lib/market-metadata.js and fetches each symbol from
// Yahoo Finance through lib/trends-sources/stocks.js, which already carries the
// host alternation and 7-day last-good cache that source needs.
//
// Sequential on purpose. extract-entities.js documents why: parallel calls trip
// Yahoo's rate limit on a shared IP. Thirty symbols at 200-400ms each is ~10s,
// comfortably inside the stage timeout.
//
// Best-effort: if nothing usable comes back the script logs and exits 0,
// leaving any previous .markets.json intact (build.js skips the endpoint when
// the file is absent, so a missing snapshot degrades to "no layer this run").

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MARKET_CATALOG, MARKET_TRACKED, instrumentMismatch } from './lib/market-metadata.js'
import { fetchYahooStock } from './lib/trends-sources/stocks.js'

const ROOT = new URL('..', import.meta.url).pathname
const OUTPUT_PATH = join(ROOT, 'content', '.markets.json')

// A quarter of daily closes. The 1mo default gives ~21 points, which is a
// wobble rather than a shape once it is drawn 640 units wide.
const RANGE = '3mo'

const started = Date.now()
console.log(`Fetching market snapshot (Yahoo Finance, ${MARKET_TRACKED.length} exchanges)`)

const exchanges = []
const rejected = []

for (const m of MARKET_TRACKED) {
  const data = await fetchYahooStock(m.symbol, { range: RANGE })
  if (!data) continue

  // The wrong-instrument guard. Yahoo answers an unknown symbol with a
  // *different* instrument rather than a 404 — probing this catalog turned up
  // three (`^PSI` → a PIMCO fund, `^NGX` → Nasdaq Next Generation 100, `^MSI` →
  // a USD figure that is not Muscat). Those three happen to be caught upstream
  // by the ≥5-closes rule in stocks.js, because each carries almost no history.
  // This guard is for the case that rule cannot see: an impostor with a full,
  // healthy series, which would otherwise publish an invented index level with
  // nothing thrown and nothing logged. Verified to reject ^N225 and ^FTSE when
  // asked for under the NYSE entry.
  const mismatch = instrumentMismatch(m, data)
  if (mismatch) {
    rejected.push(`${m.id} (${m.symbol}): ${mismatch}`)
    continue
  }

  // The day's change comes from the last two closes, never from Yahoo's
  // `chartPreviousClose` — that is the close before the *window*, so against a
  // 3-month range it would report the quarter's move as the day's.
  const values = data.values
  if (values.length < 2) {
    rejected.push(`${m.id} (${m.symbol}): ${values.length} usable close(s), cannot derive a change`)
    continue
  }
  const level = values[values.length - 1]
  const previous = values[values.length - 2]
  if (!Number.isFinite(level) || !Number.isFinite(previous) || previous === 0) {
    rejected.push(`${m.id} (${m.symbol}): unusable closes ${previous} → ${level}`)
    continue
  }

  exchanges.push({
    id: m.id,
    name: m.name,
    indexName: m.indexName,
    city: m.city,
    iso2: m.iso2,
    lat: m.lat,
    lng: m.lng,
    level,
    changePct: Number((((level - previous) / previous) * 100).toFixed(3)),
    currency: m.currency,
    tz: m.tz,
    sessionStart: m.sessionStart,
    sessionEnd: m.sessionEnd,
    days: m.days,
    series: { periods: data.periods, values },
    asOf: data.asOf,
    sourceLabel: `Yahoo Finance · ${data.exchange || m.indexName}`,
    blurb: m.blurb,
    topicTags: m.topicTags,
    countryTags: m.countryTags,
    ...(data.stale ? { stale: true } : {}),
  })
}

if (exchanges.length === 0) {
  console.error('  ✗ no usable exchange data returned — leaving previous snapshot in place')
  process.exit(0)
}

writeFileSync(
  OUTPUT_PATH,
  `${JSON.stringify({ generated: new Date().toISOString(), exchanges }, null, 2)}\n`,
)

for (const r of rejected) console.error(`  ✗ rejected ${r}`)

const staleCount = exchanges.filter((e) => e.stale).length
const notDrawn = MARKET_CATALOG.length - MARKET_TRACKED.length
console.log(
  `  ✓ wrote ${exchanges.length}/${MARKET_TRACKED.length} exchanges` +
    (staleCount ? ` (${staleCount} from cache)` : '') +
    (rejected.length ? `, ${rejected.length} rejected` : '') +
    `, ${notDrawn} recorded but not drawn` +
    ` in ${((Date.now() - started) / 1000).toFixed(1)}s`,
)
