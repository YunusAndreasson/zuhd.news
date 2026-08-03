// The money block's time range: that a line covers the period its control names.
//
// The rail drew a fixed 30 *observations* for as long as it had sparklines, on
// a docblock arguing — correctly — that rows covering different periods are
// incomparable pictures set to one rhythm. The unit was the bug: thirty
// observations is thirty calendar days on the FX basket and about six weeks on
// an exchange trading five days in seven, so the rule the constant existed to
// enforce had never once held. Nothing could notice, because every row drew a
// line of the right shape over the wrong span.
//
// Every assertion below pins either that failure or one of the three the fix
// could introduce: a date reconstructed wrongly across a year boundary, a short
// series stretched to look long, and a two-point day drawn at an amplitude it
// has not got.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { bundleIsland, scratchDir } from './island-bundle.js'

const dir = scratchDir('map-markets')
const win = await import(
  await bundleIsland(dir, 'public/islands/_map/series-window.ts', 'window.mjs')
)
const spark = await import(await bundleIsland(dir, 'public/islands/_spark.ts', 'spark.mjs'))
const markets = await import(await bundleIsland(dir, 'public/islands/_map/markets.ts', 'mk.mjs'))

const { seriesDates, windowByDate, windowPoints, coverage, bucketCounts, halfOverHalf, DAY_MS } = win
const { sparkline } = spark
const { sparkInput } = markets

/** `["Jul 1", "Jul 2", …]` for `n` consecutive days ending on `asOf`. */
const dailyPeriods = (asOf, n) => {
  const end = Date.parse(`${asOf}T00:00:00Z`)
  const fmt = (ms) => {
    const d = new Date(ms)
    return `${d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })} ${d.getUTCDate()}`
  }
  return Array.from({ length: n }, (_, i) => fmt(end - (n - 1 - i) * DAY_MS))
}

const ramp = (n) => Array.from({ length: n }, (_, i) => 100 + i)

/** A DOM for the one assertion that goes through the renderer. */
function withDom(fn) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const keys = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'SVGElement']
  const saved = Object.fromEntries(keys.map((k) => [k, globalThis[k]]))
  for (const k of keys) globalThis[k] = dom.window[k] ?? dom.window
  globalThis.document = dom.window.document
  try {
    return fn()
  } finally {
    for (const k of keys) globalThis[k] = saved[k]
  }
}

// --- Dates -----------------------------------------------------------------

test('dates are reconstructed backwards from asOf', () => {
  const periods = ['Jul 25', 'Jul 26', 'Jul 27']
  const dates = seriesDates(periods, '2026-07-27')
  assert.deepEqual(dates, [
    Date.UTC(2026, 6, 25),
    Date.UTC(2026, 6, 26),
    Date.UTC(2026, 6, 27),
  ])
})

test('a December→January series keeps both years', () => {
  // The one case a label cannot state, and the reason the walk goes backwards
  // from the only end whose year is known.
  const dates = seriesDates(['Dec 30', 'Dec 31', 'Jan 1', 'Jan 2'], '2026-01-02')
  assert.deepEqual(dates, [
    Date.UTC(2025, 11, 30),
    Date.UTC(2025, 11, 31),
    Date.UTC(2026, 0, 1),
    Date.UTC(2026, 0, 2),
  ])
})

test('an unparseable label or a missing asOf is null, never a guess', () => {
  assert.equal(seriesDates(['Jul 25', 'week 3'], '2026-07-27'), null)
  assert.equal(seriesDates(['Jul 25', 'Jul 26'], undefined), null)
  assert.equal(seriesDates(undefined, '2026-07-27'), null)
})

test('a real dates array wins over the reconstruction', () => {
  const given = [1, 2]
  assert.deepEqual(seriesDates(['Jul 25', 'Jul 26'], '2026-07-27', given), given)
})

// --- Windowing -------------------------------------------------------------

test('a date window keeps exactly the days asked for', () => {
  const dates = seriesDates(dailyPeriods('2026-07-30', 30), '2026-07-30')
  const w = windowByDate(ramp(30), dates, Date.UTC(2026, 6, 30) - 7 * DAY_MS)
  assert.equal(w.values.length, 8, 'seven days back, inclusive of both ends')
  assert.equal(w.from, Date.UTC(2026, 6, 23))
  assert.equal(w.to, Date.UTC(2026, 6, 30))
})

test('a window narrower than the gap between observations still draws', () => {
  // A monthly-ish series asked for a week. Two points is the floor `seriesModel`
  // draws at, and "no data in this window" must not render as "no data".
  const dates = [Date.UTC(2026, 4, 1), Date.UTC(2026, 5, 1), Date.UTC(2026, 6, 1)]
  const w = windowByDate([1, 2, 3], dates, Date.UTC(2026, 6, 1) - 7 * DAY_MS)
  assert.equal(w.values.length, 2)
  assert.deepEqual(w.values, [2, 3])
})

test('windowPoints converts a range in days to the chart’s point count', () => {
  const periods = dailyPeriods('2026-07-30', 60)
  assert.equal(windowPoints(periods, '2026-07-30', 7), 8)
  assert.equal(windowPoints(periods, '2026-07-30', 30), 31)
  // Undateable series fall back to the chart's own word for "all of it".
  assert.equal(windowPoints(['week 1', 'week 2'], '2026-07-30', 7), 0)
})

// --- Coverage: a short series must not look long ---------------------------

test('a series that fills the window spans the whole box', () => {
  const to = Date.UTC(2026, 6, 30)
  assert.deepEqual(coverage(to - 90 * DAY_MS, to, to - 90 * DAY_MS), [0, 1])
})

test('a 30-day series in a 90-day window is drawn short', () => {
  const to = Date.UTC(2026, 6, 30)
  const from = to - 90 * DAY_MS
  const [x0, x1] = coverage(to - 30 * DAY_MS, to, from)
  assert.equal(x1, 1, 'it always ends at today')
  assert.ok(x0 > 0.6 && x0 < 0.7, `starts two thirds in, got ${x0}`)
})

test('the shortfall reaches the drawn polyline, which is the only visible sign', () => {
  const asOf = '2026-07-30'
  const short = { values: ramp(30), periods: dailyPeriods(asOf, 30), asOf, pct: 0.4 }
  const long = { values: ramp(90), periods: dailyPeriods(asOf, 90), asOf, pct: 0.4 }

  // Through the real `sparkline`, because `span` is only worth anything if it
  // survives the renormalisation into the spark's own box — an arithmetic
  // result that never reaches an `x` is the shortfall still being silent.
  const firstX = (member) =>
    withDom(() => {
      const input = sparkInput([member], 90)
      const s = sparkline({
        values: input.values,
        window: input.values.length,
        span: input.span,
        domain: input.domain,
      })
      const points = s.element.querySelector('polyline').getAttribute('points')
      return Number(points.split(' ')[0].split(',')[0])
    })

  const a = firstX(short)
  const b = firstX(long)
  // Not exactly 0: ninety daily points ending today cover eighty-nine days of a
  // ninety-day window, so the line starts 1.1% in. That is the arithmetic being
  // exact rather than approximately right, and it is a pixel.
  assert.ok(b < 2, `a series covering the window starts at the left edge, got ${b}`)
  assert.ok(a > 60, `a 30-day series in a 90-day window starts two thirds in, got ${a}`)
})

// --- The day step ----------------------------------------------------------

test('24h draws the day’s move as a slope, not an autoscaled diagonal', () => {
  const asOf = '2026-07-30'
  const calm = sparkInput(
    [{ values: ramp(30), periods: dailyPeriods(asOf, 30), asOf, pct: -0.02 }],
    1,
  )
  const violent = sparkInput(
    [{ values: ramp(30), periods: dailyPeriods(asOf, 30), asOf, pct: -2.9 }],
    1,
  )
  // Same fixed domain for both — which is the whole point. Autoscaled, these
  // two would be the same picture.
  assert.deepEqual(calm.domain, violent.domain)
  assert.ok(Math.abs(calm.values[1]) < Math.abs(violent.values[1]))
  assert.equal(calm.pct, -0.02, 'the printed figure is the real move')
})

test('24h clamps the drawing and never the figure', () => {
  const asOf = '2026-07-30'
  const huge = sparkInput(
    [{ values: ramp(30), periods: dailyPeriods(asOf, 30), asOf, pct: 41.2 }],
    1,
  )
  assert.equal(huge.pct, 41.2, 'the row still prints what happened')
  assert.equal(huge.values[1], huge.domain[1], 'the slope stops at the scale')
})

test('a group’s day move is the mean of its members', () => {
  const asOf = '2026-07-30'
  const member = (pct) => ({
    values: ramp(30),
    periods: dailyPeriods(asOf, 30),
    asOf,
    pct,
  })
  const input = sparkInput([member(1), member(-1), member(3)], 1)
  assert.equal(input.pct, 1)
})

// --- Chip trends: counts, not levels ---------------------------------------

test('a pile of times becomes a count per bucket, and strays are dropped', () => {
  const from = Date.UTC(2026, 6, 1)
  const to = from + 10 * DAY_MS
  const times = [from, from + DAY_MS, from + DAY_MS, to, from - DAY_MS, to + DAY_MS]
  const counts = bucketCounts(times, from, to, 10)
  assert.equal(counts.reduce((a, b) => a + b, 0), 4, 'the two outside the window are dropped')
  // Clamping them into the end buckets instead would pile them up as a spike at
  // whichever edge they fell past — a mark standing for data that is not there.
  assert.equal(counts[0], 1)
  assert.equal(counts[counts.length - 1], 1)
})

test('a count series is judged by halves, not by its last bucket', () => {
  // A rate, not a level. Last-against-first here is "the 11pm hour had three
  // and midnight had one, down 67%", which is noise wearing a percentage.
  assert.equal(halfOverHalf([1, 1, 1, 1, 2, 2, 2, 2]), 100)
  assert.equal(halfOverHalf([2, 2, 2, 2, 1, 1, 1, 1]), -50)
  // Flat overall, wild at the ends: last-against-first would call this −80%.
  assert.equal(halfOverHalf([5, 1, 1, 1, 1, 1, 1, 5]), 0)
})

test('a rise from nothing has no percentage', () => {
  // The bug this pins: GDACS holds ~16 days, so bucketed across a 30-day range
  // the fourteen it does not hold landed in the earlier half and the chip read
  // +911.1% — a real division over an absence, which is the most convincing
  // kind of wrong number. Blank is the honest answer; the line still has a
  // shape, and `coverage` still says it does not reach.
  assert.equal(halfOverHalf([0, 0, 0, 0, 3, 4, 5, 6]), null)
  assert.equal(halfOverHalf([1, 2]), null, 'too short to have halves')
})

// --- The invariant the old constant claimed and could not keep -------------

test('every row covers the same calendar window, whatever its cadence', () => {
  const asOf = '2026-07-30'
  // A daily calendar series (FX) and a five-in-seven session series (an
  // exchange). Thirty observations of these two are thirty days and six weeks;
  // thirty *days* of them is thirty days of both.
  const sessions = []
  for (let i = 0; sessions.length < 60; i++) {
    const d = new Date(Date.UTC(2026, 6, 30) - i * DAY_MS)
    const day = d.getUTCDay()
    if (day !== 0 && day !== 6) sessions.unshift(d.getTime())
  }
  const label = (ms) => {
    const d = new Date(ms)
    return `${d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })} ${d.getUTCDate()}`
  }

  const fx = seriesDates(dailyPeriods(asOf, 60), asOf)
  const ex = seriesDates(sessions.map(label), asOf)

  const from = Date.UTC(2026, 6, 30) - 30 * DAY_MS
  const wFx = windowByDate(ramp(60), fx, from)
  const wEx = windowByDate(ramp(sessions.length), ex, from)

  assert.notEqual(wFx.values.length, wEx.values.length, 'different point counts…')
  assert.ok(wFx.from >= from && wEx.from >= from, '…over the same window')
  assert.ok(
    Math.abs(wFx.from - wEx.from) <= 3 * DAY_MS,
    'both start within a weekend of the window edge',
  )
})

test('one gappy member does not decide the shape of thirty', () => {
  // Measured, not hypothetical: Tadawul, DFM, SET and PSE publish series with
  // multi-week holes, so inside a 7-day window they hold one observation
  // against a median of six — and `meanIndex` takes the *shortest* member. The
  // world's thirty equity indices drew as a two-point straight line: a clean
  // trend sourced from the one member least able to support it.
  const asOf = '2026-07-30'
  const full = () => ({ values: ramp(40), periods: dailyPeriods(asOf, 40), asOf, pct: 0.1 })
  const gappy = {
    // Ends today, but its previous observation is three weeks back.
    values: [10, 11],
    periods: ['Jul 9', 'Jul 30'],
    asOf,
    pct: 0.1,
  }

  const withGap = sparkInput([full(), full(), full(), gappy], 7)
  assert.ok(withGap.values.length > 2, `the gappy member is set aside, got ${withGap.values.length}`)
  assert.deepEqual(withGap.members, { drawn: 3, total: 4 }, 'and the row can say so')

  // The filter must never empty its own input: a row where *every* member is
  // gappy still draws, from all of them.
  const allGappy = sparkInput([gappy, { ...gappy }], 7)
  assert.deepEqual(allGappy.members, { drawn: 2, total: 2 })
})

test('a full membership reports itself as one, so the label stays quiet', () => {
  const asOf = '2026-07-30'
  const member = () => ({ values: ramp(40), periods: dailyPeriods(asOf, 40), asOf, pct: 0.1 })
  const input = sparkInput([member(), member()], 30)
  assert.deepEqual(input.members, { drawn: 2, total: 2 })
})

test('a member with unreadable dates falls the whole row back, never half of it', () => {
  const asOf = '2026-07-30'
  const good = { values: ramp(40), periods: dailyPeriods(asOf, 40), asOf, pct: 0.1 }
  const bad = { values: ramp(40), periods: Array(40).fill('week 3'), asOf, pct: 0.1 }
  const mixed = sparkInput([good, bad], 30)
  assert.deepEqual(mixed.span, [0, 1], 'the count window spans the box')
  assert.equal(mixed.pct, null, 'and the figure comes off the drawn line')
})
