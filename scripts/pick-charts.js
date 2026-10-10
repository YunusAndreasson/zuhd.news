#!/usr/bin/env node
// The chart desk (Stage 3.65): sets `chart:` on the cycle's new articles.
//
// One Haiku call over the whole batch, after the entity stage has said what
// each story names and is about and after the snapshot fetches, so the series
// it chooses from are the ones this cycle publishes. What it is asked, what is
// kept of its answer and how often a series may repeat are `lib/chart-desk.js`.
//
// The desk is the only thing that sets a chart. An article it read and gave
// none loses any `chart:` it arrived with; an article it did not answer for,
// and every article of a cycle whose call failed, is left as it stands. A
// failure costs the batch its charts and never the publish.
//
//   node scripts/pick-charts.js --dry-run
//       this cycle's batch, nothing written
//   node scripts/pick-charts.js --since 2026-10-03 [--until 2026-10-11] [--out picks.json]
//       replay over the corpus, a day at a time and in batches the size of a
//       cycle's, with each day's own contracts where its trends file is still
//       held. Never writes an article.

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { argAt, hasFlag } from './lib/argv.js'
import { tryReadArticle } from './lib/article.js'
import { articleFilesSince, batchFiles } from './lib/article-files.js'
import { REPEAT_HOURS, applyCaps, candidatesFor, chartDeskPrompt, contractRows, parseChartDesk, recentCharts } from './lib/chart-desk.js'
import { callClaudeJson, callCost } from './lib/claude-envelope.js'
import { pathOf } from './lib/datasets.js'
import { removeFrontmatterKey, replaceFrontmatterKey, yamlString } from './lib/frontmatter.js'
import { readJson, writeJson, writeText } from './lib/json-file.js'
import { modelFor } from './lib/models.js'
import { runStage } from './lib/stage.js'
import { latestTrendsPath } from './lib/trends-snapshot.js'

/** The stage is killed at 120 s (`cycle/stages.js`); the call is given 90, as
 *  the entity stage's batched scan is, and what is left is for the writes. */
const CALL_TIMEOUT_MS = 90_000

/** A replay's batch: what a cycle publishes. */
const REPLAY_BATCH = 12

/** Everything the desk reads besides the articles, with `trendsPath` the snapshot to read. */
function readSources(trendsPath, now) {
  return {
    trends: trendsPath ? readJson(trendsPath) : null,
    chokepoints: readJson(pathOf('chokepoints'))?.chokepoints || [],
    markets: readJson(pathOf('markets'))?.exchanges || [],
    companies: readJson(pathOf('companies'))?.companies || [],
    dispatch: readJson(pathOf('indicatorDispatch'))?.items || {},
    now,
  }
}

/**
 * Ask the desk about one batch.
 *
 * @param {{ slug: string, title: string, body: string, meta: any }[]} articles
 * @param {import('./lib/chart-desk.js').DeskSources} sources
 * @param {Record<string, number>} recent
 * @returns {Promise<{ kept: Map<string, any>, capped: any[], candidates: Map<string, any[]>, error?: string, asked: boolean }>}
 */
async function decide(articles, sources, recent) {
  const candidates = new Map(articles.map((a) => [a.slug, candidatesFor(a, sources)]))
  const contracts = contractRows(sources)
  const offered = [...candidates.values()].reduce((n, rows) => n + rows.length, 0)
  // Nothing to choose from is an answer, and not one worth a call.
  if (offered === 0 && contracts.length === 0) {
    return { kept: new Map(articles.map((a) => [a.slug, { chart: null }])), capped: [], candidates, asked: false }
  }
  const res = await callClaudeJson(chartDeskPrompt(articles, candidates, contracts, recent), {
    model: modelFor('haiku'),
    timeout: CALL_TIMEOUT_MS,
    maxBuffer: 512 * 1024,
  })
  if (res.error) return { kept: new Map(), capped: [], candidates, error: res.error, asked: true }
  console.log(`  · chart-desk: ${articles.length} read, ${offered} series and ${contracts.length} contracts on offer, answered in ${(res.elapsedMs / 1000).toFixed(1)}s${callCost(res)}`)
  const picks = parseChartDesk(res.out, candidates, contracts)
  return { ...applyCaps(articles.map((a) => a.slug), picks, recent), candidates, asked: true }
}

/** The tally a run ends on: how many charts, by role and by id. */
function tally(decisions) {
  const set = decisions.filter((d) => d.chart)
  const roles = { subject: 0, cause: 0, decides: 0 }
  /** @type {Record<string, number>} */
  const ids = {}
  for (const d of set) {
    roles[d.role]++
    ids[d.chart] = (ids[d.chart] || 0) + 1
  }
  const top = Object.entries(ids).sort((a, b) => b[1] - a[1])
  return { set: set.length, roles, ids: top }
}

/** The cycle's batch. */
async function cycle(DRY_RUN) {
  if (!existsSync(pathOf('newArticles'))) {
    console.log('No new articles list found — skipping the chart desk.')
    return { skipped: 'no new articles list' }
  }
  const now = Date.now()
  const files = batchFiles()
  const articles = []
  for (const { path, name } of files) {
    if (!name.endsWith('.md') || !existsSync(path)) continue
    // One that does not parse is the validator's to move aside.
    const { article } = tryReadArticle(path)
    if (article) articles.push({ ...article, title: typeof article.meta.title === 'string' ? article.meta.title : '' })
  }
  if (articles.length === 0) {
    console.log('No new articles — skipping the chart desk.')
    return { skipped: 'no new articles' }
  }

  // What already runs under the last day's stories, by when each was
  // published: the file's own time, as the build reads it (`addedAt`).
  const dir = pathOf('articles')
  const batch = new Set(files.map((f) => f.name))
  const published = []
  for (const name of articleFilesSince(dir, now - REPEAT_HOURS * 3_600_000)) {
    if (batch.has(name)) continue
    const path = join(dir, name)
    const at = statSync(path).mtimeMs
    if (now - at >= REPEAT_HOURS * 3_600_000) continue
    const { article } = tryReadArticle(path)
    if (article?.meta.chart) published.push({ chart: article.meta.chart, at })
  }
  const recent = recentCharts(published, now)

  const { kept, capped, candidates, error } = await decide(articles, readSources(latestTrendsPath(), now), recent)
  if (error) {
    console.error(`  ✗ chart-desk: ${error} — this batch keeps the charts it has`)
    return { degraded: error }
  }

  const decisions = []
  for (const a of articles) {
    const pick = kept.get(a.slug)
    if (!pick) continue
    const updated = pick.chart
      ? replaceFrontmatterKey(a.raw, 'chart', [`chart: ${yamlString(pick.chart)}`])
      : removeFrontmatterKey(a.raw, 'chart')
    if (!DRY_RUN && updated !== a.raw) writeText(a.path, updated)
    decisions.push({ slug: a.slug, ...pick })
    const offered = candidates.get(a.slug)?.length ?? 0
    console.log(`  ${pick.chart ? `▣ ${pick.chart} (${pick.role})` : `· none (${offered} offered)`}  ${a.slug}`)
  }
  for (const c of capped) console.log(`  CHART CAPPED (${c.id} as ${c.role}, already under ${c.under}): ${c.slug}`)

  const t = tally(decisions)
  console.log(
    `Chart desk: ${t.set} set across ${decisions.length}/${articles.length} read ` +
      `(subject ${t.roles.subject}, cause ${t.roles.cause}, decides ${t.roles.decides}), ${capped.length} capped` +
      `${t.ids.length ? `; ${t.ids.map(([id, n]) => (n > 1 ? `${id} ×${n}` : id)).join(', ')}` : ''}${DRY_RUN ? ' — dry run, nothing written' : ''}`,
  )
  return { counts: { read: decisions.length, listed: articles.length, set: t.set, ...t.roles, capped: capped.length } }
}

/** A replay over the corpus: what the desk would have set, beside what ran. */
async function replay(since, until, outPath) {
  const from = Date.parse(`${since}T00:00:00Z`)
  const to = until ? Date.parse(`${until}T00:00:00Z`) : Date.now()
  if (!Number.isFinite(from) || !Number.isFinite(to)) throw new Error('--since and --until take a date, YYYY-MM-DD')
  const dir = pathOf('articles')
  const articles = []
  for (const name of articleFilesSince(dir, from)) {
    const { article } = tryReadArticle(join(dir, name))
    const at = Date.parse(article?.meta.date)
    if (!article || !(at >= from && at < to)) continue
    articles.push({ ...article, title: String(article.meta.title || ''), at })
  }
  articles.sort((a, b) => a.at - b.at)

  const trendsDir = pathOf('trends')
  const days = existsSync(trendsDir) ? readdirSync(trendsDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : []
  /** The snapshot a cycle of that day read: the day's own, or the newest before it. */
  const trendsFor = (day) => {
    const file = days.filter((f) => f.slice(0, 10) <= day).at(-1) ?? days[0]
    return file ? join(trendsDir, file) : null
  }

  const batches = []
  for (const a of articles) {
    const day = new Date(a.at).toISOString().slice(0, 10)
    const last = batches.at(-1)
    if (last && last.day === day && last.articles.length < REPLAY_BATCH) last.articles.push(a)
    else batches.push({ day, articles: [a] })
  }

  const published = []
  const rows = []
  let failed = 0
  for (const batch of batches) {
    const now = batch.articles.at(-1).at + 3_600_000
    const recent = recentCharts(published, now)
    const sources = readSources(trendsFor(batch.day), now)
    // A contract of that day had its paragraph that day, and has lost it since
    // if it left the deck (the dispatch prunes): today's file would hide it.
    for (const ind of sources.trends?.indicators || []) {
      if (ind?.source === 'polymarket' && !sources.dispatch[ind.id]?.standing) sources.dispatch[ind.id] = { standing: 'held that day' }
    }
    const { kept, capped, candidates, error } = await decide(batch.articles, sources, recent)
    if (error) {
      failed++
      console.error(`  ✗ ${batch.day}: ${error}`)
      continue
    }
    for (const a of batch.articles) {
      const pick = kept.get(a.slug)
      if (!pick) continue
      if (pick.chart) published.push({ chart: pick.chart, at: a.at })
      const was = typeof a.meta.chart === 'string' ? a.meta.chart : null
      const cap = capped.find((c) => c.slug === a.slug)
      rows.push({
        slug: a.slug, day: batch.day, category: a.meta.category, title: a.title,
        was, chart: pick.chart, role: pick.chart ? pick.role : null,
        capped: cap ? `${cap.id} as ${cap.role}` : null,
        offered: (candidates.get(a.slug) || []).map((c) => c.id),
      })
      if (was || pick.chart || cap) {
        console.log(`${batch.day} ${String(a.meta.category).padEnd(8)} ${(was ?? '—').padEnd(30)} → ${(pick.chart ? `${pick.chart} (${pick.role})` : cap ? `capped: ${cap.id}` : '—').padEnd(44)} ${a.title}`)
      }
    }
  }

  const count = (list) => {
    /** @type {Record<string, number>} */
    const ids = {}
    for (const id of list) ids[id] = (ids[id] || 0) + 1
    return Object.entries(ids).sort((a, b) => b[1] - a[1])
  }
  const before = count(rows.filter((r) => r.was).map((r) => r.was))
  const after = count(rows.filter((r) => r.chart).map((r) => r.chart))
  const share = (ids) => (ids.length ? `${ids.length} ids, top ${ids[0][0]} ${Math.round((ids[0][1] / ids.reduce((n, [, c]) => n + c, 0)) * 100)}%` : 'none')
  const total = (ids) => ids.reduce((n, [, c]) => n + c, 0)
  console.log(`\nReplay ${since} → ${until ?? 'now'}: ${rows.length} of ${articles.length} articles read in ${batches.length} batches${failed ? `, ${failed} batches failed` : ''}`)
  console.log(`  as published: ${total(before)} charts (${share(before)})`)
  console.log(`  the desk:     ${total(after)} charts (${share(after)}), ${rows.filter((r) => r.capped).length} capped`)
  for (const category of ['politics', 'economy', 'science', 'tech']) {
    const of = rows.filter((r) => r.category === category)
    console.log(`  ${category.padEnd(8)} ${of.filter((r) => r.was).length} → ${of.filter((r) => r.chart).length} of ${of.length}`)
  }
  console.log(`  ids: ${after.map(([id, n]) => (n > 1 ? `${id} ×${n}` : id)).join(', ')}`)
  if (outPath) writeJson(outPath, rows)
  return { counts: { read: rows.length, listed: articles.length, set: total(after), failed } }
}

export async function main() {
  const since = argAt('since')
  if (typeof since === 'string') return replay(since, argAt('until'), argAt('out'))
  return cycle(hasFlag('dry-run'))
}

await runStage(import.meta, 'pick-charts', main)
