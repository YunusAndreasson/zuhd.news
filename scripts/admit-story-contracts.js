#!/usr/bin/env node
// The story contracts the chart desk set (Stage 3.66): each is added to the
// trends snapshot beside the deck, flagged `storyContract`, so the build
// publishes it and the app has its line to draw. The deck's fetch keeps it
// while a story draws it (`fetchPolymarketTop`).
//
// Only a contract the desk chose is added: one found and not chosen costs
// nothing past the search. A story whose contract cannot be added (closed,
// decided, too short a history) loses its chart here, as the validator would
// take it for naming nothing, and is logged.
//
//   node scripts/admit-story-contracts.js --dry-run   print, write nothing

import { existsSync } from 'node:fs'
import { hasFlag } from './lib/argv.js'
import { tryReadArticle } from './lib/article.js'
import { batchFiles } from './lib/article-files.js'
import { pathOf } from './lib/datasets.js'
import { removeFrontmatterKey, replaceFrontmatterKey, yamlString } from './lib/frontmatter.js'
import { readJson, writeJson, writeText } from './lib/json-file.js'
import { runStage } from './lib/stage.js'
import { storyContractRows } from './lib/trends-sources/polymarket.js'
import { latestTrendsPath } from './lib/trends-snapshot.js'

export async function main() {
  const DRY_RUN = hasFlag('dry-run')
  const found = readJson(pathOf('storyContracts'))?.stories || {}
  const trendsPath = latestTrendsPath()
  const snapshot = trendsPath ? readJson(trendsPath) : null
  if (!existsSync(pathOf('newArticles')) || !snapshot || Object.keys(found).length === 0) {
    console.log('No story contracts to admit.')
    return { skipped: 'nothing found' }
  }
  const held = new Set((snapshot.indicators || []).map((i) => i?.id))

  /** The stories whose chart is one of their own finds the snapshot lacks. */
  const wanted = []
  for (const { path, name } of batchFiles()) {
    if (!name.endsWith('.md') || !existsSync(path)) continue
    const { article } = tryReadArticle(path)
    const chart = typeof article?.meta.chart === 'string' ? article.meta.chart.trim() : ''
    const find = (found[article?.slug ?? ''] || []).find((f) => f.id === chart)
    if (article && find && !held.has(chart)) wanted.push({ article, find })
  }
  if (wanted.length === 0) {
    console.log('Story contracts: the desk set none that the snapshot lacks.')
    return { counts: { wanted: 0, admitted: 0, dropped: 0 } }
  }

  const contracts = (snapshot.indicators || []).filter((i) => i?.source === 'polymarket')
  const slugs = [...new Set(wanted.map((w) => w.find.slug))]
  const rows = await storyContractRows(slugs, contracts)
  const bySlug = new Map(rows.map((r) => [r.seriesId, r]))

  let dropped = 0
  for (const { article, find } of wanted) {
    const row = bySlug.get(find.slug)
    if (row) console.log(`  ▣ ${row.id}: ${row.label}  ${article.slug}`)
    else {
      dropped++
      console.log(`  CHART DROPPED (${find.id}: no line to draw): ${article.slug}`)
    }
    const updated = !row
      ? removeFrontmatterKey(article.raw, 'chart')
      : row.id !== find.id
        ? replaceFrontmatterKey(article.raw, 'chart', [`chart: ${yamlString(row.id)}`])
        : article.raw
    if (!DRY_RUN && updated !== article.raw) writeText(article.path, updated)
  }
  if (!DRY_RUN && rows.length) writeJson(/** @type {string} */ (trendsPath), { ...snapshot, indicators: [...snapshot.indicators, ...rows] })
  console.log(`Story contracts: ${rows.length} admitted for ${wanted.length} stories, ${dropped} charts dropped${DRY_RUN ? ' — dry run, nothing written' : ''}`)
  return { counts: { wanted: wanted.length, admitted: rows.length, dropped } }
}

await runStage(import.meta, 'admit-story-contracts', main)
