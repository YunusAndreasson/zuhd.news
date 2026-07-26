// The rank strip: a bar that says where in the world a country's figure sits.
//
// Three lines of arithmetic that were written out three times — once in
// `scripts/build/country-pages.js` and twice in `_map/popup.ts`, where the
// metric list and the standing block each carried their own copy. Nothing had
// drifted yet. The point of moving it is that "yet" is the whole of the
// guarantee: the country page and the map card state the same rank about the
// same country, and the only thing making their bars agree was that someone
// pasted the expression carefully.
//
// Deliberately not merged with `country-metrics.js`'s `p`. That is a different
// quantity for a different job — position on the *value* scale, which is what
// the land ramp paints — and the two are only equal on a uniformly distributed
// metric. The strip sits beside a printed rank and has to mean the rank.

export interface RankStrip {
  /** 0–1, how full the bar is. Rank 1 is full. */
  fill: number
  /** The percentage string the CSS custom property wants. */
  css: string
  /** "6 of 145", or an em dash where there is no rank. */
  text: string
}

const EM_DASH = '—'

/**
 * Rank 1 of 145 is a full bar; last is empty.
 *
 * The direction is not negotiable per metric, and does not need to be: the
 * ranking is already sorted by the metric's own editorial direction, so rank 1
 * is the top of whatever that metric considers the top. Press freedom's rank 1
 * is Norway and not Eritrea because `getRanking` put it there — the strip only
 * has to mean "near the front".
 */
export const rankStrip = (rank: number | null | undefined, total: number): RankStrip => {
  if (rank == null || !Number.isFinite(rank) || !Number.isFinite(total) || total <= 1) {
    return { fill: 0, css: '0%', text: rank != null && total > 0 ? `${rank} of ${total}` : EM_DASH }
  }
  const raw = 1 - (rank - 1) / (total - 1)
  const fill = Math.max(0, Math.min(1, raw))
  return { fill, css: `${(fill * 100).toFixed(1)}%`, text: `${rank} of ${total}` }
}
