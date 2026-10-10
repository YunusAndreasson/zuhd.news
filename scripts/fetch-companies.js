#!/usr/bin/env node
// Share prices of the world's largest companies, for the app's menu.
//
// Output: content/.companies.json
// Shape:  { generated, companies: [{ id, name, about, symbol, iso2, currency,
//          currencyName, level, marketValue?, asOf, series: { periods, values }, sourceLabel,
//          blurb, tickers, topicTags, commonName?, stale? }],
//          skipped: [{ id, reason }] }
//
// Reads COMPANY_TRACKED from lib/company-metadata.js and fetches each symbol
// from Yahoo Finance through lib/trends-sources/stocks.js — the fetcher the
// exchange layer uses, with its host alternation and seven-day last-good
// cache. The loop is the exchange layer's too: `fetchQuotes`
// (lib/quote-snapshot.js), one symbol at a time, because parallel calls trip
// Yahoo's rate limit on a shared IP. Twenty symbols at 200-400ms each is under
// ten seconds.
//
// Completed sessions only (`completedCloses`): the list prints one close a
// day, so a cycle that runs while New York is open publishes yesterday's close
// rather than a price of that minute, and the published file changes when a
// market closes instead of on every cycle.
//
// `marketValue` is the company's worth in US dollars at that close: the
// catalog's share count by the close, at the newest rate the trends fetch has
// kept for the share's currency (`lib/fx-history.js`). The list is the largest
// companies, and a share price does not say which is larger.
//
// `skipped` names the companies this snapshot does not hold, each with its
// reason.
//
// Best-effort: if nothing usable comes back the script logs and exits 0,
// leaving any previous .companies.json intact (build.js skips the endpoint
// when the file is absent, and the app treats a 404 as "no list").

import { COMPANY_TRACKED } from './lib/company-metadata.js'
import { companyRecord } from './lib/companies.js'
import { latestPerUsd, readFxHistory } from './lib/fx-history.js'
import { fetchQuotes, quoteSummary } from './lib/quote-snapshot.js'
import { Degrade, snapshotStage } from './lib/snapshot-stage.js'
import { stageBudget } from './lib/stage-budget.js'

const started = Date.now()
// Twenty-five seconds kept back, not ten: a symbol in flight when the budget
// runs out cannot be cut and may take twenty (two hosts, ten seconds each).
const budget = stageBudget('fetch-companies', { keptBack: 25_000 })
console.log(`Fetching company quotes (Yahoo Finance, ${COMPANY_TRACKED.length} companies)`)

/** What the loop came to, for the last line. */
let run

const { written, snapshot } = await snapshotStage('fetch-companies', 'companies', produce, {
  isEmpty: (s) => s.companies.length === 0,
})

if (written) {
  console.log(
    `  ✓ wrote ${snapshot.companies.length}/${COMPANY_TRACKED.length} companies` +
      quoteSummary(snapshot.companies, run) +
      ` in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  )
}

async function produce({ previous }) {
  const perUsd = latestPerUsd(readFxHistory())
  const toRecord = (entry, data, opts) => companyRecord(entry, data, { ...opts, perUsd })
  run = await fetchQuotes(COMPANY_TRACKED, toRecord, { signal: budget, previous: previous?.companies })
  if (run.records.length === 0) throw new Degrade('no usable company data returned')
  return { generated: new Date().toISOString(), companies: run.records, skipped: run.skipped }
}
