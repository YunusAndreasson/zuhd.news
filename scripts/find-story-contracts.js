#!/usr/bin/env node
// Each new story's own contracts (Stage 3.62): the prediction markets that ask
// the question the story leaves open, for the chart desk to offer it beside
// its series (`lib/story-contracts.js` says why and what is kept).
//
// One Haiku call names a question per story as a few search words, and
// Polymarket's search answers each. Writes `/tmp/zuhd-story-contracts.json`,
// keyed by article slug, each find with the id it would be published under.
// Adds nothing to the snapshot: only what the desk sets is admitted, after it
// (`admit-story-contracts.js`). A failed call or search costs those stories
// their own contracts and nothing else.
//
//   node scripts/find-story-contracts.js --dry-run   print, write nothing

import { existsSync } from 'node:fs'
import { hasFlag } from './lib/argv.js'
import { tryReadArticle } from './lib/article.js'
import { batchFiles } from './lib/article-files.js'
import { callClaudeJson, callCost } from './lib/claude-envelope.js'
import { pathOf } from './lib/datasets.js'
import { fetchJson } from './lib/http.js'
import { readJson, writeJson } from './lib/json-file.js'
import { modelFor } from './lib/models.js'
import { runStage } from './lib/stage.js'
import { contractsFromSearch, parseQueries, queryPrompt } from './lib/story-contracts.js'
import { storyContractId } from './lib/trends-sources/polymarket.js'
import { latestTrendsPath } from './lib/trends-snapshot.js'

const SEARCH = 'https://gamma-api.polymarket.com/public-search'
/** The stage is killed at 120 s (`cycle/stages.js`): the call is given 60,
 *  and a search 8, of which a batch of fifteen asks a dozen at most. */
const CALL_TIMEOUT_MS = 60_000
const SEARCH_TIMEOUT_MS = 8_000

/** @param {string} q */
async function search(q) {
  const url = new URL(SEARCH)
  url.searchParams.set('q', q)
  url.searchParams.set('limit_per_type', '5')
  url.searchParams.set('events_status', 'active')
  const data = await fetchJson(url, { timeoutMs: SEARCH_TIMEOUT_MS })
  return Array.isArray(data?.events) ? data.events : []
}

export async function main() {
  const DRY_RUN = hasFlag('dry-run')
  if (!existsSync(pathOf('newArticles'))) {
    console.log('No new articles list found — skipping story contracts.')
    return { skipped: 'no new articles list' }
  }
  const articles = []
  for (const { path, name } of batchFiles()) {
    if (!name.endsWith('.md') || !existsSync(path)) continue
    const { article } = tryReadArticle(path)
    if (article) articles.push({ slug: article.slug, title: String(article.meta.title || ''), body: article.body })
  }
  // Always written, so the desk never reads the last cycle's finds.
  /** @type {Record<string, any[]>} */
  const stories = {}
  const write = () => !DRY_RUN && writeJson(pathOf('storyContracts'), { generated: new Date().toISOString(), stories })
  if (articles.length === 0) {
    write()
    console.log('No new articles — skipping story contracts.')
    return { skipped: 'no new articles' }
  }

  const res = await callClaudeJson(queryPrompt(articles), { model: modelFor('haiku'), effort: 'low', timeout: CALL_TIMEOUT_MS, maxBuffer: 256 * 1024 })
  if (res.error) {
    write()
    console.error(`  ✗ story contracts: ${res.error} — the desk offers the deck alone`)
    return { degraded: res.error }
  }
  const queries = parseQueries(res.out, articles.map((a) => a.slug))
  console.log(`  · story contracts: ${queries.size} of ${articles.length} stories leave a question, named in ${(res.elapsedMs / 1000).toFixed(1)}s${callCost(res)}`)

  const trendsPath = latestTrendsPath()
  const held = (trendsPath ? readJson(trendsPath)?.indicators || [] : []).filter((i) => i?.source === 'polymarket')
  const now = Date.now()
  /** @type {Map<string, any[]>} */
  const answers = new Map()
  let failed = 0
  for (const [slug, q] of queries) {
    if (!answers.has(q)) {
      try {
        answers.set(q, await search(q))
      } catch (err) {
        failed++
        answers.set(q, [])
        console.error(`  ✗ story contracts search "${q}": ${err.message}`)
      }
    }
    const found = contractsFromSearch(answers.get(q), now).map((f) => ({ ...f, id: storyContractId(f.slug, held) }))
    if (found.length) stories[slug] = found
    console.log(`  ${found.length ? '◇' : '·'} "${q}" → ${found.length ? found.map((f) => `${f.question} (${f.price}%)`).join('; ') : 'nothing open'}  ${slug}`)
  }
  write()
  const offered = Object.values(stories).reduce((n, list) => n + list.length, 0)
  console.log(`Story contracts: ${offered} found for ${Object.keys(stories).length} of ${articles.length} stories, ${answers.size} searches${failed ? `, ${failed} failed` : ''}${DRY_RUN ? ' — dry run, nothing written' : ''}`)
  return { counts: { listed: articles.length, asked: queries.size, stories: Object.keys(stories).length, offered, failed } }
}

await runStage(import.meta, 'find-story-contracts', main)
