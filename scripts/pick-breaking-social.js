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
// Who is a candidate is `lib/breaking.js`; what the model is asked and what is
// made of its answer is `lib/social-pick.js`.
//
// Usage: node scripts/pick-breaking-social.js [--dry-run]

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readArticle } from './lib/article.js'
import { breakingCandidates } from './lib/breaking.js'
import { claudeArgs, claudeFailure, runClaudeSync } from './lib/claude-envelope.js'
import { pathOf } from './lib/datasets.js'
import { writeJson, writeText } from './lib/json-file.js'
import { ROOT } from './lib/paths.js'
import { parsePick, pickPrompt, socialTitleOf, withSocialTitle } from './lib/social-pick.js'
import { runStage } from './lib/stage.js'
import { modelFor } from './lib/models.js'

const PROMPT_PATH = join(ROOT, 'scripts/social-pick-prompt.md')
const TIMEOUT_MS = 45_000

/** @param {string} m */
const note = (m) => console.log(`pick-breaking-social: ${m}`)

export function main() {
  const dryRun = process.argv.includes('--dry-run')
  const articlePath = (/** @type {string} */ slug) => join(pathOf('articles'), `${slug}.md`)

  try {
    const ledger = JSON.parse(readFileSync(pathOf('storyLedger'), 'utf8'))
    const cycle = JSON.parse(readFileSync(pathOf('lastCycle'), 'utf8'))
    const cands = breakingCandidates(ledger, cycle, (slug) => (existsSync(articlePath(slug)) ? readArticle(articlePath(slug)) : null))
    if (!cands.length) {
      note('no eligible breaking candidates — no social pick (legacy selection applies).')
      return { skipped: 'no eligible breaking candidates' }
    }

    // A single validated candidate still gets an optimized card headline, but a
    // one-item list needs no re-ranking to reason about.
    const res = runClaudeSync(
      claudeArgs(pickPrompt(readFileSync(PROMPT_PATH, 'utf8'), cands), {
        model: modelFor('socialPick'),
        json: false,
      }),
      { timeout: TIMEOUT_MS, maxBuffer: 512 * 1024 },
    )
    let pick = null
    if (res.status !== 0) {
      note(claudeFailure(res, TIMEOUT_MS))
    } else {
      const answer = parsePick(res.stdout)
      if (answer.problem) note(answer.problem)
      pick = answer.pick
    }
    const chosen = pick && cands.find((c) => c.slug === pick.slug)
    if (!pick || !chosen) {
      note(`claude returned no usable slug (got ${pick?.slug ?? 'none'}) — falling back to top coverage.`)
      return { counts: { candidates: cands.length, picked: 0 }, degraded: 'no usable pick: the push keeps its own order' }
    }

    const socialTitle = socialTitleOf(pick)
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
      return { counts: { candidates: cands.length, picked: 0 }, skipped: 'dry run' }
    }

    if (socialTitle) {
      try {
        const path = articlePath(chosen.slug)
        writeText(path, withSocialTitle(readFileSync(path, 'utf8'), socialTitle))
        note(`wrote socialTitle to ${chosen.slug}: "${socialTitle}"`)
      } catch (e) {
        note(`could not write socialTitle (non-fatal, card uses article title): ${/** @type {Error} */ (e).message}`)
        record.socialTitle = null
      }
    }

    writeJson(pathOf('breakingPick'), record)
    note(`picked ${chosen.slug} (score ${record.score ?? '?'}) of ${cands.length} candidates.`)
    return { counts: { candidates: cands.length, picked: 1, titled: record.socialTitle ? 1 : 0 } }
  } catch (e) {
    const why = /** @type {Error} */ (e).message
    note(`${why} — non-fatal, cycle continues with legacy selection.`)
    return { degraded: why }
  }
}

await runStage(import.meta, 'pick-breaking-social', main)
