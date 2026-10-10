// Splits an article body into the visual blocks the reader sees on screen
// (one `<p>` on web, one `<Text>` element on mobile — each separated by a
// vertical gap). Block boundaries are markdown paragraph breaks: a blank
// line between prose runs, which the writer declares explicitly.
/** @param {string} text */
export function splitBlocks(text) {
  return text.trim().split(/\n\s*\n/).map(s => s.trim()).filter(Boolean)
}

/**
 * The blocks that count as blocks: the ones longer than five characters. A
 * rule (`---`) or a stray mark between two paragraphs is split off like any
 * paragraph and is not one.
 *
 * This and the range below were spelled five times (the validator, the article
 * contract, the weekly scan, the editor's length probe and the corpus test),
 * and they have to agree: the probe tells the editor how many blocks an
 * article has, and the validator then counts them to decide whether it ships.
 *
 * @param {string} text
 * @returns {string[]}
 */
export const countedBlocks = (text) => splitBlocks(text).filter((block) => block.length > 5)

/** How many blocks a body has, as every stage counts them. @param {string} text */
export const countBlocks = (text) => countedBlocks(text).length

/**
 * The range an article may ship in. The writer's contract is four blocks, or
 * five when the optional counterpoint-or-quote block was earned
 * (`scripts/write-prompt.md` §rhythm). This is wider in both directions on
 * purpose, and `lib/validate-article.js` says why: two and three are readable
 * news that lost a paragraph break, and six is a malformed file.
 */
export const BLOCKS_MIN = 2
export const BLOCKS_MAX = 5
