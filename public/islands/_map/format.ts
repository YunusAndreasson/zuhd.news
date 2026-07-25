// Number formatting for the map's cards.
//
// The map island ships no framework, so it can reach none of the repo's
// existing formatters: `formatValue` lives in a Node build script
// (`scripts/build/entity-pages.js`), and `country-preview.ts`'s `formatRank`
// is inside a Preact module whose import would pull preact + hooks + htm into
// `situation-map.js`. Before this file the island's whole numeric vocabulary
// was `relativeTime` plus two expressions inlined at their call sites — the
// delta string in `showChokepoint` and the rank in the country card, which had
// silently drifted apart (`6/145` here, `6 / 145` there).
//
// Everything here is pure and DOM-free.

/** Thousands separators. `25712` → `25,712`. */
export const grouped = (n: number): string =>
  Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : ''

/**
 * Population, abbreviated.
 *
 * GDACS exposure figures span four orders of magnitude in a single feed — 124
 * people through 9.3 million — and the card has one line for them. Spelling
 * out the large ones costs more width than the extra digits are worth, and at
 * that scale the precision is false anyway: an exposure model is not counting
 * individuals. Below 10,000 the exact figure is both narrow enough to print
 * and plausibly meaningful, so it stays.
 */
export const population = (n: number): string => {
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n < 10_000) return grouped(n)
  if (n < 1_000_000) return `${Math.round(n / 1000)}K`
  const m = n / 1_000_000
  return `${m < 10 ? m.toFixed(1).replace(/\.0$/, '') : Math.round(m)}M`
}

/**
 * A readable label for a chokepoint's change against its 90-day baseline.
 *
 * `delta7vs90` is a *signed fractional change*, not a ratio: PortWatch's
 * `0.141` means last week ran 14% above the baseline, and `-0.174` means 17%
 * below. Reading it as a ratio inverts the story — it put "86% below baseline"
 * on a Panama Canal that was running 9.1 container ships/day against a
 * baseline of 8, and printed impossible figures like "-117%" for a strait that
 * was down 17%. Every one of the eleven chokepoints was mislabelled.
 *
 * Large changes are stated as multiples rather than percentages, which is how
 * shipping traffic is actually discussed: +428% is `5.3× the 90-day baseline`.
 */
export const deltaLabel = (change: number): string | null => {
  if (!Number.isFinite(change)) return null
  const ratio = 1 + change
  if (ratio >= 2) return `${ratio.toFixed(1).replace(/\.0$/, '')}× the 90-day baseline`
  if (ratio <= 0.5 && ratio > 0) return `${Math.round((1 - ratio) * 100)}% below baseline`
  const pct = Math.round(change * 100)
  if (pct === 0) return 'level with the 90-day baseline'
  return `${pct > 0 ? '+' : ''}${pct}% vs 90-day baseline`
}

/** A vessel-count average. One decimal, because these are daily means. */
export const vessels = (n: number | undefined): string =>
  typeof n === 'number' && Number.isFinite(n) ? n.toFixed(1).replace(/\.0$/, '') : ''

/** `12 / 145`. The country card's ranking, spaced. */
export const rank = (r: number, total: number): string => `${r} / ${total}`

/**
 * A source's sentiment, as a signed two-decimal number.
 *
 * Only ever shown on stories the map has already marked contested, where the
 * spread between outlets is the point. Printing it on every card would be
 * editorialising — the figure is a machine estimate of tone, not a judgement
 * we stand behind story by story.
 */
export const sentiment = (v: number): string =>
  `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`

/**
 * An ISO date as a plain UTC day. `2026-06-28` → `28 Jun`.
 *
 * Chokepoint and conflict payloads both date themselves in ISO; the cards want
 * the shortest form that still says which day.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const shortDate = (iso: string): string => {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/**
 * How far behind the present a dated snapshot runs, in plain words.
 *
 * Shared by the chokepoint sheet (PortWatch publishes weekly, and the snapshot
 * can sit a month back) and available to anything else with an `asOf`. Returns
 * null inside a fortnight, where "when" is not yet a caveat worth the line.
 */
export const lagLabel = (iso: string, now = Date.now()): string | null => {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  const days = Math.round((now - t) / 86_400_000)
  if (days < 14) return null
  const months = Math.round(days / 30)
  return months >= 2 ? `~${months} months old` : `~${days} days old`
}
