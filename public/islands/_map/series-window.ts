// Turning a money series into a calendar window.
//
// Every series the money block draws publishes its points as pre-formatted
// display strings — `"Jul 27"` — with the ISO date discarded at fetch time in
// every one of `scripts/lib/trends-sources/*.js`. What survives is one
// series-level `asOf`. So the rail had no way to ask "the last 30 days" and
// asked "the last 30 points" instead, which is not the same question: 30 points
// is 30 calendar days on the FX basket and about six weeks on an exchange
// trading five days in seven.
//
// That is the whole reason this file exists. The dates are recoverable — the
// labels are in ascending order and end at `asOf` — and recovering them is what
// lets seven rows cover one period instead of seven.
//
// ── Why not add the dates to the payload ──────────────────────────────────
//
// `/api/trends.json` and `/api/markets.json` are a published contract with a
// shipped app on both stores. Reconstruction costs nothing on the wire and
// needs no cycle to land. `seriesDates` prefers a real `dates` array whenever
// one appears, so the day the fetchers keep their ISO dates this becomes the
// fallback and nothing else changes.

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
}

export const DAY_MS = 86_400_000

/** `"Jul 27"` → `{ month: 6, day: 27 }`, or `null` for anything else. */
const parseLabel = (label: string): { month: number; day: number } | null => {
  const m = /^([A-Za-z]{3})[a-z]*\s+(\d{1,2})$/.exec(label.trim())
  if (!m?.[1] || !m[2]) return null
  const month = MONTHS[m[1].toLowerCase()]
  const day = Number(m[2])
  if (month === undefined || !Number.isFinite(day) || day < 1 || day > 31) return null
  return { month, day }
}

/**
 * The calendar date of every point in a series, in epoch ms at UTC midnight.
 *
 * Walked **backwards** from `asOf`, because that is the only end whose year is
 * known. Going back, a month that steps *up* is a year boundary — December
 * following January in reverse — so the year decrements there. Sound because no
 * series here spans anything like twelve months (the longest is a quarter of
 * exchange sessions), and a series that did would be the one case this cannot
 * resolve: `"Jul 27"` fourteen months back is indistinguishable from `"Jul 27"`
 * two months back on the labels alone.
 *
 * `null` — never a guess — when `asOf` is missing or any label fails to parse.
 * Every caller falls back to a count-based window on `null`, so a source that
 * changes its date format degrades to the old behaviour rather than drawing a
 * window it has no basis for.
 */
export const seriesDates = (
  periods: readonly string[] | undefined,
  asOf: string | undefined,
  dates?: readonly number[] | undefined,
): number[] | null => {
  // The seam described in the header: a real array wins outright.
  if (dates && dates.length === periods?.length && dates.every(Number.isFinite)) return [...dates]

  if (!periods?.length || !asOf) return null
  const end = Date.parse(`${asOf}T00:00:00Z`)
  if (!Number.isFinite(end)) return null

  const out = new Array<number>(periods.length)
  let year = new Date(end).getUTCFullYear()
  let prevMonth: number | null = null

  for (let i = periods.length - 1; i >= 0; i--) {
    const label = periods[i]
    if (label === undefined) return null
    const parsed = parseLabel(label)
    if (!parsed) return null
    if (prevMonth !== null && parsed.month > prevMonth) year--
    prevMonth = parsed.month
    out[i] = Date.UTC(year, parsed.month, parsed.day)
  }
  return out
}

export interface Windowed {
  values: number[]
  /** Epoch ms, parallel to `values`. */
  dates: number[]
  /** Where the drawn data actually starts and ends. */
  from: number
  to: number
}

/**
 * The points of a series that fall on or after `from`.
 *
 * Never fewer than two: a window that lands inside a gap in the data would
 * otherwise return a dot, and `seriesModel` would refuse to draw it — which
 * reads as "no data" when the truth is "no data *in this window*, here is what
 * there is". The two-point floor is what makes the 24h step work at all, and it
 * is why `coverage` below is the thing that reports a shortfall rather than the
 * point count.
 */
export const windowByDate = (
  values: readonly number[],
  dates: readonly number[],
  from: number,
): Windowed | null => {
  if (values.length !== dates.length || values.length < 2) return null
  let start = dates.findIndex((d) => d >= from)
  if (start < 0) start = values.length - 2
  start = Math.min(start, values.length - 2)
  const out = {
    values: values.slice(start),
    dates: dates.slice(start),
    from: dates[start] ?? from,
    to: dates[dates.length - 1] ?? from,
  }
  return out.values.length >= 2 ? out : null
}

/**
 * How many observations of a series fall inside the last `days`.
 *
 * The translation between the rail, which thinks in days, and `createChart`,
 * whose `window` is a point count — so a card opened from a row draws the
 * period the row drew rather than the whole published series. Doing it here
 * rather than widening the chart's own vocabulary keeps the calendar arithmetic
 * in the one file that has the dates.
 *
 * `0` — the chart's own word for "all of it" — when the dates cannot be
 * recovered, which is the same fallback the sparkline takes.
 */
export const windowPoints = (
  periods: readonly string[] | undefined,
  asOf: string | undefined,
  days: number,
): number => {
  const dates = seriesDates(periods, asOf)
  const to = dates?.[dates.length - 1]
  if (!dates?.length || to === undefined) return 0
  const from = to - days * DAY_MS
  let n = 0
  for (const d of dates) if (d >= from) n++
  // Two is the floor `seriesModel` draws at; below it the card would render an
  // empty figure where the reader pressed a line.
  return Math.max(2, n)
}

/**
 * How many buckets a trend line is drawn from, at every range.
 *
 * One number rather than a ladder of bucket widths, because the window is
 * already the thing that varies and a resolution that varied with it would make
 * two rows at one range incomparable for a second reason. Thirty across the
 * window means an hour at the day step, six hours at the week and three days at
 * the quarter — and thirty is what the money rows happen to carry at their
 * commonest step, so a column of counts sets to the same rhythm as a column of
 * prices.
 */
export const TREND_BUCKETS = 30

/**
 * A run of event times as a count per bucket.
 *
 * The story and layer chips have no published series behind them — what they
 * have is a pile of timestamps, and the shape of the news is how many landed
 * when. Counts, not values, which is why this is here rather than reached
 * through `windowByDate`: there is nothing to window, only something to tally.
 *
 * Times outside `[from, to]` are dropped rather than clamped into the end
 * buckets, where they would pile up as a spike at whichever edge they fell past.
 */
export const bucketCounts = (
  times: readonly number[],
  from: number,
  to: number,
  buckets = TREND_BUCKETS,
): number[] => {
  const out = new Array<number>(buckets).fill(0)
  const span = to - from
  if (!(span > 0)) return out
  for (const t of times) {
    if (!Number.isFinite(t) || t < from || t > to) continue
    const i = Math.min(buckets - 1, Math.floor(((t - from) / span) * buckets))
    const at = out[i]
    if (at !== undefined) out[i] = at + 1
  }
  return out
}

/**
 * Which way a count series is going, as the later half against the earlier.
 *
 * Deliberately not last-against-first, which is what every *price* row here
 * prints. A price is a level and its last observation is the current state of
 * the world; a count is a rate, and one bucket of it against one other bucket
 * is noise wearing a percentage — at the day step that is "the 11pm hour had
 * three stories and the midnight hour had one, down 67%". Halves use every
 * observation in the window on both sides of the comparison, which is the
 * cheapest estimator that answers "is this rising" rather than "what happened
 * in the last bucket".
 *
 * `null` when the earlier half is empty: a rise from nothing has no percentage,
 * and printing one would be a division dressed up as a finding.
 */
export const halfOverHalf = (counts: readonly number[]): number | null => {
  if (counts.length < 4) return null
  const mid = Math.floor(counts.length / 2)
  const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)
  const first = sum(counts.slice(0, mid))
  const second = sum(counts.slice(mid))
  if (!first) return null
  return ((second - first) / first) * 100
}

/**
 * Where a series sits inside the window the reader asked for, as a 0–1 pair.
 *
 * This is what stops a short series lying. The FX basket publishes 30 days; an
 * exchange publishes a quarter. Asked for 90 days and drawn across the same box,
 * those two are the same picture, and nothing on screen says one of them is a
 * third of the other. Handed back as a span, the short one draws in the
 * right-hand third and the empty left is the statement.
 *
 * `[0, 1]` whenever the series covers the window, which is the common case and
 * the one the caller can ignore.
 */
export const coverage = (
  drawnFrom: number,
  drawnTo: number,
  windowFrom: number,
): [number, number] => {
  const total = drawnTo - windowFrom
  if (!(total > 0)) return [0, 1]
  const start = (drawnFrom - windowFrom) / total
  // Clamped rather than trusted: `windowByDate`'s two-point floor can hand back
  // a series that starts *before* the window when the window is narrower than
  // the gap between two observations, and a negative x would draw outside the
  // box.
  return [Math.min(Math.max(start, 0), 0.95), 1]
}
