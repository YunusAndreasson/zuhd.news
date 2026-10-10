// Smoothing a series that is noise one observation at a time.
//
// One function, and it is here rather than in the build or in an island
// because both need it: the build publishes a strait's series as its week's
// mean (`/api/entity/cp:*.json`), and the map reads the same mean off
// `/api/chokepoints.json` for a strait's row and label. Two copies of a mean
// would be two straits.

/**
 * Each observation as the mean of itself and the `span - 1` before it.
 *
 * Ships through Hormuz read `4, 0, 4, 2, 4` over five days while the strait sat
 * 42% under its 90-day average: first against last of that is 0%, and any two
 * neighbours are ±100%. The week's mean is the quantity PortWatch itself
 * reports (`last7Avg`) and the one a line can honestly be drawn through.
 *
 * Non-finite where there is not a whole span behind a point, so the line starts
 * where the first full span ends rather than on a mean of one day. A gap inside
 * the span is left out of that mean, not counted as zero.
 */
/**
 * A daily count as its trailing week's mean, ready to draw: from the first day
 * with a whole week behind it, rounded to one decimal (a mean of seven counts
 * has no more, and unrounded it reached a readout as `2.714286 vessels`), with
 * `periods` cut to match so its last label is still the last day counted.
 *
 * Null where that leaves fewer than two points, which is no line.
 *
 * The build publishes this as a strait's indicator series and the map reads it
 * for the strait's row, label and card. It was written out in both places, and
 * a change to the rounding in one would have been two straits.
 */
export const weekMeanSeries = (
  values: readonly number[] | undefined,
  periods: readonly string[] | undefined,
): { values: number[]; periods: string[] } | null => {
  if (!Array.isArray(values)) return null
  const week = trailingMean(values, 7)
  const from = week.findIndex(Number.isFinite)
  if (from < 0 || week.length - from < 2) return null
  return {
    values: week.slice(from).map((v) => Math.round(v * 10) / 10),
    periods: (periods ?? []).slice(from),
  }
}

export const trailingMean = (values: readonly number[], span: number): number[] =>
  values.map((_, i) => {
    if (i < span - 1) return Number.NaN
    let sum = 0
    let n = 0
    for (let k = i - span + 1; k <= i; k++) {
      const v = values[k]
      if (typeof v === 'number' && Number.isFinite(v)) {
        sum += v
        n++
      }
    }
    return n ? sum / n : Number.NaN
  })
