#!/usr/bin/env node
// Stage 3.75 — the Swedish desk.
//
// Translates every article in the feed window into Swedish and writes them to
// `content/.sv.json`, which `build.js` joins into `dist/api/sv/feed.json` for
// islam.se to read. Nothing Swedish is rendered on zuhd.news: the endpoint is
// linked from no page, excluded from every sitemap and feed, and carries
// `X-Robots-Tag: noindex` in `public/_headers`.
//
// ── Why it scans the window rather than this cycle's new articles ───────────
//
// `extract-entities.js` and `extract-source-angles.js` read
// `/tmp/zuhd-new-articles.txt`, because their output is written back into an
// article's own frontmatter and an article is only new once. This stage's
// output is a *rolling 48h payload*, and a stage that only ever adds this
// cycle's twelve articles has no way to recover from the cycle that failed —
// the gap stays in the payload until it ages out, and islam.se shows a hole in
// its afternoon. Scanning the window instead makes the stage self-healing and
// makes a first run fill the payload immediately, at the cost of a fingerprint
// comparison per article.
//
// The fingerprint cache (the pattern `narrate-indicators.js` established) is
// what makes that affordable: steady state re-translates only what the editor
// actually changed, so a normal cycle is ~12 articles, not ~110.
//
// ── Flags and environment ──────────────────────────────────────────────────
//
//   --dry-run              list what would be translated, call nothing
//   --window <hours>       override the 48h window
//   ZUHD_SV_MODEL          default Sonnet (`swedish` in lib/models.js) —
//                          register is the whole point, and Haiku writes
//                          translated English
//   ZUHD_SV_EFFORT         default high. This was `low` until a measured
//                          A/B said otherwise: nine runs of the same six
//                          articles, same model, same prompt, scored 1,60
//                          register defects per run at `low` against 0,25 at
//                          `high` — a 6x difference for ~15s and a few cents.
//                          The old note called this "a writing task, not a
//                          reasoning one", and that is the premise that was
//                          wrong: choosing »tillskrev« over »krediterade«, or
//                          knowing that `stablecoin` stays English while
//                          `watchdog` becomes »tillsynsorgan«, is exactly a
//                          reasoning task about register and false friends
//   ZUHD_SV_FORCE=1        ignore the cache and re-translate everything

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { argAt, hasFlag } from './lib/argv.js'
import { splitBlocks } from './lib/blocks.js'
import { callClaudeJson } from './lib/claude-envelope.js'
import { runWithConcurrency } from './lib/concurrency.js'
import { parseFrontmatter } from './lib/frontmatter.js'
import {
  SV_WINDOW_MS,
  articleFingerprint,
  eventTime,
  mergeRetry,
  registerFault,
  translationFault,
} from './lib/sv-payload.js'
import { ROOT } from './lib/paths.js'
import { readJson, writeJson } from './lib/json-file.js'
import { sha1Hex } from './lib/hash.js'
import { modelFor } from './lib/models.js'

const CONTENT_DIR = join(ROOT, 'content', 'articles')
const CACHE_PATH = join(ROOT, 'content', '.sv.json')
const PROMPT_PATH = join(ROOT, 'scripts', 'sv-prompt.md')

const MODEL = modelFor('swedish')
const EFFORT = process.env.ZUHD_SV_EFFORT || 'high'
const FORCE = process.env.ZUHD_SV_FORCE === '1'
const DRY_RUN = hasFlag('dry-run')
const WINDOW_MS = Number(argAt('window')) > 0 ? Number(argAt('window')) * 3600_000 : SV_WINDOW_MS

// Six per call. The bodies are ~50 words each, so the ceiling is not the input
// but the output: one call that has to return 20 four-block translations is a
// long generation with 20 chances to drift out of the JSON envelope, and a
// parse failure loses all 20. Six keeps a failure cheap.
const BATCH_SIZE = 6
const CONCURRENCY = 3
const PRUNE_MS = 7 * 24 * 60 * 60 * 1000

const stageT0 = Date.now()
const basePrompt = readFileSync(PROMPT_PATH, 'utf8')

// How this translation was produced, not what it says. `articleFingerprint`
// answers "did the English change"; this answers "did we change how we
// translate it", and without it a sharpened prompt or a raised effort reaches
// only articles that happen to be new — everything already cached keeps the
// Swedish that motivated the change, until it ages out of the window two days
// later. Editing sv-prompt.md and seeing nothing improve is the failure this
// prevents. The cost of being wrong in the other direction is one cycle that
// re-translates the whole window, which is minutes and cents.
const RECIPE = sha1Hex(`${basePrompt}\n${MODEL}\n${EFFORT}`, 12)

const cache = readJson(CACHE_PATH, { articles: {} })
if (!cache.articles) cache.articles = {}

// ── Collect the window ─────────────────────────────────────────────────────

const now = Date.now()
// Filename date first — a cheap string compare that skips 7,800 of 7,900 files
// before any of them is read, the same guard `build.js` uses.
const cutoffDate = new Date(now - WINDOW_MS - 86_400_000).toISOString().slice(0, 10)

const candidates = []
for (const file of readdirSync(CONTENT_DIR)) {
  if (!file.endsWith('.md') || file === 'example.md') continue
  if (file.slice(0, 10) < cutoffDate) continue
  const raw = readFileSync(join(CONTENT_DIR, file), 'utf8')
  const { meta, body } = parseFrontmatter(raw)
  if (!meta?.title || !body) continue
  const slug = file.replace(/\.md$/, '')
  const blocks = splitBlocks(body)
  if (blocks.length === 0) continue
  if (eventTime(meta, Date.parse(`${file.slice(0, 10)}T12:00:00Z`)) < now - WINDOW_MS) continue
  candidates.push({ slug, title: meta.title, location: meta.location || '', blocks, body })
}

const pending = candidates.filter((a) => {
  const fp = articleFingerprint(a.title, a.body)
  a.fingerprint = fp
  if (FORCE) return true
  const hit = cache.articles[a.slug]
  return hit?.fingerprint !== fp || hit?.recipe !== RECIPE
})

console.log(
  `  · swedish: ${candidates.length} in window, ${candidates.length - pending.length} cached, ${pending.length} to translate`,
)

if (DRY_RUN) {
  for (const a of pending) console.log(`  ${a.slug}  (${a.blocks.length} blocks) ${a.title}`)
  process.exit(0)
}

// ── Translate ──────────────────────────────────────────────────────────────

/** One batched call. Returns a Map slug → {titel, plats, stycken}; an empty
 *  map on any failure, so a bad batch costs its own articles and nothing else. */
async function translateBatch(batch, label) {
  const items = batch.map((a, i) => ({
    key: String(i + 1),
    slug: a.slug,
    payload: {
      key: String(i + 1),
      title: a.title,
      dateline: a.location,
      blocks: a.blocks,
    },
  }))

  const prompt = `${basePrompt}

## INPUT

\`\`\`json
${JSON.stringify(items.map((i) => i.payload), null, 2)}
\`\`\`

Return ONLY the JSON object keyed by item key. No commentary, no fences.`

  const res = await callClaudeJson(prompt, { model: MODEL, effort: EFFORT, timeout: 240_000, maxBuffer: 4 * 1024 * 1024 })
  if (res.error) {
    console.log(`  ✗ swedish ${label}: ${res.error}`)
    return { out: new Map(), costUsd: 0 }
  }

  const obj = res.out
  const out = new Map()
  for (const it of items) {
    const entry = obj[it.key]
    if (entry) out.set(it.slug, entry)
  }
  return { out, costUsd: res.costUsd || 0 }
}

const batches = []
for (let i = 0; i < pending.length; i += BATCH_SIZE) batches.push(pending.slice(i, i + BATCH_SIZE))

let translated = 0
let dropped = 0
let missing = 0
let registerWarned = 0
let totalCostUsd = 0

// Checkpoint after every batch, not once at the end.
//
// The cycle runs this stage under `timeout 600` (`cycle/stages.js`), and a
// single write at the end means a run that overshoots loses every translation
// it paid for — and then overshoots identically on the next cycle, because
// nothing was cached to shorten it. That is a permanent failure loop, and it is
// reachable whenever the recipe changes and the whole window goes pending at
// once (102 articles the day `ZUHD_SV_EFFORT` moved to `high`).
//
// Writing as we go makes the stage resumable instead: a kill costs the batches
// still in flight, and the next cycle starts from what survived. Concurrency is
// safe here because Node runs these callbacks on one thread — the writes
// interleave between batches, never inside one.
const persist = () => {
  cache.generatedAt = new Date().toISOString()
  writeJson(CACHE_PATH, cache)
}

/** Register faults across a whole batch's returned translations. The gate is
 *  per batch because the retry is: one call returns all six, so one bad draw
 *  is re-rolled as a unit. */
const registerFaults = (batch, out) =>
  batch
    .map((a) => {
      const sv = out.get(a.slug)
      return sv ? registerFault(a, sv) : null
    })
    .filter(Boolean)

await runWithConcurrency(batches, CONCURRENCY, async (batch) => {
  const label = `${batch[0].slug.slice(0, 24)}+${batch.length - 1}`
  let { out, costUsd } = await translateBatch(batch, label)
  totalCostUsd += costUsd

  // One retry, on the same condition the selector and writer retries use:
  // *did this call produce anything*, not what it exited with. The observed
  // failure is a transient reach for a tool — `stop_reason: "tool_use"` with
  // `--max-turns 1`, which returns no result and bills the input anyway.
  // Neither `--allowedTools ""` nor `--disallowedTools` prevents the attempt
  // (both were measured) — they gate permission, not what the model sees.
  // `--tools ''` removes the tool definitions from the request entirely, which
  // also cuts ~17k input tokens a call; this retry stays for the residual.
  //
  // The register gate re-rolls on top of that. Measured on the live payload of
  // 2026-08-24: identical prompt, model and effort produced anywhere from zero
  // to seven register defects across six articles, and the structural checks
  // below passed every one of them — the stage reported "0 dropped" while
  // publishing »krediterade« and »stabilt mynt« to islam.se. Variance, not
  // configuration, is what reaches the reader, and a second draw is the
  // cheapest correction available.
  //
  // A register fault never drops the article the way a structural one does. It
  // renders perfectly; it just reads as translated English. Punching a hole in
  // islam.se's feed over a word choice is the worse failure, so a batch that
  // trips the gate twice is published with a warning per slug.
  const faults = out.size === 0 ? [] : registerFaults(batch, out)
  const why = out.size === 0 ? 'nothing returned' : faults.length ? `register: ${faults[0]}` : ''
  if (why) {
    console.log(`  · swedish ${label}: ${why} — retrying once`)
    const again = await translateBatch(batch, `${label} retry`)
    totalCostUsd += again.costUsd
    // Keep the retry only where it is actually better, article by article
    // (`mergeRetry`). A re-roll that comes back with a trap the first draw did
    // not have, or without an article the first draw translated, is worse for
    // that article, and replacing the batch would ship it.
    out = mergeRetry(batch, out, again.out)
  }

  for (const article of batch) {
    const sv = out.get(article.slug)
    if (!sv) {
      missing++
      continue
    }
    // A malformed translation is dropped, never published. islam.se renders
    // this payload with no parsing and no repair, so whatever survives here is
    // what appears on the page.
    const fault = translationFault(article, sv)
    if (fault) {
      dropped++
      console.log(`  ✗ ${article.slug}: ${fault}`)
      continue
    }
    // Survived the re-roll: publish it, but say so. These lines are the only
    // record of which traps are still getting through, and they are what the
    // next edit to sv-prompt.md should be written against.
    const stillOff = registerFault(article, sv)
    if (stillOff) {
      registerWarned++
      console.log(`  ⚠ ${article.slug}: ${stillOff}`)
    }
    cache.articles[article.slug] = {
      titel: sv.titel.trim(),
      plats: sv.plats.trim(),
      stycken: sv.stycken.map((s) => s.trim()),
      fingerprint: article.fingerprint,
      recipe: RECIPE,
      translatedAt: new Date().toISOString(),
    }
    translated++
  }
  persist()
})

// ── Prune ──────────────────────────────────────────────────────────────────
//
// Keyed on the slug's own date rather than on what is in the window right now,
// so a short `--window` run cannot delete translations the next full run would
// have kept.
//
// The horizon is `max(PRUNE_MS, WINDOW_MS)`, and the max is not decoration: a
// `--window 300` backfill translated 27 articles and then immediately pruned
// all 27, because every one of them was older than the 7-day horizon. Whatever
// this run was asked to translate, it must not delete.
{
  const pruneBefore = new Date(now - Math.max(PRUNE_MS, WINDOW_MS)).toISOString().slice(0, 10)
  let pruned = 0
  for (const slug of Object.keys(cache.articles)) {
    if (slug.slice(0, 10) < pruneBefore) {
      delete cache.articles[slug]
      pruned++
    }
  }
  if (pruned > 0) console.log(`  · swedish: pruned ${pruned} stale translation(s)`)
}

persist()

const elapsed = ((Date.now() - stageT0) / 1000).toFixed(1)
console.log(
  `Swedish desk: ${translated} translated, ${dropped} dropped, ${missing} not returned, ` +
    `${registerWarned} register-warned, ` +
    `${Object.keys(cache.articles).length} in payload, $${totalCostUsd.toFixed(2)}, ${elapsed}s`,
)
