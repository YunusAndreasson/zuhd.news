// The selector's map of what the last day already covered. This was the body
// of `scripts/coverage-map.js`.

/**
 * Group slugs by their first word and print each group on a line, largest
 * first, three to a line: `iran: talks resume in oman; hormuz traffic dips
 * (+2 more)`. A slug here has lost its date and its `.md`.
 *
 * The grouping is by first word and nothing cleverer. It turned 125 slugs
 * into about 25 lines the selector could take in at a glance, which a raw
 * list was not.
 *
 * @param {string[]} slugs
 * @returns {string[]}
 */
export function coverageLines(slugs) {
  /** @type {Record<string, string[]>} */
  const groups = {}
  for (const s of slugs) {
    const key = s.split('-')[0]
    if (!groups[key]) groups[key] = []
    groups[key].push(s.split('-').slice(1).join(' '))
  }
  return Object.entries(groups)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([k, v]) => `${k}: ${v.slice(0, 3).join('; ')}${v.length > 3 ? ` (+${v.length - 3} more)` : ''}`)
}
