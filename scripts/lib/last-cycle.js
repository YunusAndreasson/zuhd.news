// What the cycle published, as the next cycle's selector reads it
// (`content/.last-cycle.json`). This was the body of
// `scripts/write-last-cycle.js`.

/**
 * The picks whose article exists, in the shape the selector is told to read:
 * so the next cycle skips only what was actually published, not everything
 * that was selected. A pick the writer refused, or the validator moved aside,
 * has no article and is left out.
 *
 * @param {import('./schema.js').SelectionEntry[]} selection
 * @param {(slug: string) => boolean} written whether the article of that slug is on disk
 * @param {string} now ISO
 */
export function lastCycle(selection, written, now) {
  const published = selection.filter((s) => written(s.suggestedSlug))
  return {
    timestamp: now,
    articles: published.map((s) => ({ slug: s.suggestedSlug, title: s.title, category: s.category, source: s.source })),
    categories: [...new Set(published.map((s) => s.category))],
    sources: [...new Set(published.map((s) => s.source))],
  }
}
