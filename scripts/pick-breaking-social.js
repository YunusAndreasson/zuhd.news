#!/usr/bin/env node
// Stage 3a.5 — social pick: choose which breaking story gets mirrored to
// Instagram/X and give it a scroll-stopping card headline.
//
// The cycle mirrors exactly ONE breaking story to social each run (see
// run-cycle.sh). Historically that story was the top breaking candidate by
// eventCoverage — a newsworthiness signal, not an attention signal. This step
// re-ranks the eligible (coverage-validated) breaking candidates for social
// pull with one Claude call and writes an optimized `socialTitle` into the
// winner's frontmatter BEFORE build.js runs, so the baked /api/ig/{slug}.jpg
// card and the X card both render the punchier headline.
//
// Output: content/.breaking-pick.json = { slug, socialTitle, score, reason }.
// run-cycle.sh's push/X/IG block honors this slug; if this step is skipped or
// fails, that block falls back to its own eventCoverage ordering — so this is
// strictly additive and never blocks a push.
//
// Fail-soft by design: any error (no candidates, bad Claude output, write
// failure) logs a note and exits 0 without a pick. The cycle continues.
//
// Usage: node scripts/pick-breaking-social.js [--dry-run]

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { spawnSync } from 'child_process'
import { parseFrontmatter } from './lib/frontmatter.js'

const ROOT = new URL('..', import.meta.url).pathname
const LEDGER = join(ROOT, 'content/.story-ledger.json')
const LAST_CYCLE = join(ROOT, 'content/.last-cycle.json')
const PICK_PATH = join(ROOT, 'content/.breaking-pick.json')
const PROMPT_PATH = join(ROOT, 'scripts/social-pick-prompt.md')
const ARTICLES_DIR = join(ROOT, 'content/articles')
const MIN_PUSH_COVERAGE = 1 // mirror run-cycle.sh's push gate

const dryRun = process.argv.includes('--dry-run')
const note = (m) => console.log(`pick-breaking-social: ${m}`)

// A candidate lead for the prompt — first paragraph, dateline + markdown
// stripped, cut to a clean sentence boundary (fuller than the push lead).
function leadOf(body) {
  let t = String(body || '')
    .trim()
    .split(/\n\n+/)[0]
    .replace(/^[A-Z][\w .,'-]{0,28}\s—\s/, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (t.length > 320) {
    const cut = t.slice(0, 320)
    const end = cut.lastIndexOf('. ')
    t = end > 160 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…'
  }
  return t
}

// --- gather eligible breaking candidates (mirrors run-cycle.sh selection) ---
function candidates() {
  const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'))
  const cycle = JSON.parse(readFileSync(LAST_CYCLE, 'utf8'))
  const slugs = new Set((cycle.articles || []).map((a) => a.slug))
  const out = []
  for (const s of ledger.stories || []) {
    if (s.arc !== 'breaking' || s.coverageCount !== 1) continue
    for (const slug of s.articles || []) {
      if (!slugs.has(slug)) continue
      const path = join(ARTICLES_DIR, `${slug}.md`)
      if (!existsSync(path)) continue
      const { meta, body } = parseFrontmatter(readFileSync(path, 'utf8'))
      const eventCoverage = parseInt(meta.eventCoverage) || 0
      out.push({
        slug,
        title: meta.title || s.label || '',
        category: meta.category || s.category || 'news',
        lead: leadOf(body),
        importance: s.importance || 0,
        eventCoverage,
      })
    }
  }
  return out
    .filter((c) => c.eventCoverage >= MIN_PUSH_COVERAGE)
    .sort((a, b) => b.eventCoverage - a.eventCoverage)
}

// --- ask Claude to pick + write the card headline ---
function pickViaClaude(cands) {
  const block = cands
    .map(
      (c, i) =>
        `${i + 1}. slug: ${c.slug}\n   category: ${c.category}  importance: ${c.importance}  eventCoverage: ${c.eventCoverage}\n   title: ${c.title}\n   lead: ${c.lead}`,
    )
    .join('\n\n')
  const prompt = `${readFileSync(PROMPT_PATH, 'utf8')}\n${block}\n`
  const env = { ...process.env }
  delete env.CLAUDECODE // don't inherit the parent Claude session marker
  const res = spawnSync(
    'claude',
    [
      '--model', process.env.ZUHD_SOCIAL_PICK_MODEL || process.env.ZUHD_MODEL || 'claude-sonnet-5',
      '--effort', 'medium',
      '--no-session-persistence',
      '--max-turns', '1',
      '--tools', '',
      '-p', prompt,
    ],
    { encoding: 'utf-8', timeout: 45_000, maxBuffer: 512 * 1024, env },
  )
  if (res.status !== 0) {
    note(`claude exit ${res.status}: ${(res.stderr || '').slice(0, 200)}`)
    return null
  }
  // Take the first {...} JSON object in the output (tolerate stray prose).
  const m = (res.stdout || '').match(/\{[\s\S]*\}/)
  if (!m) {
    note(`no JSON in claude output: ${(res.stdout || '').slice(0, 120)}`)
    return null
  }
  try {
    return JSON.parse(m[0])
  } catch (e) {
    note(`bad JSON from claude: ${e.message}`)
    return null
  }
}

// --- write socialTitle into the winner's frontmatter (minimal text edit) ---
function writeSocialTitle(slug, socialTitle) {
  const path = join(ARTICLES_DIR, `${slug}.md`)
  const raw = readFileSync(path, 'utf8')
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n/)
  if (!fm) throw new Error('no frontmatter block')
  const value = JSON.stringify(socialTitle) // valid YAML double-quoted scalar
  let block = fm[1]
  if (/^socialTitle:/m.test(block)) {
    block = block.replace(/^socialTitle:.*$/m, `socialTitle: ${value}`)
  } else if (/^title:.*$/m.test(block)) {
    block = block.replace(/^(title:.*)$/m, `$1\nsocialTitle: ${value}`)
  } else {
    block = `${block}\nsocialTitle: ${value}`
  }
  writeFileSync(path, `---\n${block}\n---\n${raw.slice(fm[0].length)}`)
}

// --- run ---
try {
  const cands = candidates()
  if (!cands.length) {
    note('no eligible breaking candidates — no social pick (legacy selection applies).')
    process.exit(0)
  }

  // A single validated candidate still gets an optimized card headline, but a
  // one-item list needs no re-ranking to reason about.
  const pick = pickViaClaude(cands)
  const chosen = pick && cands.find((c) => c.slug === pick.slug)
  if (!chosen) {
    note(`claude returned no usable slug (got ${pick?.slug ?? 'none'}) — falling back to top coverage.`)
    process.exit(0)
  }

  const socialTitle = String(pick.socialTitle || '').trim().replace(/^["'“”]+|["'“”]+$/g, '').slice(0, 80).trim()
  const record = {
    timestamp: new Date().toISOString(),
    slug: chosen.slug,
    socialTitle: socialTitle || null,
    articleTitle: chosen.title,
    score: Number(pick.score) || null,
    reason: String(pick.reason || '').slice(0, 120),
    candidateCount: cands.length,
  }

  if (dryRun) {
    note('[dry-run] would pick:')
    console.log(JSON.stringify(record, null, 2))
    process.exit(0)
  }

  if (socialTitle) {
    try {
      writeSocialTitle(chosen.slug, socialTitle)
      note(`wrote socialTitle to ${chosen.slug}: "${socialTitle}"`)
    } catch (e) {
      note(`could not write socialTitle (non-fatal, card uses article title): ${e.message}`)
      record.socialTitle = null
    }
  }

  writeFileSync(PICK_PATH, JSON.stringify(record, null, 2) + '\n')
  note(`picked ${chosen.slug} (score ${record.score ?? '?'}) of ${cands.length} candidates.`)
} catch (e) {
  note(`${e.message} — non-fatal, cycle continues with legacy selection.`)
  process.exit(0)
}
