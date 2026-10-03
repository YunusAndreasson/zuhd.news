#!/usr/bin/env node
// Share prices of the world's largest companies, for the app's menu.
//
// Output: content/.companies.json
// Shape:  { generated, companies: [{ id, name, about, symbol, iso2, currency,
//          currencyName, level, asOf, series: { periods, values }, sourceLabel,
//          blurb, tickers, topicTags, stale? }] }
//
// Reads COMPANY_TRACKED from lib/company-metadata.js and fetches each symbol
// from Yahoo Finance through lib/trends-sources/stocks.js — the fetcher the
// exchange layer uses, with its host alternation and seven-day last-good
// cache. `fetch-markets.js` is the model for everything here.
//
// Sequential, for that script's reason: parallel calls trip Yahoo's rate limit
// on a shared IP. Twenty symbols at 200-400ms each is under ten seconds.
//
// Completed sessions only (`completedCloses`): the list prints one close a
// day, so a cycle that runs while New York is open publishes yesterday's close
// rather than a price of that minute, and the published file changes when a
// market closes instead of on every cycle.
//
// Best-effort: if nothing usable comes back the script logs and exits 0,
// leaving any previous .companies.json intact (build.js skips the endpoint
// when the file is absent, and the app treats a 404 as "no list").

import { join } from 'node:path'
import { COMPANY_TRACKED } from './lib/company-metadata.js'
import { companyRecord } from './lib/companies.js'
import { fetchYahooStock, isStaleAsOf } from './lib/trends-sources/stocks.js'
import { ROOT } from './lib/paths.js'
import { writeJson } from './lib/json-file.js'

const OUTPUT_PATH = join(ROOT, 'content', '.companies.json')

// A quarter of daily closes, as the exchange layer charts.
const RANGE = '3mo'

const started = Date.now()
console.log(`Fetching company quotes (Yahoo Finance, ${COMPANY_TRACKED.length} companies)`)

const companies = []
const rejected = []

for (const entry of COMPANY_TRACKED) {
  const data = await fetchYahooStock(entry.symbol, { range: RANGE })
  if (!data) continue

  // Stale whichever path said so: the cache serving a week-old series, or a
  // live fetch whose feed stopped (`fetch-markets.js`).
  const stale = Boolean(data.stale) || isStaleAsOf(data.asOf)
  const built = companyRecord(entry, data, { stale })
  if (!built.record) {
    rejected.push(`${entry.id} (${entry.symbol}): ${built.rejected}`)
    continue
  }
  if (stale && !data.stale) {
    console.error(`  ⚠ ${entry.id} (${entry.symbol}): last completed session ${data.asOf} — marked stale`)
  }
  companies.push(built.record)
}

for (const r of rejected) console.error(`  ✗ rejected ${r}`)

if (companies.length === 0) {
  console.error('  ✗ no usable company data returned — leaving previous snapshot in place')
  process.exit(0)
}

writeJson(OUTPUT_PATH, { generated: new Date().toISOString(), companies })

const staleCount = companies.filter((c) => c.stale).length
console.log(
  `  ✓ wrote ${companies.length}/${COMPANY_TRACKED.length} companies` +
    (staleCount ? ` (${staleCount} from cache)` : '') +
    (rejected.length ? `, ${rejected.length} rejected` : '') +
    ` in ${((Date.now() - started) / 1000).toFixed(1)}s`,
)
