#!/usr/bin/env node
// Cloudflare Zone Analytics → content/.analytics.json
// Pulls past-N-day request counts grouped by path (article slug) via GraphQL.
// Requires CLOUDFLARE_API_TOKEN with Zone > Analytics > Read.
// Fail-soft: if the token lacks permission or the API is down, writes an error marker
// and exits 0 so it never breaks the cycle.

import { readJson, writeJson } from './lib/json-file.js'
import { stageBudget } from './lib/stage-budget.js'

const ZONE_ID = '2e290179ae62b061719437bb31373426'  // zuhd.news
const TOKEN = process.env.CLOUDFLARE_API_TOKEN
const OUT = 'content/.analytics.json'
const HISTORY = 'content/.analytics-history.json'
// Free tier caps queries at 24h; we fetch 1d per run and accumulate into a rolling history file.
const LOOKBACK_HOURS = 24

if (!TOKEN) {
  console.error('CLOUDFLARE_API_TOKEN not set — skipping analytics fetch')
  process.exit(0)
}

const now = new Date()
const since = new Date(now.getTime() - LOOKBACK_HOURS * 3600000)

// Two queries: (1) per-path totals over the window; (2) per-day totals for trend.
const QUERY = `
  query($zoneTag: string, $from: Time, $to: Time) {
    viewer {
      zones(filter: {zoneTag: $zoneTag}) {
        topPaths: httpRequestsAdaptiveGroups(
          limit: 500,
          filter: { datetime_gt: $from, datetime_lt: $to, edgeResponseStatus: 200 }
          orderBy: [sum_edgeResponseBytes_DESC]
        ) {
          count
          sum { edgeResponseBytes visits }
          dimensions { clientRequestPath }
        }
        perDay: httpRequestsAdaptiveGroups(
          limit: 100,
          filter: { datetime_gt: $from, datetime_lt: $to }
        ) {
          count
          dimensions { date }
        }
      }
    }
  }
`

async function main() {
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    // It had no deadline of its own: a hung request ran until the stage's
    // `timeout 60` killed it, with nothing in the log but the exit status.
    signal: stageBudget('fetch-analytics'),
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: QUERY,
      variables: {
        zoneTag: ZONE_ID,
        from: since.toISOString(),
        to: now.toISOString(),
      },
    }),
  })

  const body = await res.json()
  if (body.errors?.length) {
    const msg = body.errors.map(e => e.message).join('; ')
    console.error(`analytics API error: ${msg}`)
    // Preserve prior file if we have one; write a marker alongside.
    writeJson('content/.analytics-error.json', {
      fetchedAt: now.toISOString(),
      error: msg,
      hint: 'Token likely needs: Zone > Analytics > Read on zone zuhd.news',
    })
    process.exit(0)
  }

  const zone = body.data?.viewer?.zones?.[0]
  if (!zone) {
    console.error('analytics: no zone data returned')
    process.exit(0)
  }

  // Group top paths, filter to article slugs
  const paths = {}
  for (const row of zone.topPaths || []) {
    const p = row.dimensions?.clientRequestPath || ''
    // Article paths: /a/YYYY-MM-DD-slug
    const m = p.match(/^\/a\/(\d{4}-\d{2}-\d{2}-[a-z0-9-]+)\/?$/)
    if (!m) continue
    const slug = m[1]
    paths[slug] = (paths[slug] || 0) + row.count
  }

  const sortedArticles = Object.entries(paths)
    .map(([slug, views]) => ({ slug, views }))
    .sort((a, b) => b.views - a.views)

  // A day with no article among the paths is a changed response, never a day
  // nobody read anything: every run has held two or three hundred. Pushed into
  // the history it would replace today's run with an empty one, so nothing is
  // written and the line says what the first row held.
  if (sortedArticles.length === 0) {
    const rows = zone.topPaths || []
    const first = rows.length > 0 ? `; the first is ${JSON.stringify(rows[0]).slice(0, 200)}` : ''
    console.error(`analytics: ${rows.length} paths and no article among them${first} — keeping the previous snapshot`)
    process.exit(0)
  }

  const perDay = {}
  for (const row of zone.perDay || []) {
    const d = row.dimensions?.date
    if (d) perDay[d] = (perDay[d] || 0) + row.count
  }

  const totalRequests = Object.values(perDay).reduce((a, b) => a + b, 0)

  // Append to rolling history; dedupe by fetchedAt day-stamp (last run wins per UTC day)
  const history = readJson(HISTORY, { runs: [] })
  const dayKey = now.toISOString().slice(0, 10)
  history.runs = (history.runs || []).filter(r => r.dayKey !== dayKey)
  history.runs.push({ dayKey, fetchedAt: now.toISOString(), totalRequests, articles: sortedArticles })
  // Keep last 60 days
  history.runs = history.runs.slice(-60)
  writeJson(HISTORY, history)

  // Aggregate: merge per-article views across all retained history days
  const mergedArticles = {}
  const mergedPerDay = {}
  for (const run of history.runs) {
    mergedPerDay[run.dayKey] = run.totalRequests
    for (const a of (run.articles || [])) {
      mergedArticles[a.slug] = (mergedArticles[a.slug] || 0) + a.views
    }
  }
  const aggregatedArticles = Object.entries(mergedArticles)
    .map(([slug, views]) => ({ slug, views }))
    .sort((a, b) => b.views - a.views)

  const out = {
    fetchedAt: now.toISOString(),
    windowDays: history.runs.length,
    totalRequests: Object.values(mergedPerDay).reduce((a, b) => a + b, 0),
    lastRunRequests: totalRequests,
    perDay: mergedPerDay,
    articles: aggregatedArticles,
    articleCount: aggregatedArticles.length,
  }
  writeJson(OUT, out)
  console.error(`analytics: today ${totalRequests} requests, rolling ${out.totalRequests} across ${out.windowDays} day(s), ${aggregatedArticles.length} articles tracked`)
  if (aggregatedArticles.length) {
    console.error('  top 5 (rolling):')
    for (const a of aggregatedArticles.slice(0, 5)) console.error(`    ${a.views.toString().padStart(5)}  ${a.slug}`)
  }
}

main().catch(e => { console.error(`analytics fetch failed: ${e.message}`); process.exit(0) })
