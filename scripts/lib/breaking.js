// Which of a cycle's stories are breaking news it may push.
//
// Two places decide this: the social pick before the build
// (`scripts/pick-breaking-social.js`) and the push after the deploy
// (`scripts/cycle/breaking-push.js`). Both selections are here, and they are
// not the same: the second half of this file says where they part.

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

// ── The push after the deploy ────────────────────────────────────────
//
// The push chose its story with a program of its own, written inside the shell
// script that ran the cycle, which is what follows. It reads the same ledger
// and the same last cycle as
// `breakingCandidates`, and differs from it in ways small enough to miss:
//
// - it reads an article with line patterns, not the frontmatter parser
//   (`pushFields`), so a quoted value stops at its first inner quote;
// - an article that is not on disk is still a candidate, with no coverage;
// - a title nobody has is left out of the record rather than written as '';
// - its lead is the push's own, 80 characters, where the social pick's is 320.
//
// Both are kept as they were. What the push shows a reader comes out of this
// one, so it is moved exactly.

/**
 * An article as the push reads it: every top-level `key: value` line of the
 * frontmatter as text, and `lead`, the opening paragraph without its dateline,
 * cut at a word within 80 characters. A file with no frontmatter gives nothing.
 *
 * @param {string} md
 * @returns {Record<string, string>}
 */
export function pushFields(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return {}
  /** @type {Record<string, string>} */
  const fm = {}
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*"?([^"]+)"?/)
    if (kv) fm[kv[1]] = kv[2].trim()
  }
  // First non-empty paragraph after frontmatter
  const body = md.slice(m[0].length).trim().split(/\n\n/)[0] || ''
  // Strip location prefix (e.g. 'Washington — ') and end at a clean sentence boundary
  const raw = body.replace(/^[A-Za-z\s,]+\s—\s/, '')
  const cut = raw.slice(0, 80)
  const lastSpace = cut.lastIndexOf(' ')
  fm.lead = lastSpace > 30 ? cut.slice(0, lastSpace) : cut
  return fm
}

/**
 * @typedef {object} PushCandidate
 * @property {string} slug
 * @property {string | undefined} title
 * @property {string} category
 * @property {string} body the lead, until the model's line replaces it
 * @property {number} eventCoverage
 * @property {number} importance
 */

/**
 * The last cycle's articles that open a story, the most covered first, each
 * as the push would send it. Coverage is not asked for here: `choosePush`
 * does that, so the log can say what was passed over.
 *
 * @param {{ stories: import('./schema.js').LedgerStory[] }} ledger
 * @param {{ articles: { slug: string }[] }} cycle the last cycle's record
 * @param {(slug: string) => Record<string, string>} fieldsOf `pushFields` of the article saved under a slug; empty when it cannot be read
 * @returns {PushCandidate[]}
 */
export function pushCandidates(ledger, cycle, fieldsOf) {
  const slugs = new Set(cycle.articles.map((a) => a.slug))
  return ledger.stories
    .filter((s) => s.arc === 'breaking' && s.coverageCount === 1)
    .flatMap((s) =>
      (s.articles || [])
        .filter((sl) => slugs.has(sl))
        .map((sl) => {
          const fm = fieldsOf(sl)
          return {
            slug: sl,
            title: fm.title || s.label,
            category: fm.category || s.category || 'news',
            body: fm.lead || '',
            // biome-ignore lint/correctness/useParseIntRadix: read without a radix since the program this came from, and a radix would change what `0x10` counts as.
            eventCoverage: Number.parseInt(fm.eventCoverage) || 0,
            importance: s.importance || 0,
          }
        }),
    )
    .sort((a, b) => b.eventCoverage - a.eventCoverage)
}

/**
 * The one story to push, if any. Only a story with a second source behind it
 * (experiment 2026-04-16-push-min-coverage: skips a push when the top
 * candidate is niche-only). The pre-build social pick is honoured when it
 * named an eligible story; otherwise the most covered goes.
 *
 * @param {PushCandidate[]} candidates
 * @param {{ slug?: string } | null | undefined} pick what `pick-breaking-social.js` left, if it left anything
 * @returns {{ selected: PushCandidate[], skipReason: string | null }} `selected` holds one story or none
 */
export function choosePush(candidates, pick) {
  const eligible = candidates.filter((c) => c.eventCoverage >= MIN_PUSH_COVERAGE)
  let ordered = eligible
  const idx = pick?.slug ? eligible.findIndex((c) => c.slug === pick.slug) : -1
  if (idx > 0) ordered = [eligible[idx], ...eligible.slice(0, idx), ...eligible.slice(idx + 1)]
  const selected = ordered
    .slice(0, 1)
    .map(({ slug, title, category, body, eventCoverage, importance }) => ({ slug, title, category, body, eventCoverage, importance }))
  const skipReason =
    candidates.length > 0 && eligible.length === 0 ? `all ${candidates.length} candidates below coverage threshold ${MIN_PUSH_COVERAGE}` : null
  return { selected, skipReason }
}

/**
 * This cycle's decision, as the push log holds it: every candidate, the one
 * chosen, and why none was. `lib/post-log.js` puts it on the end of the log
 * and keeps the last hundred.
 *
 * @param {PushCandidate[]} candidates
 * @param {{ selected: PushCandidate[], skipReason: string | null }} choice
 * @param {number} now
 */
export function pushDecision(candidates, { selected, skipReason }, now) {
  return {
    timestamp: new Date(now).toISOString(),
    candidateCount: candidates.length,
    candidates: candidates.map((c) => ({ slug: c.slug, title: c.title, category: c.category, eventCoverage: c.eventCoverage, importance: c.importance })),
    selected: selected[0] || null,
    skipReason,
    sent: false,
  }
}

/**
 * Mark the log's last decision as sent, with the title and body that went out
 * (the model's line by then) and what the push endpoint answered: parsed when
 * it is JSON, as text when it is not. An empty log is left empty.
 *
 * @param {any[]} log
 * @param {{ title?: string, body?: string }} art the article in the payload that was posted
 * @param {string | undefined} response
 */
export function markPushSent(log, art, response) {
  const last = log[log.length - 1]
  if (last) {
    last.sent = true
    last.pushTitle = art.title
    last.pushBody = art.body
    try {
      last.response = JSON.parse(/** @type {string} */ (response))
    } catch {
      last.response = response
    }
  }
  return log
}
