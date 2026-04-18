#!/usr/bin/env node
// Country-tag backfill.
//
// Upstream's writer now emits `[Name](country:XX)` markdown on first mention
// of each country entity, so mobile can open CountrySheet from the article
// body. Articles written before that prompt-change have no country tags —
// this script runs a Haiku pass over each, rewriting the body with
// first-mention country-link markdown. Idempotent: a run over an already-
// tagged body is a no-op because Haiku is told to preserve existing
// `[...](country:...)` markup.
//
// Reads /tmp/zuhd-new-articles.txt for the target list (same convention as
// extract-entities.js). Fails soft: any article whose rewrite fails keeps
// its original body and the next article proceeds.

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { spawnSync } from 'child_process'
import { randomUUID } from 'crypto'
import { parseFrontmatter } from './lib/frontmatter.js'

const ROOT = new URL('..', import.meta.url).pathname
const NEW_ARTICLES_PATH = '/tmp/zuhd-new-articles.txt'

if (!existsSync(NEW_ARTICLES_PATH)) {
  console.log('No new articles list — skipping country-tag backfill.')
  process.exit(0)
}

const newFiles = readFileSync(NEW_ARTICLES_PATH, 'utf8').trim().split('\n').filter(Boolean)
if (newFiles.length === 0) {
  console.log('No new articles — skipping country-tag backfill.')
  process.exit(0)
}

/**
 * Ask Haiku to insert first-mention `[Name](country:XX)` markdown into a
 * single article body. Returns the rewritten body, or null on any error
 * (bad JSON, length mismatch, empty string, etc). On failure the caller
 * keeps the original body.
 */
function rewriteBodyViaHaiku(body) {
  const invocationId = randomUUID().slice(0, 8)

  const prompt = `You add ISO country-link markdown to an article body. For each country ENTITY mentioned, replace the FIRST occurrence of its name with \`[Name](country:XX)\` using its ISO-3166 alpha-2 code uppercase.

Strict rules:
- First mention ONLY per country. Subsequent mentions stay plain.
- Tag country ENTITIES only, not adjectives or derived forms.
  ✓ "Iran" → "[Iran](country:IR)"
  ✓ "the United States" → "the [United States](country:US)"
  ✓ "Iran's parliament" → "[Iran](country:IR)'s parliament" (possessive keeps the link)
  ✗ "Iranian", "Pakistani", "Israeli" — adjectives, do NOT tag
  ✗ "pro-Iran", "anti-Russia" — compound constructs, do NOT tag
- Never re-tag an already-tagged mention. If the body already contains \`[...](country:...)\` markup, leave it untouched.
- Preserve every other character of the body BYTE-for-BYTE — whitespace, punctuation, markdown emphasis (**bold**, *italic*), em-dashes, quotes. The only allowed edits are inserting \`[...](country:XX)\` wrappers.
- Do NOT add commentary, explanations, or heading text. Do NOT wrap the output in markdown fences.

Common alpha-2 codes (reference): US, GB, FR, DE, IT, ES, RU, UA, PL, HU, TR, IR, IQ, SA, AE, QA, YE, SY, LB, IL, PS, JO, EG, LY, SD, SO, MA, DZ, TN, NG, KE, ET, ZA, CN, JP, KR, KP, IN, PK, BD, AF, MM, TH, VN, ID, MY, PH, SG, TW, HK, AU, NZ, BR, MX, AR, CO, PE, VE, CL, CU, CA.

Return ONLY the rewritten body text. No preamble, no closing remarks, no fences.

Body:
"""
${body.replace(/"""/g, "'''")}
"""`

  const env = { ...process.env }
  delete env.CLAUDECODE
  const res = spawnSync(
    'claude',
    [
      '--model', 'claude-haiku-4-5-20251001',
      '--no-session-persistence',
      '--max-turns', '1',
      '--output-format', 'json',
      '-p', prompt,
    ],
    { encoding: 'utf-8', timeout: 30_000, maxBuffer: 512 * 1024, env },
  )

  if (res.status !== 0) {
    console.error(`  ✗ country-haiku ${invocationId}: exit ${res.status}`)
    return null
  }
  try {
    const envelope = JSON.parse(res.stdout)
    const raw = envelope?.result ?? envelope?.text ?? res.stdout
    // Strip possible markdown fences Haiku sometimes wraps output in despite
    // the prompt rule.
    const cleaned = String(raw)
      .replace(/^```(?:markdown|md|)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim()
    if (cleaned.length < 40) throw new Error(`output too short (${cleaned.length} chars)`)
    // Sanity check: rewritten body should be roughly the same length as the
    // original — tagging adds ~18 chars per country, so a +50% size change
    // means something went wrong (Haiku rewrote the body, added preamble).
    const ratio = cleaned.length / body.length
    if (ratio < 0.9 || ratio > 1.5) {
      throw new Error(`size-delta out of bounds (${ratio.toFixed(2)}× original)`)
    }
    return cleaned
  } catch (err) {
    console.error(`  ✗ country-haiku ${invocationId}: ${err.message}`)
    return null
  }
}

/** Replace the body portion of a markdown file, keeping the frontmatter
 *  exactly. Frontmatter bounded by `---` fences. */
function replaceBody(raw, newBody) {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n/)
  if (!fmMatch) return raw
  return `---\n${fmMatch[1]}\n---\n${newBody}\n`
}

// --- Main loop ---
const t0 = Date.now()
let processed = 0
let edited = 0
let skipped = 0

for (const rel of newFiles) {
  const filename = basename(rel)
  if (!filename.endsWith('.md')) continue
  const fullPath = join(ROOT, rel)
  if (!existsSync(fullPath)) continue

  const raw = readFileSync(fullPath, 'utf8')
  const { body } = parseFrontmatter(raw)
  processed++

  // Skip if body already contains country markup — the writer is emitting
  // it natively and we'd be re-running Haiku for nothing.
  if (/\]\(country:[A-Z]{2}\)/.test(body)) {
    skipped++
    continue
  }

  const rewritten = rewriteBodyViaHaiku(body.trim())
  if (!rewritten) continue

  // Only write if Haiku actually introduced at least one country tag —
  // otherwise we'd churn the file for a cosmetic no-op.
  if (!/\]\(country:[A-Z]{2}\)/.test(rewritten)) continue

  writeFileSync(fullPath, replaceBody(raw, rewritten))
  edited++

  const countryMatches = [...rewritten.matchAll(/\]\(country:([A-Z]{2})\)/g)]
  const countries = [...new Set(countryMatches.map((m) => m[1]))].join(',')
  console.log(`  ✓ ${basename(filename, '.md').slice(0, 55)} — tagged ${countryMatches.length} (${countries})`)
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
console.log(
  `Country tags: ${edited} edited, ${skipped} already tagged, ${processed - edited - skipped} skipped, ${processed} total in ${elapsed}s`,
)
