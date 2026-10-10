// The capitals a reader is left to decode: which ones the site lets stand, and
// which of an article's are neither those nor a name.
//
// The rule is the writer's and the editor's ("always spell out abbreviations
// unless globally recognised"), and it had three copies of its list: both
// prompts and the weekly measure. The measure's was the strictest reading of
// it, so the week to 2026-10-04 counted 215 "violations" in 388 articles, led
// by CEO, UAE, DNA, NASA and GDP, none of which an article is better for
// spelling out. The owner widened the list on 2026-10-10 to those five and to
// TASS, RT and TRT, the state outlets the attribution rule requires by name.
// `scripts/write-prompt.md` and `scripts/check-prompt.md` print the same
// list; a test holds the three together.

/** Read as words by anyone who reads the news. An editorial list: the owner's. */
export const RECOGNISED = new Set([
  'US', 'UK', 'EU', 'UN', 'WHO', 'NATO', 'ISIS', 'IDF', 'IMF', 'ICC', 'ICJ',
  'CEO', 'UAE', 'DNA', 'NASA', 'GDP',
  // The outlets a state-media story must name (`write-prompt.md`).
  'TASS', 'RT', 'TRT',
  // Not in the prompts' list and never flagged: it is the word.
  'AI',
])

/**
 * The capitals in a text that are not recognised and are not something else:
 * each token once, in the order met.
 *
 * Three things written in capitals are not abbreviations to spell out, and on
 * the 743 articles of 2026-09-27 to 10-10 they were a quarter of what a bare
 * `[A-Z]{2,5}` found once the list was widened (144 articles flagged, 106
 * after):
 *   - a numeral: Pope Leo XIV;
 *   - a designation: GPT-6.1, AK-47, HTV-X;
 *   - the capitals of a name that goes on: JD Vance, SK Hynix, ICICI Bank,
 *     USS Theodore Roosevelt.
 * What is left is still a flag and never a verdict. A company known by its
 * capitals (BP, HSBC, AMD) reads the same as an agency nobody outside its
 * country knows (DMO, OGDCL), and telling them apart is the editor's reading.
 *
 * @param {string} text visible prose (`visibleText`, `lib/article.js`): a link's target is not prose
 * @returns {string[]}
 */
export function unexpandedAcronyms(text) {
  const prose = String(text || '')
  /** @type {string[]} */
  const out = []
  for (const m of prose.matchAll(/\b[A-Z]{2,5}\b/g)) {
    const token = m[0]
    const after = prose.slice(m.index + token.length, m.index + token.length + 4)
    if (RECOGNISED.has(token) || out.includes(token)) continue
    if (/^[IVXLC]+$/.test(token)) continue
    if (/^-(\d|[A-Z]\b)/.test(after)) continue
    if (/^ [A-Z][a-z]/.test(after)) continue
    out.push(token)
  }
  return out
}
