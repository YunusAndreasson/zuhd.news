#!/usr/bin/env node
// Stock-exchange snapshot for the situational map's markets layer.
//
// Output: content/.markets.json
// Shape:  { generated, exchanges: [{ id, name, indexName, city, iso2, lat, lng,
//          level, changePct, currency, tz, sessionStart, sessionEnd, days,
//          series: { periods, values, dates, completed }, asOf, sourceLabel,
//          blurb, topicTags, countryTags, stale? }], skipped: [{ id, reason }] }
//
// Reads MARKET_TRACKED from lib/market-metadata.js and fetches each symbol from
// Yahoo Finance through lib/trends-sources/stocks.js, which already carries the
// host alternation and 7-day last-good cache that source needs. The loop is
// `fetchQuotes` (lib/quote-snapshot.js), which the company list shares, and an
// exchange's record is `exchangeRecord`, beside the catalog.
//
// `skipped` names the tracked exchanges this snapshot does not hold, each with
// its reason: a bounded dataset that does not say what it left out reads as
// complete coverage.
//
// Best-effort: if nothing usable comes back the script logs and exits 0,
// leaving any previous .markets.json intact (build.js skips the endpoint when
// the file is absent, so a missing snapshot degrades to "no layer this run").

import { MARKET_CATALOG, MARKET_TRACKED, exchangeRecord } from './lib/market-metadata.js'
import { fetchQuotes, quoteSummary } from './lib/quote-snapshot.js'
import { Degrade, snapshotStage } from './lib/snapshot-stage.js'

const started = Date.now()
console.log(`Fetching market snapshot (Yahoo Finance, ${MARKET_TRACKED.length} exchanges)`)

/** What the loop came to, for the last line. */
let run

const { written, snapshot } = await snapshotStage('fetch-markets', 'markets', produce, {
  isEmpty: (s) => s.exchanges.length === 0,
})

if (written) {
  const notDrawn = MARKET_CATALOG.length - MARKET_TRACKED.length
  console.log(
    `  ✓ wrote ${snapshot.exchanges.length}/${MARKET_TRACKED.length} exchanges` +
      quoteSummary(snapshot.exchanges, run) +
      `, ${notDrawn} recorded but not drawn` +
      ` in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  )
}

async function produce() {
  run = await fetchQuotes(MARKET_TRACKED, exchangeRecord)
  if (run.records.length === 0) throw new Degrade('no usable exchange data returned')
  return { generated: new Date().toISOString(), exchanges: run.records, skipped: run.skipped }
}
