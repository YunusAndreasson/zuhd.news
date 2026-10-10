#!/usr/bin/env node
// Source-angle extraction stage.
//
// For every source in each new article's frontmatter:
//   1. Fetch the URL and extract the main article text (graceful skip on
//      paywall/bot-block/timeout).
//   2. Batch all successfully-fetched sources into ONE Haiku call asking
//      for the distinctive angle + sentiment per source.
//   3. Write each source's new `angle` and `sentiment` back into the
//      article's frontmatter `sources[]` list.
//
// The 63%-missing-sentiment problem documented previously is addressed
// here: the upstream API sentiment is retained if we don't get a better
// one from Haiku, but now at least the fetched-successfully sources
// also gain a distinctive-angle sentence.

import { readFileSync, existsSync } from 'node:fs'
import { tryReadArticle } from './lib/article.js'
import { batchFiles } from './lib/article-files.js'
import { callClaudeJson, callCost } from './lib/claude-envelope.js'
import { runWithConcurrency } from './lib/concurrency.js'
import { pathOf } from './lib/datasets.js'
import { replaceFrontmatterKey, yamlString } from './lib/frontmatter.js'
import { fetchSourceText } from './lib/fetch-source-text.js'
import { writeText } from './lib/json-file.js'
import { modelFor } from './lib/models.js'

const FETCH_CONCURRENCY = 5
const SOURCE_TEXT_FOR_HAIKU = 1400 // chars per source passed to Haiku

if (!existsSync(pathOf('newArticles'))) {
  console.log('No new articles list found — skipping source-angle extraction.')
  process.exit(0)
}

const newFiles = batchFiles()
if (newFiles.length === 0) {
  console.log('No new articles — skipping source-angle extraction.')
  process.exit(0)
}

/** Collect all sources across all cycle articles into one flat list keyed
 *  by `{fileIdx, sourceIdx}`. Skip sources without URLs. */
function collectSourceTasks(files) {
  const tasks = []
  for (let fi = 0; fi < files.length; fi++) {
    const file = files[fi]
    for (let si = 0; si < file.sources.length; si++) {
      const src = file.sources[si]
      if (!src || typeof src.url !== 'string' || !src.url.startsWith('http')) continue
      tasks.push({ fileIdx: fi, sourceIdx: si, name: src.name, url: src.url })
    }
  }
  return tasks
}

/** Single Haiku call — batched across every successfully-fetched source in
 *  the cycle. Returns a Map keyed by numeric item key → {angle, sentiment}.
 *  On any error returns an empty map; callers fall back gracefully.
 *
 *  Through `callClaudeJson`, like every other JSON call. This stage unwrapped
 *  the envelope itself, and its copy had parted from the shared one twice. An
 *  answer with no text in it (`result: null`) was parsed as the envelope, in
 *  which no item key is found: no angles, and no line saying why. And its
 *  repair for an unescaped quote rewrote every *sound* entry of the batch
 *  (`"angle": "…“, ”sentiment": …`), so it could only mend an answer in which
 *  every angle was broken the same way. */
async function extractAnglesViaHaiku(items) {
  if (items.length === 0) return new Map()

  const blocks = items
    .map(
      (it) => `# Item ${it.key}
  outlet: ${it.name}
  article topic: ${it.articleTitle}
  source text (first ${SOURCE_TEXT_FOR_HAIKU} chars):
  """
  ${it.text.slice(0, SOURCE_TEXT_FOR_HAIKU).replace(/"""/g, "'''")}
  """`,
    )
    .join('\n\n')

  const prompt = `You read source articles to produce ONE sentence per source that captures the DISTINCTIVE angle this outlet brought to the story — a specific fact they emphasize, a frame they choose, or an implication they draw out that the other outlets don't.

CRITICAL: Your sentence must add information. Reject anything generic:
  BAD: "covers from a Turkish perspective"
  BAD: "offers a balanced view"
  BAD: "reports on the situation"
  BAD: "takes a critical stance"
  GOOD: "emphasizes IRGC's legal basis under UNCLOS, cites the 1975 Algiers Agreement"
  GOOD: "foregrounds Indian maritime insurance impact (Lloyd's premiums up 340%)"
  GOOD: "reconstructs the 45-minute call between Trump and Khamenei from two aides"
  GOOD: "maps the leverage in economic terms, not military — oil revenue loss, tanker insurance, refinery margins"

Rules:
  - If a source has NO distinctive angle (e.g., it's a near-verbatim wire story), return angle: null.
  - Angle string must be ≤140 chars, use specific verbs (emphasizes, cites, reconstructs, maps, foregrounds), avoid adjectival generalizations.
  - Sentiment: a number in [-1.0, 1.0]. -1 = sharply negative/critical of subject; 0 = neutral factual; +1 = sharply favorable/sympathetic. Most wire reporting sits in [-0.2, 0.2]. Round to 2 decimals.

Return ONLY a JSON object keyed by item key (as string), mapping to {angle: string|null, sentiment: number}.

Example output for 2 items:
{
  "1": {"angle": "emphasizes IRGC's legal basis under UNCLOS, cites 1975 Algiers Agreement", "sentiment": -0.15},
  "2": {"angle": null, "sentiment": 0.02}
}

${blocks}

Return ONLY the JSON object. No commentary, no markdown fences.`

  const res = await callClaudeJson(prompt, { model: modelFor('haiku'), timeout: 120_000, maxBuffer: 1024 * 1024 })
  if (res.error) {
    console.error(`  ✗ angles-haiku: ${res.error}`)
    return new Map()
  }
  console.log(`  · angles-haiku: answered in ${(res.elapsedMs / 1000).toFixed(1)}s${callCost(res)}`)
  const obj = res.out
  const out = new Map()
  for (const it of items) {
    const entry = obj[it.key]
    if (!entry || typeof entry !== 'object') continue
    const angle =
      typeof entry.angle === 'string' && entry.angle.length > 0 ? entry.angle : null
    const sent =
      typeof entry.sentiment === 'number' && Number.isFinite(entry.sentiment)
        ? Math.max(-1, Math.min(1, Number(entry.sentiment.toFixed(2))))
        : null
    out.set(it.key, { angle, sentiment: sent })
  }
  return out
}

/** Rewrite the `sources:` YAML block in the frontmatter string. We fully
 *  reserialize sources rather than doing surgical substitutions — simpler
 *  and robust to whatever ordering the upstream put them in.
 *  Preserves every source field we know about plus any new angle/sentiment. */
function writeSourcesToFrontmatter(raw, sources) {
  // Serialize fresh sources block.
  const sourceLines = []
  sourceLines.push('sources:')
  // Every scalar field the block already had is written back, not a fixed
  // list: the list was name/url/country/sentiment/angle, so this stage deleted
  // `image:` from every article it touched — 355 of 413 in the week to
  // 2026-09-25 lost the publisher image URL scaffold-articles had just added.
  for (const s of sources) {
    sourceLines.push(`  - name: ${yamlString(s.name || '')}`)
    for (const [key, value] of Object.entries(s)) {
      if (key === 'name' || !/^[A-Za-z][\w-]*$/.test(key)) continue
      if (typeof value === 'string' && value.length > 0) sourceLines.push(`    ${key}: ${yamlString(value)}`)
      else if (typeof value === 'number' && Number.isFinite(value)) sourceLines.push(`    ${key}: ${value}`)
    }
  }
  // Sources sit ahead of concepts/eventCoverage when the file has them, which
  // is where the writer puts them.
  return replaceFrontmatterKey(raw, 'sources', sourceLines, {
    before: /^(concepts|eventCoverage|sentimentDivergence|entities):/,
  })
}

// --- Main flow ---
const t0 = Date.now()
const files = []

for (const { path: fullPath, name: filename } of newFiles) {
  if (!filename.endsWith('.md')) continue
  if (!existsSync(fullPath)) continue
  // One that does not parse is the validator's to move aside, after this
  // stage. It is not a reason for the rest of the batch to go without angles.
  const { article, error } = tryReadArticle(fullPath)
  if (!article) {
    console.error(`  ✗ ${filename}: not read (${error.message.split('\n')[0]}) — no angles for it`)
    continue
  }
  const { raw, meta } = article
  const title = typeof meta.title === 'string' ? meta.title : ''
  const sources = Array.isArray(meta.sources) ? meta.sources : []
  files.push({ fullPath, raw, title, sources })
}

if (files.length === 0) {
  console.log('No articles with frontmatter to process.')
  process.exit(0)
}

// Pass 1: fetch source text in parallel (capped concurrency).
const tasks = collectSourceTasks(files)
if (tasks.length === 0) {
  console.log('No source URLs to fetch.')
  process.exit(0)
}

// The writer's own source text first. Every source it cited arrived with a
// `body` in /tmp/zuhd-selection.json; re-fetching the page instead failed on
// 27-44% of URLs every cycle (paywalls, bot walls — dawn.com, ft.com,
// nytimes.com) and cost ~70s. A page fetch is now the fallback for a source
// the selection does not hold, e.g. one the editor added.
const heldBodies = new Map()
try {
  for (const entry of JSON.parse(readFileSync(pathOf('selection'), 'utf8'))) {
    for (const src of entry.sources || []) {
      if (src?.url && typeof src.body === 'string' && src.body.length >= 500) heldBodies.set(src.url, src.body.slice(0, 3500))
    }
  }
} catch { /* no selection on disk (manual run) — every source is fetched */ }
const toFetch = tasks.filter((t) => !heldBodies.has(t.url))
console.log(`  · source-angles: ${tasks.length - toFetch.length}/${tasks.length} from held source text, fetching ${toFetch.length} (concurrency ${FETCH_CONCURRENCY})`)
// One bad fetch costs its own source and nothing else: it is caught here,
// because a pool passes a rejection on.
const fetchedByTask = new Map()
await runWithConcurrency(toFetch, FETCH_CONCURRENCY, async (t) => {
  fetchedByTask.set(t, await fetchSourceText(t.url).catch(() => undefined))
})
const texts = tasks.map((t) => heldBodies.get(t.url) ?? fetchedByTask.get(t) ?? null)

// Pass 2: build Haiku batch from successful fetches only.
/** @type {Array<{key: number, name: string, articleTitle: string, text: string, fileIdx: number, sourceIdx: number}>} */
const haikuItems = []
let nextKey = 1
for (let i = 0; i < tasks.length; i++) {
  const text = texts[i]
  if (!text) continue
  const t = tasks[i]
  haikuItems.push({
    key: nextKey++,
    name: t.name,
    articleTitle: files[t.fileIdx].title,
    text,
    fileIdx: t.fileIdx,
    sourceIdx: t.sourceIdx,
  })
}

const fetchSuccessPct = tasks.length > 0 ? Math.round((haikuItems.length / tasks.length) * 100) : 0
console.log(`  · source-angles: ${haikuItems.length}/${tasks.length} with text (${fetchSuccessPct}%)`)

// Per-domain failure tally — ~25% of URLs fail consistently, and without this
// line there is no way to attribute which outlets block/paywall us.
const failedByDomain = {}
for (let i = 0; i < tasks.length; i++) {
  if (texts[i]) continue
  let domain = 'unknown'
  try { domain = new URL(tasks[i].url).hostname.replace(/^www\./, '') } catch {}
  failedByDomain[domain] = (failedByDomain[domain] || 0) + 1
}
const failedList = Object.entries(failedByDomain).sort((a, b) => b[1] - a[1])
if (failedList.length > 0) {
  console.log(`  · source-angles: failed domains: ${failedList.map(([d, n]) => `${d}×${n}`).join(' ')}`)
}

const angles = haikuItems.length > 0 ? await extractAnglesViaHaiku(haikuItems) : new Map()

// Pass 3: merge Haiku output back into each file's sources + write frontmatter.
let processed = 0
let totalAngles = 0
let totalSentiments = 0
for (const file of files) {
  let dirty = false
  const updatedSources = file.sources.map((s, idx) => {
    const item = haikuItems.find((h) => h.fileIdx === files.indexOf(file) && h.sourceIdx === idx)
    if (!item) return s
    const resolved = angles.get(item.key)
    if (!resolved) return s
    const next = { ...s }
    if (resolved.angle) {
      next.angle = resolved.angle
      totalAngles++
      dirty = true
    }
    if (resolved.sentiment != null) {
      next.sentiment = resolved.sentiment
      totalSentiments++
      dirty = true
    }
    return next
  })
  if (!dirty) {
    processed++
    continue
  }
  const updated = writeSourcesToFrontmatter(file.raw, updatedSources)
  if (updated !== file.raw) writeText(file.fullPath, updated)
  processed++
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
console.log(
  `Source angles: ${totalAngles} angle(s) + ${totalSentiments} sentiment(s) across ${processed} articles in ${elapsed}s`,
)
