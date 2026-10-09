// The half of a poster that is not the platform.
//
// `post-to-twitter.js` and `post-to-instagram.js` were one program written
// twice, about 165 of their 518 lines: the slug they are handed, the
// credentials, the log a story is checked against, the article and its card,
// the line a model writes for it, and the promise that nothing they do stops
// the cycle. What is left in each script is the platform: how X is signed,
// how Instagram publishes.
//
// The log itself is `lib/post-log.js`, on its own so that the push, which
// keeps the third log of the kind, does not load the card renderer to write it.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { argAt, hasFlag } from './argv.js'
import { readArticle } from './article.js'
import { claudeArgs, claudeFailure, spawnClaude } from './claude-envelope.js'
import { pathOf } from './datasets.js'
import { igCardInputs } from './ig-image.js'
import { modelFor } from './models.js'
import { ROOT } from './paths.js'
import { postLog } from './post-log.js'
import { runStage } from './stage.js'

/**
 * The story a poster was handed: the article saved under the slug, parsed,
 * and what its card is drawn from, which is what the build drew the published
 * one from (`igCardInputs`). Null when there is no such article. One that
 * does not parse throws, as `readArticle` does.
 *
 * @param {string} slug
 * @param {{ dir?: string }} [opts] `dir` is for a test
 */
export function loadStory(slug, { dir = pathOf('articles') } = {}) {
  const path = join(dir, `${slug}.md`)
  if (!existsSync(path)) return null
  const { meta, body } = readArticle(path)
  return { slug, path, meta, body, card: igCardInputs(meta, body) }
}

/** @typedef {NonNullable<ReturnType<typeof loadStory>>} Story */

/**
 * What a model writes for the story: the prompt file, then the article's
 * title and prose. Its answer trimmed, or null when the call failed or said
 * nothing; the failure is printed, and the poster has a fallback for it.
 *
 * Asynchronous, so a poster can wait for something else meanwhile.
 *
 * @param {string} promptFile a file in `scripts/`: `tweet-prompt.md`
 * @param {Pick<Story, 'meta' | 'body'>} story
 * @param {{ who: string, timeoutMs?: number, call?: typeof spawnClaude }} opts `who` leads the failure line; `call` is for a test
 * @returns {Promise<string | null>}
 */
export async function writeCopy(promptFile, story, { who, timeoutMs = 30_000, call = spawnClaude }) {
  const article = `${story.meta.title || ''}\n\n${story.body}`.trim()
  const prompt = `${readFileSync(join(ROOT, 'scripts', promptFile), 'utf8')}\n${article}`
  const res = await call(claudeArgs(prompt, { model: modelFor('session'), json: false }), { timeout: timeoutMs, maxBuffer: 512 * 1024 })
  if (res.status !== 0) {
    console.error(`${who}: ${claudeFailure(res, timeoutMs)}`)
    return null
  }
  return (res.stdout || '').trim() || null
}

/**
 * @typedef {object} PostContext
 * @property {string} slug
 * @property {boolean} dryRun
 * @property {Story} story
 * @property {import('./post-log.js').PostLog} log
 */

/**
 * @typedef {object} Poster
 * @property {string} log the dataset name of its log: `tweetLog`
 * @property {boolean} haveCreds whether every credential it needs is set
 * @property {string} noCreds what it says when they are not: `X_* credentials not set — skipping tweet.`
 * @property {string} done what it says of a story that has gone out: `already tweeted`
 * @property {(ctx: PostContext) => Promise<Record<string, any> | void>} post the platform's part. It returns the
 *   entry it put in the log, if it put one: `sent: false` there is a post the platform refused
 */

/**
 * Everything around the post, in the order both scripts did it: the slug, the
 * credentials, the log, the article, and then the platform's part. Nothing
 * here stops the cycle: whatever a poster exits with, the next stage runs.
 *
 * A post that did not go out ends the script on 1, whether the platform
 * refused it (the entry it logged says `sent: false`) or the attempt threw.
 * Both used to end on 0, which the cycle reads as a post: X answered
 * "credits depleted" to every tweet from 2026-09-18, 97 in a row by 10-09, and
 * no cycle printed its `⚠ tweet step failed` line. The entry is in the log
 * before the status is decided.
 *
 * Returns what `runStage` reports, with the exit status the script ends on.
 *
 * @param {string} name `post-to-twitter`: it leads every line
 * @param {Poster} poster
 * @param {{ slug?: string, dryRun?: boolean, openLog?: () => import('./post-log.js').PostLog, load?: typeof loadStory }} [io]
 *   the arguments and the files, as given or as a test gives them
 * @returns {Promise<import('./stage.js').StageOutcome & { exitCode: number }>}
 */
export async function postStory(name, poster, { slug = argAt('slug'), dryRun = hasFlag('dry-run'), openLog = () => postLog(poster.log), load = loadStory } = {}) {
  if (!slug) {
    console.error(`${name}: --slug <slug> is required`)
    return { exitCode: 2, skipped: 'no slug' }
  }
  if (!poster.haveCreds && !dryRun) {
    console.log(`${name}: ${poster.noCreds}`)
    return { exitCode: 0, skipped: 'no credentials' }
  }
  let log
  try {
    log = openLog()
  } catch (e) {
    console.error(`${name}: ${/** @type {Error} */ (e).message} — not posting ${slug}.`)
    return { exitCode: 1, degraded: 'the log could not be read' }
  }
  if (log.has(slug)) {
    console.log(`${name}: ${slug} ${poster.done} — skipping.`)
    return { exitCode: 0, skipped: poster.done }
  }
  const story = load(slug)
  if (!story) {
    console.error(`${name}: article not found (${join(pathOf('articles'), `${slug}.md`)}) — skipping.`)
    return { exitCode: 0, skipped: 'no article' }
  }
  let entry
  try {
    entry = await poster.post({ slug, dryRun, story, log })
  } catch (e) {
    const { message } = /** @type {Error} */ (e)
    console.error(`${name}: ${message} — non-fatal, cycle continues.`)
    return { exitCode: 1, degraded: message }
  }
  if (entry?.sent === false) return { exitCode: 1, degraded: String(entry.error ?? 'not sent') }
  return { exitCode: 0 }
}

/**
 * A poster as a stage: `postStory` when the script is the one that was
 * started, and nothing when it is imported.
 *
 * @param {{ filename?: string }} meta the script's own `import.meta`
 * @param {string} name
 * @param {Poster} poster
 */
export async function runPoster(meta, name, poster) {
  await runStage(meta, name, async () => {
    const { exitCode, ...outcome } = await postStory(name, poster)
    process.exitCode = exitCode
    return outcome
  })
}
