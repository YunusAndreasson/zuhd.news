// Whether the newest reading is a record in its own series, and since when.
//
// A level means little until it is set against where it has been: `5.22%` is a
// number, `the highest since Aug 12` is news, and it is the line a market
// report reaches for first. A card's chart shows it and nothing on the card
// said it.
//
// It is arithmetic on the series the card already charts, so it reaches only
// as far back as the chart does, and says so: where nothing on the chart beats
// the newest reading the line names the chart's span (`in three months`), never
// `ever` and never a date before the first one drawn.
//
// The span is taken as a number, so each surface supplies it from the dates it
// already has: the app's caller (`mobile/lib/cards/record.ts`) reads it off
// the labels with its own date parser.

/** The newest reading against the rest of its series. */
export interface SeriesRecord {
  extreme: 'high' | 'low'
  /** The label of the last observation that was at least as high, or as low:
   *  the record has stood since then. Null when the series holds none. */
  since: string | null
  /** How many observations in a row, back from the newest, it stands clear of. */
  run: number
}

/**
 * How long a record must have stood, in observations, before it is one worth a
 * line: about a month of sessions. A series sets a five-day high most weeks,
 * and a line that printed for those would be on every card.
 */
export const RECORD_MIN_RUN = 20

/**
 * The newest value's record, or null when it has none: the value before it is
 * as high and as low, the series is too short, or a gap in it makes "since"
 * unanswerable. Ties do not count: a reading that only matches an old high has
 * not passed it.
 */
export function seriesRecord(
  values: readonly number[],
  periods: readonly string[],
): SeriesRecord | null {
  const n = values.length
  const last = values[n - 1]
  if (n < 2 || periods.length !== n || typeof last !== 'number' || !Number.isFinite(last)) {
    return null
  }
  for (const extreme of ['high', 'low'] as const) {
    let i = n - 2
    for (; i >= 0; i -= 1) {
      const value = values[i]
      if (typeof value !== 'number' || !Number.isFinite(value)) return null
      if (extreme === 'high' ? value >= last : value <= last) break
    }
    const run = n - 2 - i
    if (run > 0) return { extreme, since: i >= 0 ? (periods[i] ?? null) : null, run }
  }
  return null
}

/** What a record is called: a price is `Highest`, traffic `Most ships`. */
export interface RecordWords {
  high: string
  low: string
}

export const PRICE_RECORD: RecordWords = { high: 'Highest', low: 'Lowest' }
export const TRAFFIC_RECORD: RecordWords = { high: 'Most ships', low: 'Fewest ships' }

const COUNT_WORDS = 'two three four five six seven eight nine ten eleven'.split(' ')

/** A span of days in the words a sentence gives it: `a month`, `three
 *  months`, `a year`, `two years`. Null under about a month. */
export function spanWords(days: number): string | null {
  const months = Math.round(days / 30.44)
  if (months < 1) return null
  if (months === 1) return 'a month'
  if (months < 12) return `${COUNT_WORDS[months - 2]} months`
  const years = Math.round(months / 12)
  return years === 1 ? 'a year' : `${COUNT_WORDS[years - 2] ?? years} years`
}

/**
 * The record as a card's one caption sentence: `Highest since Aug 12.`, or
 * `Lowest in three months.` where nothing on the chart is lower. Undefined
 * where there is no record, it has stood for less than `min` observations, or
 * the caller could not say how many days the series spans.
 *
 * No number: the reading is the line above it, and a second one beside a date
 * would be read as the level on that date.
 */
export function recordLine(
  values: readonly number[],
  periods: readonly string[],
  words: RecordWords = PRICE_RECORD,
  { min = RECORD_MIN_RUN, spanDays }: { min?: number; spanDays?: number | undefined } = {},
): string | undefined {
  const record = seriesRecord(values, periods)
  if (!record || record.run < min) return undefined
  const word = words[record.extreme]
  if (record.since) return `${word} since ${record.since}.`
  const span = spanDays === undefined ? null : spanWords(spanDays)
  return span ? `${word} in ${span}.` : undefined
}
