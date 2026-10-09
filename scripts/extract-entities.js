#!/usr/bin/env node
// Entity extraction stage.
//
// Scans each new article's body for known rich-noun mentions (commodities,
// currencies, chokepoints, crypto, indices) and writes their positions into
// the article's frontmatter. Mobile renders these as tappable runs that
// open an EntitySheet with the matching indicator chart + back-references.
//
// v1: deterministic static-rule matching only. Zero LLM calls. Fast, cheap,
// predictable. Ambiguous mentions (rupee, peso, pound) are skipped; a Haiku
// disambiguation pass lands in a later revision.

import { readFileSync, existsSync } from 'node:fs'
import { basename } from 'node:path'
import { tryReadArticle } from './lib/article.js'
import { batchFiles } from './lib/article-files.js'
import { callClaudeJson } from './lib/claude-envelope.js'
import { pathOf } from './lib/datasets.js'
import { replaceFrontmatterKey, yamlString } from './lib/frontmatter.js'
import { extractEntities } from './lib/entity-registry.js'
import { fetchYahooStock } from './lib/trends-sources/stocks.js'
import { chartsUntil, companyEntries, parseStockMentions, stockMentionsPrompt, subjectsBlock } from './lib/stock-mentions.js'
import { writeJson, writeText } from './lib/json-file.js'
import { modelFor } from './lib/models.js'
import { latestTrendsPath } from './lib/trends-snapshot.js'

// The cycle kills this stage at 180 s (`cycle/stages.js`). No request to Yahoo
// is begun after 150: one can take 20 s, and what is left is for the writes.
const STAGE_STARTED = Date.now()
const YAHOO_UNTIL = STAGE_STARTED + 150_000

if (!existsSync(pathOf('newArticles'))) {
  console.log('No new articles list found — skipping entity extraction.')
  process.exit(0)
}

const newFiles = batchFiles()
if (newFiles.length === 0) {
  console.log('No new articles — skipping entity extraction.')
  process.exit(0)
}

/* `extractEntities` moved to `lib/entity-registry.js` on 2026-08-08, where the
   rules it walks already lived, so `attach-indicators.js` can ask the same
   question of a selection entry one stage earlier. It also gained a `concepts`
   argument there — see its header. */

/**
 * Disambiguate a batch of ambiguous mentions across multiple articles in one
 * Haiku call. Each item carries its article context so Haiku can pick the
 * right indicator id from the candidate list. Returns a map keyed by the
 * caller-supplied `key` → resolved indicator id (or null on failure).
 *
 * Fail-safe: on any error (transport, parse, malformed response) returns an
 * empty map. Callers are expected to fall back to the first candidate
 * (usually the registry default) when a key is missing from the result.
 */
async function disambiguateViaHaiku(items) {
  if (items.length === 0) return new Map()

  const blocks = items
    .map((it, i) => {
      const candidates = it.candidates
        .map((c) => `    - ${c.id}: ${c.label}`)
        .join('\n')
      return `# Item ${i + 1} (key: ${it.key})
  mention: "${it.mention}"
  candidates:
${candidates}
  article context:
  """
  ${it.context.slice(0, 900).replace(/"""/g, "'''")}
  """`
    })
    .join('\n\n')

  const prompt = `You are disambiguating currency/entity mentions from news article bodies. For each item below, choose exactly one candidate id based on the article's context (country, institution, topic).

Rules:
- Return ONLY a JSON object keyed by the integer item key (NOT the string "key N"), mapping to the chosen candidate id.
- If the article genuinely doesn't indicate which candidate fits, pick the first candidate as the safe default.
- Never return a candidate id that wasn't listed for that item.

Example output (for 2 items):
{"1": "fx-pkr", "2": "fx-lbp"}

${blocks}

Return ONLY the JSON object. No commentary, no markdown fences.`

  const res = await callClaudeJson(prompt, { model: modelFor('haiku'), timeout: 20_000, maxBuffer: 256 * 1024 })
  if (res.error) {
    console.error(`  ✗ entity-haiku: ${res.error}`)
    return new Map()
  }
  const obj = res.out
  const out = new Map()
  for (const it of items) {
    const chosen = obj[it.key]
    const valid = it.candidates.some((c) => c.id === chosen)
    if (valid) out.set(it.key, chosen)
  }
  return out
}

/**
 * Extract publicly-traded company mentions from a set of articles via a
 * single batched Haiku call. Returns a Map keyed by slug → array of
 * `{mention, ticker, name, subject}` — an entry for every article the model
 * answered for, empty where it named no company. The mention string is what
 * the article used (case preserved); the ticker is a Yahoo Finance symbol we
 * can feed straight into fetchYahooStock; `subject` is whether the article is
 * about the company rather than naming it (`lib/stock-mentions.js`).
 *
 * Haiku handles the fuzzy work: disambiguating "Meta" the company from
 * "meta-analysis"; picking BABA vs 9988.HK based on context; skipping
 * private firms (OpenAI, Aramco's subsidiaries).
 *
 * Fail-safe: any error returns null. No ticker gets extracted this cycle,
 * which is fine — next cycle retries. Null rather than an empty map so the
 * caller can tell "the scan did not run" from "the scan found nothing": only
 * the second is recorded on the article.
 */
async function extractStocksViaHaiku(articles) {
  if (articles.length === 0) return new Map()
  const prompt = stockMentionsPrompt(articles)

  // 60s, not 30s: the batched 10-13 article scan routinely needed 30-35s and
  // hit a 30s wall, SIGTERM-killing (exit 143) ~28% of cycles and losing all
  // stock-entity extraction for them. The input tokens are already billed by
  // then — the kill just discarded paid-for output. Raised to 90s on
  // 2026-09-25: 60s still killed 4 of ~40 cycles. The stage budget is 180s and
  // the entity-haiku call that follows is capped at 20s, so this still fits.
  const res = await callClaudeJson(prompt, { model: modelFor('haiku'), timeout: 90_000, maxBuffer: 512 * 1024 })
  if (res.error) {
    console.error(`  ✗ stocks-haiku: ${res.error}`)
    return null
  }
  return parseStockMentions(res.out)
}

/**
 * Append new indicators to the newest trends snapshot: the file the build
 * makes `/api/trends.json` from, and so the one a stock chip is resolved
 * against (`latestTrendsPath`). It was today's by date, which is the same
 * file on a day the trends fetch ran and no file at all on a day it failed,
 * when the build goes on reading yesterday's and the chips written here
 * pointed at nothing.
 *
 * Read-modify-write; no-op if there is no snapshot at all. Safe to call with
 * an empty indicators list. An id already there is overwritten with the
 * latest data.
 */
function appendIndicatorsToSnapshot(newIndicators) {
  if (newIndicators.length === 0) return
  const path = latestTrendsPath()
  if (!path) {
    console.log('  · stocks: no trends snapshot to append to — skipping')
    return
  }
  try {
    const snapshot = JSON.parse(readFileSync(path, 'utf8'))
    const existing = Array.isArray(snapshot.indicators) ? snapshot.indicators : []
    const byId = new Map(existing.map((i) => [i.id, i]))
    for (const ind of newIndicators) byId.set(ind.id, ind)
    snapshot.indicators = [...byId.values()]
    writeJson(path, snapshot)
    console.log(
      `  · stocks: appended ${newIndicators.length} indicator(s) → ${basename(path)} (${snapshot.indicators.length} total)`,
    )
  } catch (err) {
    console.error(`  ✗ stocks: snapshot write — ${err.message}`)
  }
}

/**
 * Insert/replace the `entities:` block in a YAML frontmatter string.
 * Line-based pass: drop any existing `entities:` + its indented children,
 * then append the fresh block. Robust to whether entities was the last key
 * in the frontmatter (where regex lookaheads misbehave).
 */
function writeEntitiesToFrontmatter(raw, entities) {
  const yamlBlock = entities.length > 0
    ? `entities:\n${entities.map(e =>
        `  - mention: ${yamlString(e.mention)}\n    indicatorId: ${yamlString(e.indicatorId)}\n    kind: ${yamlString(e.kind)}`
      ).join('\n')}`
    : 'entities: []'

  return replaceFrontmatterKey(raw, 'entities', yamlBlock.split('\n'))
}

// --- Main loop — pass 1: static extraction + collect ambiguous matches ---
const t0 = STAGE_STARTED

// Per-file state we'll revisit in pass 2 to inject Haiku-resolved ambiguous
// entities before writing frontmatter.
/** @type {Array<{fullPath: string, raw: string, slug: string, title: string, body: string, resolved: ReturnType<typeof extractEntities>['resolved']}>} */
const files = []
/** @type {Array<{key: number, fileIdx: number, mention: string, kind: string, candidates: Array<{id: string, label: string}>, context: string}>} */
const ambiguousQueue = []
let nextKey = 1

for (const { path: fullPath, name: filename } of newFiles) {
  if (!filename.endsWith('.md')) continue
  if (!existsSync(fullPath)) continue

  // An article whose frontmatter does not parse is the validator's to move
  // aside, and the validator runs after this stage. Read with the throwing
  // parser, one such file ended the stage for the whole batch.
  const { article, error } = tryReadArticle(fullPath)
  if (!article) {
    console.error(`  ✗ ${filename}: not read (${error.message.split('\n')[0]}) — no entities for it`)
    continue
  }
  const { raw, meta, body, slug } = article
  const title = typeof meta.title === 'string' ? meta.title : ''
  // Title and concepts alongside the body. A 450-character article often names
  // its subject only in the headline, and `concepts[]` is the selector's own
  // Wikipedia-backed labelling — both are cleaner signal than the prose.
  const { resolved, pending } = extractEntities(
    `${title}\n${body}`,
    Array.isArray(meta.concepts) ? meta.concepts : [],
  )

  const fileIdx = files.length
  files.push({ fullPath, raw, slug, title, body, resolved })

  for (const p of pending) {
    ambiguousQueue.push({
      key: nextKey++,
      fileIdx,
      mention: p.mention,
      kind: p.kind,
      candidates: p.candidates,
      context: body,
    })
  }
}

/**
 * Put a file's entities, as they stand, on the article, and its subjects
 * once the company scan has read it. Writes only what changed.
 *
 * @param {(typeof files)[number]} file
 * @param {string[]} [subjects]
 */
function writeFile(file, subjects) {
  const withEntities = writeEntitiesToFrontmatter(file.raw, file.resolved)
  const updated = subjects
    ? replaceFrontmatterKey(withEntities, 'subjects', subjectsBlock(subjects))
    : withEntities
  if (updated === file.raw) return
  writeText(file.fullPath, updated)
  file.raw = updated
}

// --- Pass 1.5: what the rules alone found goes on the article now ---
// Everything from here to the last pass is a model call or a request to
// Yahoo, up to 170 s of them under a `timeout 180`, and the only write was
// after all of it. A stage killed on the way wrote nothing at all, not even
// these, which cost nothing to find. An article is in the batch once, so
// they did not come back on a later cycle either. The last pass writes each
// file again with what the model and Yahoo added.
for (const file of files) writeFile(file)

// --- Pass 2: batched Haiku disambiguation across all articles this cycle ---
let disambiguations = new Map()
if (ambiguousQueue.length > 0) {
  console.log(`  · entity-haiku: resolving ${ambiguousQueue.length} ambiguous mention(s)`)
  disambiguations = await disambiguateViaHaiku(ambiguousQueue)
}

for (const item of ambiguousQueue) {
  // Use Haiku's pick when available; fall back to first candidate.
  const chosenId = disambiguations.get(item.key) ?? item.candidates[0].id
  const file = files[item.fileIdx]
  // Dedupe: don't overwrite an already-resolved entry for the same id.
  if (file.resolved.some((e) => e.indicatorId === chosenId)) continue
  file.resolved.push({
    mention: item.mention,
    indicatorId: chosenId,
    kind: item.kind,
  })
}

// --- Pass 2.5: stocks NER + Yahoo fetch ---
// Haiku reads each article to identify publicly-traded companies, then we
// fetch 30-day history for each unique ticker from Yahoo. Results land in
// two places: (a) new indicators appended to the newest trends snapshot so
// EntitySheet can chart them, (b) stock entity entries added to per-article
// frontmatter so the mention is tappable.
let stocksHits = new Map()
/** Slug → the companies the scan judged the article to be about, for every
 *  article it answered for. Empty when the scan did not run. */
const subjectsBySlug = new Map()
const newStockIndicators = []
if (files.length > 0) {
  console.log(`  · stocks-haiku: scanning ${files.length} article(s) for tickers`)
  const scanned = await extractStocksViaHaiku(
    files.map((f) => ({ slug: f.slug, title: f.title, body: f.body })),
  )
  stocksHits = scanned ?? new Map()

  // Collect unique tickers across all articles; skip duplicates.
  const uniqueTickers = new Map() // ticker → { name, mentionExample }
  for (const [, companies] of stocksHits) {
    for (const c of companies) {
      const norm = c.ticker.toUpperCase()
      if (!uniqueTickers.has(norm)) {
        uniqueTickers.set(norm, { name: c.name, mention: c.mention })
      }
    }
  }

  if (uniqueTickers.size > 0) {
    console.log(`  · stocks: fetching ${uniqueTickers.size} ticker(s) from Yahoo`)
    // Fetch sequentially — parallel would likely trip Yahoo's rate limit on
    // a shared IP. Each call is ~200-400ms so 10 tickers = ~3s.
    const { charts, unasked } = await chartsUntil(uniqueTickers.keys(), (ticker) => fetchYahooStock(ticker), { until: YAHOO_UNTIL })
    if (unasked.length > 0) {
      console.log(`  · stocks: out of time, ${unasked.length} ticker(s) not asked for: ${unasked.join(' ')}`)
    }
    for (const [ticker, data] of charts) {
      const meta = uniqueTickers.get(ticker)
      const values = data.values
      const latest = values[values.length - 1]
      const previous = values[values.length - 2]
      const unit = data.currency === 'USD' ? '$' : data.currency
      newStockIndicators.push({
        id: `stocks:${ticker}`,
        label: data.name,
        unit,
        source: 'stocks',
        seriesId: ticker,
        cadence: 'daily',
        topicTags: [meta.name.toLowerCase(), ticker.toLowerCase()],
        defaultHighlight: 'last',
        sourceLabel: `Yahoo Finance · ${data.exchange || ticker}`,
        values,
        periods: data.periods,
        asOf: data.asOf,
        latest,
        previous,
        points: values.length,
      })
    }
    appendIndicatorsToSnapshot(newStockIndicators)
  }

  // Stock entities for the tickers there is a chart for — a ticker Yahoo
  // rejected gets dropped, so the tap wouldn't find its chart — and the
  // subjects the model named, chart or no chart (`companyEntries`).
  //
  // Only the articles the model answered for were read. One it left out — an
  // answer cut short — has no judgement, and is not recorded as "about none".
  const charted = new Set(newStockIndicators.map((i) => i.id))
  for (const [slug, companies] of stocksHits) {
    const file = files.find((f) => f.slug === slug)
    if (!file) continue
    const { entities, subjects } = companyEntries(companies, charted)
    subjectsBySlug.set(slug, subjects)
    for (const e of entities) {
      if (!file.resolved.some((r) => r.indicatorId === e.indicatorId)) file.resolved.push(e)
    }
  }
}

// --- Pass 3: write frontmatter + log summary ---
let processed = 0
let totalEntities = 0
const kindCounts = {}

for (const file of files) {
  const { fullPath, resolved } = file
  // `subjects` only for an article the company scan read: one it did not
  // reach keeps no key, and the build falls back to the headline for it.
  writeFile(file, subjectsBySlug.get(file.slug))
  processed++
  totalEntities += resolved.length
  for (const e of resolved) {
    kindCounts[e.kind] = (kindCounts[e.kind] || 0) + 1
  }
  if (resolved.length > 0) {
    const summary = resolved.map((e) => `${e.mention}→${e.indicatorId}`).join(', ')
    console.log(`  ${basename(fullPath, '.md').slice(0, 60)}: ${resolved.length} (${summary})`)
  }
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
const kindSummary = Object.entries(kindCounts).map(([k, n]) => `${k}=${n}`).join(' ')
console.log(
  `Entities: ${totalEntities} extracted across ${processed} articles in ${elapsed}s [${kindSummary || 'none'}]${ambiguousQueue.length > 0 ? ` · ${disambiguations.size}/${ambiguousQueue.length} ambiguous resolved via Haiku` : ''}`,
)
