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

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { runHaiku } from './lib/claude-envelope.js'
import { parseFrontmatter } from './lib/frontmatter.js'
import { fetchSourceText } from './lib/fetch-source-text.js'

const ROOT = new URL('..', import.meta.url).pathname
const NEW_ARTICLES_PATH = '/tmp/zuhd-new-articles.txt'
const FETCH_CONCURRENCY = 5
const SOURCE_TEXT_FOR_HAIKU = 1400 // chars per source passed to Haiku

if (!existsSync(NEW_ARTICLES_PATH)) {
  console.log('No new articles list found — skipping source-angle extraction.')
  process.exit(0)
}

const newFiles = readFileSync(NEW_ARTICLES_PATH, 'utf8').trim().split('\n').filter(Boolean)
if (newFiles.length === 0) {
  console.log('No new articles — skipping source-angle extraction.')
  process.exit(0)
}

/** Run fn over items with at most `limit` in flight. Returns results aligned
 *  to input order. Rejections resolve to undefined so one bad fetch doesn't
 *  cascade. */
async function pool(items, limit, fn) {
  const results = new Array(items.length)
  let i = 0
  async function worker() {
    while (true) {
      const idx = i++
      if (idx >= items.length) return
      try {
        results[idx] = await fn(items[idx])
      } catch {
        results[idx] = undefined
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
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
 *  On any error returns an empty map; callers fall back gracefully. */
function extractAnglesViaHaiku(items) {
  if (items.length === 0) return new Map()
  const invocationId = randomUUID().slice(0, 8)

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

  const res = runHaiku(prompt, { timeout: 120_000, maxBuffer: 1024 * 1024 })

  if (res.status !== 0) {
    console.error(`  ✗ angles-haiku ${invocationId}: exit ${res.status}`)
    return new Map()
  }
  const envelope = (() => {
    try {
      return JSON.parse(res.stdout)
    } catch {
      return null
    }
  })()
  const raw = envelope?.result ?? envelope?.text ?? res.stdout
  const cleaned = String(raw).replace(/^```(?:json)?\s*|\s*```$/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) {
    console.error(`  ✗ angles-haiku ${invocationId}: no JSON object in output`)
    return new Map()
  }
  const jsonSlice = cleaned.slice(start, end + 1)
  let obj
  try {
    obj = JSON.parse(jsonSlice)
  } catch (err) {
    // Fallback: Haiku occasionally emits a straight ASCII quote inside an
    // angle string without escaping it. Try once more after smart-quoting
    // any unescaped inner quotes — crude but catches the common case of a
    // quoted phrase like "red line".
    try {
      const fixed = jsonSlice.replace(
        /"angle":\s*"([^"]*?)"([^"]*?)"([^"]*?)"/g,
        '"angle": "$1\u201c$2\u201d$3"',
      )
      obj = JSON.parse(fixed)
    } catch {
      console.error(
        `  ✗ angles-haiku ${invocationId}: parse — ${err.message} (first 200 chars of JSON slice: ${jsonSlice.slice(0, 200)})`,
      )
      return new Map()
    }
  }
  const out = new Map()
  for (const it of items) {
    const entry = obj[String(it.key)] ?? obj[it.key]
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
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n/)
  if (!fmMatch) return raw
  const fm = fmMatch[1]
  const rest = raw.slice(fmMatch[0].length)

  // Strip existing sources block.
  const lines = fm.split('\n')
  const stripped = []
  let skipping = false
  for (const line of lines) {
    if (skipping) {
      if (line.length === 0 || /^\s/.test(line)) continue
      skipping = false
    }
    if (/^sources:/.test(line)) {
      skipping = true
      continue
    }
    stripped.push(line)
  }

  // Serialize fresh sources block.
  const sourceLines = []
  sourceLines.push('sources:')
  for (const s of sources) {
    sourceLines.push(`  - name: ${JSON.stringify(s.name || '')}`)
    if (s.url) sourceLines.push(`    url: ${JSON.stringify(s.url)}`)
    if (typeof s.country === 'string') sourceLines.push(`    country: ${JSON.stringify(s.country)}`)
    if (typeof s.sentiment === 'number' && Number.isFinite(s.sentiment)) {
      sourceLines.push(`    sentiment: ${s.sentiment}`)
    }
    if (typeof s.angle === 'string' && s.angle.length > 0) {
      sourceLines.push(`    angle: ${JSON.stringify(s.angle)}`)
    }
  }
  // Try to preserve roughly the original position: sources is typically near
  // the top, before concepts/eventCoverage. Insert after the first blank
  // line or at a reasonable top position.
  const insertAt = stripped.findIndex((l) => /^(concepts|eventCoverage|sentimentDivergence|entities):/.test(l))
  if (insertAt >= 0) {
    stripped.splice(insertAt, 0, ...sourceLines)
  } else {
    stripped.push(...sourceLines)
  }

  return `---\n${stripped.join('\n').trimEnd()}\n---\n${rest}`
}

// --- Main flow ---
const t0 = Date.now()
const files = []

for (const rel of newFiles) {
  const filename = basename(rel)
  if (!filename.endsWith('.md')) continue
  const fullPath = join(ROOT, rel)
  if (!existsSync(fullPath)) continue
  const raw = readFileSync(fullPath, 'utf8')
  const { meta } = parseFrontmatter(raw)
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

console.log(`  · source-angles: fetching ${tasks.length} URL(s) (concurrency ${FETCH_CONCURRENCY})`)
const texts = await pool(tasks, FETCH_CONCURRENCY, (t) => fetchSourceText(t.url))

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
console.log(`  · source-angles: ${haikuItems.length}/${tasks.length} fetched (${fetchSuccessPct}%)`)

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

const angles = haikuItems.length > 0 ? extractAnglesViaHaiku(haikuItems) : new Map()

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
  if (updated !== file.raw) writeFileSync(file.fullPath, updated)
  processed++
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
console.log(
  `Source angles: ${totalAngles} angle(s) + ${totalSentiments} sentiment(s) across ${processed} articles in ${elapsed}s`,
)
