// The social pick: what the model is asked, what is read out of its answer,
// and how the headline it wrote reaches the article.
//
// These were the working parts of `scripts/pick-breaking-social.js`, which
// could only be tried by running it against a live model. The call itself
// stays in the script.

import { isDeepStrictEqual } from 'node:util'
import { stripDateline } from './article.js'
import { unquote } from './claude-envelope.js'
import { parseFrontmatter, setFrontmatterLine, yamlString } from './frontmatter.js'

/** @typedef {import('./breaking.js').BreakingCandidate} BreakingCandidate */

/**
 * A candidate's lead for the prompt: the first paragraph, dateline and
 * markdown stripped, cut to a clean sentence boundary (fuller than the push
 * lead).
 *
 * @param {string} body
 * @param {string} [location] the article's `location`, which is its dateline
 */
export function leadOf(body, location) {
  let t = stripDateline(String(body || '').trim().split(/\n\n+/)[0], location)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (t.length > 320) {
    const cut = t.slice(0, 320)
    const end = cut.lastIndexOf('. ')
    t = end > 160 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, '')}…`
  }
  return t
}

/**
 * The prompt: the instructions (`scripts/social-pick-prompt.md`), then the
 * candidates, numbered in the order given.
 *
 * @param {string} instructions
 * @param {BreakingCandidate[]} cands
 */
export function pickPrompt(instructions, cands) {
  const block = cands
    .map(
      (c, i) =>
        `${i + 1}. slug: ${c.slug}\n   category: ${c.category}  importance: ${c.importance}  eventCoverage: ${c.eventCoverage}\n   title: ${c.title}\n   lead: ${leadOf(c.body, c.location)}`,
    )
    .join('\n\n')
  return `${instructions}\n${block}\n`
}

/**
 * Read the pick out of the model's answer: the first `{…}` in it, so stray
 * prose around the object is tolerated.
 *
 * @param {string | null | undefined} stdout
 * @returns {{ pick: Record<string, any>, problem: null } | { pick: null, problem: string }}
 */
export function parsePick(stdout) {
  const m = (stdout || '').match(/\{[\s\S]*\}/)
  if (!m) return { pick: null, problem: `no JSON in claude output: ${(stdout || '').slice(0, 120)}` }
  try {
    return { pick: JSON.parse(m[0]), problem: null }
  } catch (e) {
    return { pick: null, problem: `bad JSON from claude: ${/** @type {Error} */ (e).message}` }
  }
}

/**
 * The card headline the model wrote, without the quotes it tends to wrap it
 * in, at most 80 characters. Empty when it wrote none.
 *
 * @param {Record<string, any>} pick
 */
export const socialTitleOf = (pick) => unquote(String(pick.socialTitle || '')).slice(0, 80).trim()

/**
 * The article with `socialTitle` set, under its `title`: a minimal text edit,
 * every other line as it was. Throws when the file has no frontmatter.
 *
 * And throws when the edit is not exactly that. This runs after the validator
 * and before the build, so a frontmatter it breaks is a build that fails and a
 * cycle that publishes nothing: five did, from 2026-08-14 to 2026-09-28, each
 * on a headline with a dollar figure the edit then read as a pattern. So the
 * result is parsed before it is handed back: it has to carry the headline as
 * given and every other key as it was. The caller leaves the file alone on a
 * throw, and the card uses the article's own title.
 *
 * @param {string} raw
 * @param {string} socialTitle
 */
export function withSocialTitle(raw, socialTitle) {
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n/)
  if (!fm) throw new Error('no frontmatter block')
  const block = setFrontmatterLine(fm[1], 'socialTitle', yamlString(socialTitle), { after: 'title' })
  const next = `---\n${block}\n---\n${raw.slice(fm[0].length)}`

  const { socialTitle: _was, ...before } = parseFrontmatter(raw).meta
  const { socialTitle: now, ...after } = parseFrontmatter(next).meta
  if (now !== socialTitle) throw new Error('the headline did not survive the edit')
  if (!isDeepStrictEqual(after, before)) throw new Error('the edit changed more than the headline')
  return next
}
