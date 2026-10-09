// The story ledger's one update: what the cycle picked, folded into what it
// has been following. This was the body of `scripts/update-ledger.js`, which
// ran on import and had no test.

/** @typedef {import('./schema.js').LedgerStory} LedgerStory */

/**
 * Fold a selection into the ledger, in place, and say what changed.
 *
 * - A pick is matched to a story the ledger already follows by `eventUri`,
 *   then by its slug sharing at least three words and half of the story's id.
 * - A matched story is covered again: its count rises, the slug is added, and
 *   its arc advances (`breaking` to `developing` at two cycles, to `ongoing`
 *   at five).
 * - An unmatched pick becomes a new story at importance 6, arc `breaking`.
 * - Every story the selection did not touch loses one importance, and a story
 *   at zero is removed. That is the whole of the ledger's forgetting: a new
 *   story lasts six cycles without coverage.
 * - Sorted by importance, then by most recently covered.
 *
 * A story no longer keeps its picks' concept URIs. `conceptUris` was written
 * here and read by nothing, in this repository or in any payload built from
 * the ledger: 16,849 of the file's 127,655 bytes on 2026-10-09, which the
 * selector is told to read every cycle. A story that has them from before
 * keeps them until it fades.
 *
 * @param {{ version?: number, stories: LedgerStory[] }} ledger
 * @param {any[]} selection
 * @param {string} now ISO; the moment every touched story is stamped with
 * @returns {string[]} one line per change, as the stage prints them
 */
export function updateLedger(ledger, selection, now) {
  const coveredIds = new Set()
  const changes = []

  // Build eventUri→story index for matching
  const byEventUri = new Map()
  const bySlugPrefix = new Map()
  for (const story of ledger.stories) {
    if (story.eventUri) byEventUri.set(story.eventUri, story)
    bySlugPrefix.set(story.id, story)
  }

  for (const entry of selection) {
    /** @type {string} */
    const slug = entry.suggestedSlug || ''
    // Try to match to existing ledger entry
    let match = null
    if (entry.eventUri && byEventUri.has(entry.eventUri)) {
      match = byEventUri.get(entry.eventUri)
    }
    if (!match) {
      // Try slug-prefix matching (first few words)
      for (const [id, story] of bySlugPrefix) {
        // Match if the slug shares significant overlap with an existing entry
        const entryWords = slug.replace(/^\d{4}-\d{2}-\d{2}-/, '').split('-')
        const idWords = id.split('-')
        const overlap = entryWords.filter(w => idWords.includes(w)).length
        if (overlap >= 3 && overlap >= idWords.length * 0.5) {
          match = story
          break
        }
      }
    }

    if (match) {
      // Update existing entry
      match.lastCovered = now
      match.coverageCount = (match.coverageCount || 0) + 1
      if (!match.articles) match.articles = []
      if (slug && !match.articles.includes(slug)) match.articles.push(slug)
      // Advance arc based on coverage count
      if (match.coverageCount >= 5 && match.arc !== 'ongoing') {
        match.arc = 'ongoing'
      } else if (match.coverageCount >= 2 && match.arc === 'breaking') {
        match.arc = 'developing'
      }
      coveredIds.add(match.id)
      changes.push(`Updated: ${match.id} → coverage ${match.coverageCount}, arc ${match.arc}`)
    } else {
      // New entry
      const id = slug.replace(/^\d{4}-\d{2}-\d{2}-/, '')
      /** @type {LedgerStory} */
      const newStory = {
        id,
        label: entry.title || '',
        firstSeen: now,
        lastCovered: now,
        coverageCount: 1,
        category: entry.category || 'politics',
        importance: 6,
        arc: 'breaking',
        articles: slug ? [slug] : [],
        eventUri: entry.eventUri || null,
        summary: entry.angle || '',
      }
      ledger.stories.push(newStory)
      coveredIds.add(id)
      bySlugPrefix.set(id, newStory)
      changes.push(`New: ${id}`)
    }
  }

  // Decay importance for uncovered stories
  let decayed = 0
  for (const story of ledger.stories) {
    if (!coveredIds.has(story.id)) {
      story.importance = Math.max(0, (story.importance || 1) - 1)
      decayed++
    }
  }
  if (decayed > 0) changes.push(`Decayed importance for ${decayed} uncovered stories`)

  // Remove entries at importance 0
  const before = ledger.stories.length
  ledger.stories = ledger.stories.filter(s => s.importance > 0)
  const removed = before - ledger.stories.length
  if (removed > 0) changes.push(`Removed ${removed} entries at importance 0`)

  // Sort by importance desc, then lastCovered desc
  ledger.stories.sort((a, b) => (b.importance - a.importance) || (b.lastCovered || '').localeCompare(a.lastCovered || ''))

  return changes
}
