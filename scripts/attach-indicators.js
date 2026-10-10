#!/usr/bin/env node
// Attaches live indicator levels to each selected story, before the writer runs.
//
// The crossreference between an article and a chart used to be built entirely
// after the fact: the writer wrote "oil prices fell", and `extract-entities.js`
// later noticed the word "oil" and hung a Brent chip off it. That chip is a
// decoration on a sentence that never engaged with the number. Handing the
// writer the number instead makes the link *earned* — "Brent at $71.20, down
// 8% in a fortnight" is a sentence the chart is genuinely about.
//
// Deterministic and free: no model call and no API call. It reads the payloads
// already on disk — the trends snapshot, `.chokepoints.json`, `.markets.json`
// and the desk's `.indicator-dispatch.json` — and the same `entity-registry.js`
// rules `extract-entities.js` uses, so the ids offered to the writer are
// exactly the ids the entity stage will resolve afterwards.
//
// Each story gets `indicators` (figures it may cite, each with how many recent
// stories already carry that level) and `calendar` (the next scheduled
// decision on its subject, for the future block). What is offered and why is
// `lib/indicator-offer.js`; this file is the reading and writing around it.
// Which series is drawn under the story is decided after it is written, by the
// chart desk (`pick-charts.js`).
//
// `--selection <path>` and `--dry-run` replay it against any selection without
// touching the cycle's file.
//
// ── On staleness, which is not a defect here ──────────────────────────────
//
// `fetch-trends.js` is Stage 3.4 and runs *after* the writer, so the freshest
// snapshot at this point is the previous cycle's. That is fine and must not be
// "fixed" by moving the fetch onto the critical path ahead of Stage 2: these
// series carry their own publication lag anyway — Brent's `asOf` in an 8 August
// snapshot is 3 August — so a fetch here would buy no freshness and would put a
// network call in front of the one stage that must not fail. What matters is
// that the writer knows the date, so `asOf` travels with every level and the
// prompt requires it be stated.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { argAt, hasFlag } from './lib/argv.js'
import { tryReadArticle } from './lib/article.js'
import { articleFilesSince } from './lib/article-files.js'
import { pathOf } from './lib/datasets.js'
import { carriedLevels, offerFor } from './lib/indicator-offer.js'
import { readJson, writeJson } from './lib/json-file.js'
import { runStage } from './lib/stage.js'
import { latestTrendsPath } from './lib/trends-snapshot.js'

/** How far back a level counts as already carried: the duplicate gates' three days. */
const CARRIED_MS = 72 * 3600 * 1000

/** The last three days' articles, for `carriedLevels`. */
function recentArticles(now) {
  const dir = pathOf('articles')
  if (!existsSync(dir)) return []
  const out = []
  for (const name of articleFilesSince(dir, now - CARRIED_MS)) {
    const { article } = tryReadArticle(join(dir, name))
    if (article && Date.parse(article.meta.date) >= now - CARRIED_MS) out.push(article)
  }
  return out
}

/** Say why nothing was attached, in the line the cycle's log has always carried, and stop. */
const skip = (why) => {
  console.log(`${why} — skipping indicator attach.`)
  return { skipped: why }
}

export function main() {
  const SELECTION = argAt('selection', pathOf('selection'))
  const DRY_RUN = hasFlag('dry-run')

  if (!existsSync(SELECTION)) return skip('No selection file')

  const path = latestTrendsPath()
  if (!path) return skip('No trends snapshot')
  const trends = readJson(path)
  if (!trends) return skip(`Trends snapshot unreadable (${path})`)
  const sources = {
    trends,
    chokepoints: readJson(pathOf('chokepoints'))?.chokepoints || [],
    markets: readJson(pathOf('markets'))?.exchanges || [],
  }

  let selection
  try {
    selection = JSON.parse(readFileSync(SELECTION, 'utf8'))
  } catch (err) {
    return skip(`Selection unreadable (${err.message})`)
  }
  if (!Array.isArray(selection)) return skip('Selection is not an array')

  const kinds = { series: 0, strait: 0, odds: 0, exchange: 0 }
  let attached = 0
  let carriedRows = 0
  let stale = 0
  let stories = 0
  let dated = 0

  const offers = new Map()
  for (const story of selection) {
    if (story && typeof story === 'object') offers.set(story, offerFor(story, sources))
  }
  const carried = carriedLevels(recentArticles(Date.now()), [...offers.values()].flatMap((o) => o.indicators))

  for (const [story, offer] of offers) {
    for (const row of offer.indicators) {
      if (carried[row.id] > 0) row.carried = carried[row.id]
    }
    stale += offer.stale
    // Written even when empty, so a rerun over a selection that already carries
    // an offer replaces it rather than leaving the last run's behind.
    story.indicators = offer.indicators
    story.calendar = offer.calendar
    if (!story.indicators.length) delete story.indicators
    if (!story.calendar.length) delete story.calendar
    dated += offer.calendar.length
    if (offer.indicators.length) stories++
    for (const row of offer.indicators) {
      attached++
      kinds[row.kind]++
      if (row.carried) carriedRows++
    }
    if (DRY_RUN && (offer.indicators.length || offer.calendar.length)) {
      console.log(`\n${story.title}`)
      for (const row of offer.indicators) {
        console.log(`  ${row.carried ? `×${row.carried}` : '· '} ${row.kind.padEnd(8)} ${row.id.padEnd(40)} ${row.level} ${row.unit}${row.normal != null ? ` (normal ${row.normal})` : ''}  as of ${row.asOf}`)
      }
      for (const e of offer.calendar) console.log(`  ◷ ${e.date} ${e.title}`)
    }
  }

  if (!DRY_RUN) writeJson(SELECTION, selection)
  console.log(
    `Indicators: ${attached} across ${stories}/${selection.length} stories ` +
      `(series ${kinds.series}, strait ${kinds.strait}, odds ${kinds.odds}, exchange ${kinds.exchange}; ${carriedRows} already carried), ` +
      `calendar ${dated}, ${stale} dropped as stale (snapshot ${trends.asOf || 'undated'})${DRY_RUN ? ' — dry run, nothing written' : ''}`,
  )
  return { counts: { ...kinds, attached, stories, picked: selection.length, carried: carriedRows, calendar: dated, stale } }
}

await runStage(import.meta, 'attach-indicators', main)
