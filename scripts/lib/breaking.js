// Which of a cycle's stories are breaking news it may push.
//
// Two places decide this: the social pick before the build
// (`scripts/pick-breaking-social.js`) and the push block after the deploy
// (`run-cycle.sh`), which carries its own copy with its own frontmatter
// reader. This is the first one's, moved out of the script so it has a test;
// the second is to follow it here.

/** A story with no second source behind it is not pushed (experiment 2026-04-16-push-min-coverage). */
export const MIN_PUSH_COVERAGE = 1

/**
 * @typedef {object} BreakingCandidate
 * @property {string} slug
 * @property {string} title the article's, or else the ledger's label for the story
 * @property {string} category
 * @property {string} body the article's prose
 * @property {number} importance the ledger's, 0 when it has none
 * @property {number} eventCoverage how many outlets carried the event
 */

/**
 * The articles of the last cycle that open a story (the ledger has it as
 * breaking and covered once) and are covered widely enough to push, the most
 * covered first.
 *
 * @param {{ stories?: import('./schema.js').LedgerStory[] }} ledger
 * @param {{ articles?: { slug: string }[] }} cycle the last cycle's record
 * @param {(slug: string) => { meta: Record<string, any>, body: string } | null} articleOf
 *   the article saved under a slug; null when there is none, and the story is passed over
 * @returns {BreakingCandidate[]}
 */
export function breakingCandidates(ledger, cycle, articleOf) {
  const slugs = new Set((cycle.articles || []).map((a) => a.slug))
  /** @type {BreakingCandidate[]} */
  const out = []
  for (const s of ledger.stories || []) {
    if (s.arc !== 'breaking' || s.coverageCount !== 1) continue
    for (const slug of s.articles || []) {
      if (!slugs.has(slug)) continue
      const article = articleOf(slug)
      if (!article) continue
      const { meta, body } = article
      out.push({
        slug,
        title: meta.title || s.label || '',
        category: meta.category || s.category || 'news',
        body,
        importance: s.importance || 0,
        eventCoverage: Number.parseInt(meta.eventCoverage, 10) || 0,
      })
    }
  }
  return out
    .filter((c) => c.eventCoverage >= MIN_PUSH_COVERAGE)
    .sort((a, b) => b.eventCoverage - a.eventCoverage)
}
