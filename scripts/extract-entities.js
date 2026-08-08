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

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { parseClaudeEnvelope, runHaiku } from './lib/claude-envelope.js'
import { parseFrontmatter } from './lib/frontmatter.js'
import { extractEntities } from './lib/entity-registry.js'
import { fetchYahooStock } from './lib/trends-sources/stocks.js'

const ROOT = new URL('..', import.meta.url).pathname
const NEW_ARTICLES_PATH = '/tmp/zuhd-new-articles.txt'
const TRENDS_SNAPSHOT_PATH = join(
  ROOT,
  'content',
  'trends',
  `${new Date().toISOString().slice(0, 10)}.json`,
)

if (!existsSync(NEW_ARTICLES_PATH)) {
  console.log('No new articles list found — skipping entity extraction.')
  process.exit(0)
}

const newFiles = readFileSync(NEW_ARTICLES_PATH, 'utf8').trim().split('\n').filter(Boolean)
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
function disambiguateViaHaiku(items) {
  if (items.length === 0) return new Map()
  const invocationId = randomUUID().slice(0, 8)

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

  const res = runHaiku(prompt, { timeout: 20_000, maxBuffer: 256 * 1024 })

  if (res.status !== 0) {
    console.error(`  ✗ entity-haiku ${invocationId}: exit ${res.status}`)
    return new Map()
  }
  try {
    const obj = parseClaudeEnvelope(res.stdout)
    const out = new Map()
    for (const it of items) {
      const chosen = obj[String(it.key)] ?? obj[it.key]
      const valid = it.candidates.some((c) => c.id === chosen)
      if (valid) out.set(it.key, chosen)
    }
    return out
  } catch (err) {
    console.error(`  ✗ entity-haiku ${invocationId}: parse — ${err.message}`)
    return new Map()
  }
}

/**
 * Extract publicly-traded company mentions from a set of articles via a
 * single batched Haiku call. Returns a Map keyed by slug → array of
 * `{mention, ticker, name}`. The mention string is what the article used
 * (case preserved); the ticker is a Yahoo Finance symbol we can feed
 * straight into fetchYahooStock.
 *
 * Haiku handles the fuzzy work: disambiguating "Meta" the company from
 * "meta-analysis"; picking BABA vs 9988.HK based on context; skipping
 * private firms (OpenAI, Aramco's subsidiaries).
 *
 * Fail-safe: any error returns an empty map. No ticker gets extracted
 * this cycle, which is fine — next cycle retries.
 */
function extractStocksViaHaiku(articles) {
  if (articles.length === 0) return new Map()
  const invocationId = randomUUID().slice(0, 8)

  const blocks = articles
    .map(
      (a) =>
        `---
slug: ${a.slug}
title: ${a.title || ''}
body:
"""
${a.body.slice(0, 1500).replace(/"""/g, "'''")}
"""`,
    )
    .join('\n')

  const prompt = `You extract publicly-traded company mentions from news articles so we can attach a live stock chart to each mention. For EACH article below, list only companies that:
  - Are mentioned substantively in the body (not just in a source byline or a one-word drive-by)
  - Are publicly traded with a known stable ticker
  - You can confidently resolve to a Yahoo Finance symbol

For each company, give:
  - mention: the exact string used in the body (preserve case, e.g. "Meta", "Nvidia", "TSMC")
  - ticker: Yahoo Finance symbol ("META", "NVDA", "TSM" for TSMC's ADR or "2330.TW" for Taiwan listing; use the main ADR when one exists)
  - name: human-readable company name ("Meta Platforms", "Nvidia", "Taiwan Semiconductor")

Skip (do NOT list):
  - Private firms: OpenAI, Anthropic, SpaceX, Stripe, Boeing Defence, Aramco-the-government-entity (Saudi Aramco Public IS listed as 2222.SR — include only if named as the listed entity)
  - Ambiguous-ticker mentions: if you're not confident which ticker is right, omit
  - Countries, governments, people, agencies, indices (we cover those elsewhere)
  - Generic mentions ("a tech company", "big tech", "hyperscalers" without naming specific firms)

Return ONLY a JSON object keyed by slug, mapping to an array of company objects. Articles with no qualifying companies get an empty array.

Example output:
{
  "2026-04-18-meta-8000-layoffs-ai-capex-gpu-reallocation-zuckerberg": [
    {"mention": "Meta", "ticker": "META", "name": "Meta Platforms"},
    {"mention": "Nvidia", "ticker": "NVDA", "name": "Nvidia"}
  ],
  "2026-04-18-some-pure-mechanism-science-article": []
}

Articles:
${blocks}

Return ONLY the JSON object. No commentary, no markdown fences.`

  // 60s, not 30s: the batched 10-13 article scan routinely needed 30-35s and
  // hit a 30s wall, SIGTERM-killing (exit 143) ~28% of cycles and losing all
  // stock-entity extraction for them. The input tokens are already billed by
  // then — the kill just discarded paid-for output. Stage budget is 180s, so
  // 60s leaves ample headroom for the entity-haiku call that follows.
  const res = runHaiku(prompt, { timeout: 60_000, maxBuffer: 512 * 1024 })

  if (res.status !== 0) {
    console.error(`  ✗ stocks-haiku ${invocationId}: exit ${res.status}`)
    return new Map()
  }
  try {
    const obj = parseClaudeEnvelope(res.stdout)
    const out = new Map()
    for (const slug of Object.keys(obj)) {
      const arr = Array.isArray(obj[slug]) ? obj[slug] : []
      const clean = arr.filter(
        (c) =>
          c &&
          typeof c.mention === 'string' &&
          typeof c.ticker === 'string' &&
          /^[A-Z0-9.-]{1,15}$/i.test(c.ticker) &&
          typeof c.name === 'string',
      )
      if (clean.length > 0) out.set(slug, clean)
    }
    return out
  } catch (err) {
    console.error(`  ✗ stocks-haiku ${invocationId}: parse — ${err.message}`)
    return new Map()
  }
}

/**
 * Append new indicators to today's trends snapshot + digest. Read-modify-
 * write both files if they exist; no-op if the snapshot is missing (some
 * cycles skip the trends stage). Safe to call with an empty indicators
 * list. Duplicate ids are overwritten with the latest data (fresh prices
 * for a ticker that already appeared from a prior cycle's corpus).
 */
function appendIndicatorsToSnapshot(newIndicators) {
  if (newIndicators.length === 0) return
  if (!existsSync(TRENDS_SNAPSHOT_PATH)) {
    console.log(
      `  · stocks: trends snapshot ${TRENDS_SNAPSHOT_PATH} not found — skipping append`,
    )
    return
  }
  try {
    const snapshot = JSON.parse(readFileSync(TRENDS_SNAPSHOT_PATH, 'utf8'))
    const existing = Array.isArray(snapshot.indicators) ? snapshot.indicators : []
    const byId = new Map(existing.map((i) => [i.id, i]))
    for (const ind of newIndicators) byId.set(ind.id, ind)
    snapshot.indicators = [...byId.values()]
    writeFileSync(TRENDS_SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`)
    console.log(
      `  · stocks: appended ${newIndicators.length} indicator(s) → ${basename(TRENDS_SNAPSHOT_PATH)} (${snapshot.indicators.length} total)`,
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
        `  - mention: "${e.mention.replace(/"/g, '\\"')}"\n    indicatorId: "${e.indicatorId}"\n    kind: "${e.kind}"`
      ).join('\n')}`
    : 'entities: []'

  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n/)
  if (!fmMatch) return raw
  const fm = fmMatch[1]
  const rest = raw.slice(fmMatch[0].length)

  // Strip any existing entities block: drop "entities:" line + all following
  // lines that start with whitespace (its children) until a non-indented
  // line (next top-level key) or EOF.
  const lines = fm.split('\n')
  const stripped = []
  let skipping = false
  for (const line of lines) {
    if (skipping) {
      if (line.length === 0 || /^\s/.test(line)) continue // still inside block
      skipping = false
    }
    if (/^entities:/.test(line)) {
      skipping = true
      continue
    }
    stripped.push(line)
  }

  const updatedFm = `${stripped.join('\n').trimEnd()}\n${yamlBlock}`
  return `---\n${updatedFm}\n---\n${rest}`
}

// --- Main loop — pass 1: static extraction + collect ambiguous matches ---
const t0 = Date.now()

// Per-file state we'll revisit in pass 2 to inject Haiku-resolved ambiguous
// entities before writing frontmatter.
/** @type {Array<{fullPath: string, raw: string, slug: string, title: string, body: string, resolved: ReturnType<typeof extractEntities>['resolved']}>} */
const files = []
/** @type {Array<{key: number, fileIdx: number, mention: string, kind: string, candidates: Array<{id: string, label: string}>, context: string}>} */
const ambiguousQueue = []
let nextKey = 1

for (const rel of newFiles) {
  const filename = basename(rel)
  if (!filename.endsWith('.md')) continue
  const fullPath = join(ROOT, rel)
  if (!existsSync(fullPath)) continue

  const raw = readFileSync(fullPath, 'utf8')
  const { meta, body } = parseFrontmatter(raw)
  const slug = basename(filename, '.md')
  const title = typeof meta.title === 'string' ? meta.title : ''
  // Title and concepts alongside the body. A 350-character article often names
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

// --- Pass 2: batched Haiku disambiguation across all articles this cycle ---
let disambiguations = new Map()
if (ambiguousQueue.length > 0) {
  console.log(`  · entity-haiku: resolving ${ambiguousQueue.length} ambiguous mention(s)`)
  disambiguations = disambiguateViaHaiku(ambiguousQueue)
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
// two places: (a) new indicators appended to today's trends snapshot so
// EntitySheet can chart them, (b) stock entity entries added to per-article
// frontmatter so the mention is tappable.
let stocksHits = new Map()
const newStockIndicators = []
if (files.length > 0) {
  console.log(`  · stocks-haiku: scanning ${files.length} article(s) for tickers`)
  stocksHits = extractStocksViaHaiku(
    files.map((f) => ({ slug: f.slug, title: f.title, body: f.body })),
  )

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
    for (const [ticker, meta] of uniqueTickers) {
      const data = await fetchYahooStock(ticker)
      if (!data) continue
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

  // Back-fill stock entities into per-file resolved[] using the actual
  // indicators we successfully fetched — a ticker Yahoo rejected gets
  // dropped, so the tap wouldn't find its chart.
  const resolvedIds = new Set(newStockIndicators.map((i) => i.id))
  for (const [slug, companies] of stocksHits) {
    const file = files.find((f) => f.slug === slug)
    if (!file) continue
    for (const c of companies) {
      const id = `stocks:${c.ticker.toUpperCase()}`
      if (!resolvedIds.has(id)) continue
      if (file.resolved.some((e) => e.indicatorId === id)) continue
      file.resolved.push({ mention: c.mention, indicatorId: id, kind: 'stock' })
    }
  }
}

// --- Pass 3: write frontmatter + log summary ---
let processed = 0
let totalEntities = 0
const kindCounts = {}

for (const file of files) {
  const { fullPath, raw, resolved } = file
  const updated = writeEntitiesToFrontmatter(raw, resolved)
  if (updated !== raw) {
    writeFileSync(fullPath, updated)
  }
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
