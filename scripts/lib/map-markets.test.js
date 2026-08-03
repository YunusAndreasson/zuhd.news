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
const { sparkInput, oddsEntries, attentionEntries, nextRelease, ribbonPoints } = markets

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

/**
 * The instant every fixture is read at, and it has to be stated.
 *
 * These tests used to pass `sparkInput` a series and a number of days and
 * nothing else, because the window's right edge came from the data — so the
 * fixtures were, by construction, always current. That is the bug the suite
 * exists to pin, sitting inside the suite: a series dated July was tested as
 * though it were today's, on any day the tests happened to run.
 *
 * With the edge taken from the rail, a fixture has a *date relative to now* and
 * every assertion about a window has to say what now is or drift into failing
 * the day after it was written.
 */
const NOW = Date.UTC(2026, 6, 30)

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
      const input = sparkInput([member], 90, NOW)
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

// --- The two marks ---------------------------------------------------------

test('a level draws a line with weight under it and a dot on the latest', () => {
  withDom(() => {
    const s = sparkline({ values: [10, 12, 11, 15], window: 4 })
    const kids = [...s.element.children].map((c) => c.getAttribute('class') ?? c.tagName)
    assert.deepEqual(kids, ['defs', 'spark-area', 'spark-line', 'spark-dot'])
    // The dot is a zero-length stroke, never a <circle>: the box is scaled
    // non-uniformly, so a circle would render as an ellipse whose shape depends
    // on how wide the rail happens to be — the exact failure
    // `preserveAspectRatio: none` is banned for everywhere else.
    const dot = s.element.querySelector('.spark-dot')
    assert.equal(dot.tagName.toLowerCase(), 'line')
    assert.equal(dot.getAttribute('x1'), dot.getAttribute('x2'))
    assert.equal(dot.getAttribute('y1'), dot.getAttribute('y2'))
    assert.equal(s.element.querySelector('circle'), null, 'no circle may enter this box')
  })
})

test('each fill gradient gets its own id, or every row wears one hue', () => {
  withDom(() => {
    // An `id` is document-scoped even inside its own `<svg>`, so thirteen
    // sparks sharing one would all resolve to whichever parsed last — and the
    // rail would draw every line's fill in the first row's colour.
    const ids = [1, 2, 3].map(() => {
      const s = sparkline({ values: [1, 2, 3], window: 3 })
      return s.element.querySelector('defs > *').id
    })
    assert.equal(new Set(ids).size, 3, `ids must differ, got ${ids.join()}`)
    for (const id of ids) assert.match(id, /^spark-fill-\d+$/)
  })
})

test('a count draws bars, one per bucket, standing on the floor', () => {
  withDom(() => {
    const counts = [3, 0, 5, 2]
    const s = sparkline({ values: counts, window: 4, shape: 'bars', domain: [0, 5] })
    const bars = [...s.element.querySelectorAll('.spark-bar')]
    assert.equal(bars.length, counts.length, 'one bar per bucket')
    assert.equal(s.element.querySelector('.spark-line'), null, 'a count is not a level')
    // Nothing connects one bucket to the next, so an empty one is still drawn:
    // zero stories in an hour is an observation, and a gap in the run reads as
    // a bucket that was never measured.
    const heights = bars.map((b) => Number(b.getAttribute('height')))
    assert.ok(heights.every((h) => h > 0), 'even an empty bucket marks itself')
    const tops = bars.map((b) => Number(b.getAttribute('y')))
    assert.ok(tops[2] < tops[0] && tops[0] < tops[1], 'taller count, higher bar')
  })
})

// --- The day step ----------------------------------------------------------

test('24h draws the day’s move as a slope, not an autoscaled diagonal', () => {
  const asOf = '2026-07-30'
  const calm = sparkInput(
    [{ values: ramp(30), periods: dailyPeriods(asOf, 30), asOf, pct: -0.02 }],
    1,
    NOW,
  )
  const violent = sparkInput(
    [{ values: ramp(30), periods: dailyPeriods(asOf, 30), asOf, pct: -2.9 }],
    1,
    NOW,
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
    NOW,
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
  const input = sparkInput([member(1), member(-1), member(3)], 1, NOW)
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

  const withGap = sparkInput([full(), full(), full(), gappy], 7, NOW)
  assert.ok(withGap.values.length > 2, `the gappy member is set aside, got ${withGap.values.length}`)
  assert.deepEqual(withGap.members, { drawn: 3, total: 4 }, 'and the row can say so')

  // Two members holding one observation each inside a seven-day window, and the
  // answer changed when the window gained a right edge.
  //
  // The completeness filter's own rule is unchanged and still right — it must
  // never empty its own input, so a row where every member is *relatively* gappy
  // draws from all of them. What runs before it now is a different question:
  // does the window contain a **segment** of this series at all. One point is
  // not a segment, and `windowByDate`'s two-point floor would answer it by
  // reaching back to Jul 9 — three weeks outside a seven-day window — and
  // labelling that as the week. That is the `brent`-at-7d bug measured on the
  // real payload, so the honest reply is no line, and the row prints its age
  // instead.
  assert.equal(sparkInput([gappy, { ...gappy }], 7, NOW), null)
  // …and the same two members over a window wide enough to hold them do draw,
  // which is what keeps the rule above about coverage rather than about gaps.
  assert.deepEqual(sparkInput([gappy, { ...gappy }], 30, NOW).members, { drawn: 2, total: 2 })
})

test('a full membership reports itself as one, so the label stays quiet', () => {
  const asOf = '2026-07-30'
  const member = () => ({ values: ramp(40), periods: dailyPeriods(asOf, 40), asOf, pct: 0.1 })
  const input = sparkInput([member(), member()], 30, NOW)
  assert.deepEqual(input.members, { drawn: 2, total: 2 })
})

test('a member with unreadable dates falls the whole row back, never half of it', () => {
  const asOf = '2026-07-30'
  const good = { values: ramp(40), periods: dailyPeriods(asOf, 40), asOf, pct: 0.1 }
  const bad = { values: ramp(40), periods: Array(40).fill('week 3'), asOf, pct: 0.1 }
  const mixed = sparkInput([good, bad], 30, NOW)
  assert.deepEqual(mixed.span, [0, 1], 'the count window spans the box')
  assert.equal(mixed.pct, null, 'and the figure comes off the drawn line')
})

// --- The other edge: one window end for the whole column -------------------
//
// The calendar window fixed rows of different *lengths* and left rows of
// different *ends*, because `sparkInput` took the right edge from the data:
// every row ran to its own last observation and every line therefore finished
// flush against the same column whatever period it covered. Measured on the
// 2026-08-03 payload, `brent` was seven days stale and `vix` four beside a
// currency basket published that morning, in one column under one control.

test('the window ends where the rail is, not where the data stops', () => {
  const stale = {
    values: ramp(60),
    periods: dailyPeriods('2026-07-23', 60),
    asOf: '2026-07-23',
    pct: 0.1,
  }
  const current = {
    values: ramp(60),
    periods: dailyPeriods('2026-07-30', 60),
    asOf: '2026-07-30',
    pct: 0.1,
  }
  const a = sparkInput([stale], 30, NOW)
  const b = sparkInput([current], 30, NOW)
  assert.equal(b.span[1], 1, 'a current series reaches the right edge')
  assert.ok(a.span[1] < 0.8, `a week-old series stops short of it, got ${a.span[1]}`)
  // The bug in one line: taken from the data, both of these ended at 1.
  assert.notEqual(a.span[1], b.span[1])
})

test('a series with no observation in the window draws nothing at all', () => {
  // Not a line squeezed against the boundary. `brent` at the 7d step held one
  // point exactly on the window's left edge, `windowByDate`'s two-point floor
  // pulled in the one before it, and the row drew a 3px line in a 61px box
  // captioned −8.5% — the Jul 24→27 move, labelled as the week.
  const brentish = {
    values: ramp(60),
    periods: dailyPeriods('2026-07-23', 60),
    asOf: '2026-07-23',
    pct: -8.46,
  }
  assert.equal(sparkInput([brentish], 7, NOW), null)
  assert.equal(sparkInput([brentish], 1, NOW), null, 'and it has no answer for today')
  assert.ok(sparkInput([brentish], 30, NOW), 'but a month is a window it can speak to')
})

test('a weekend does not disqualify a Friday close from being today’s move', () => {
  // The day step's gate has to tolerate the calendar or, on a Monday, every
  // exchange on earth is dropped for being shut — the freshest close that
  // exists is Friday's, and a row that empties because the market was closed is
  // a row punishing the reader for the weekend.
  const monday = Date.UTC(2026, 7, 3)
  const friday = {
    values: ramp(40),
    periods: dailyPeriods('2026-07-31', 40),
    asOf: '2026-07-31',
    pct: 0.42,
  }
  const input = sparkInput([friday], 1, monday)
  assert.ok(input, 'the Friday close still answers')
  assert.equal(input.pct, 0.42)
})

test('coverage stops short at whichever end the data does', () => {
  const to = Date.UTC(2026, 6, 30)
  const from = to - 90 * DAY_MS
  // Ends a fortnight ago: the line occupies neither the left nor the right end.
  const [x0, x1] = coverage(to - 45 * DAY_MS, to - 14 * DAY_MS, from, to)
  assert.ok(x0 > 0.4 && x0 < 0.6, `starts about half way, got ${x0}`)
  assert.ok(x1 > 0.8 && x1 < 0.9, `and stops before the edge, got ${x1}`)
  // The floor: an end clamped below its own start would hand `_spark.ts` a
  // zero-width box, which renders as nothing and reads as no data.
  const [y0, y1] = coverage(to, to, from, to + 1000 * DAY_MS)
  assert.ok(y1 > y0, 'a degenerate window still leaves a sliver to draw in')
})

// --- Units: a percentage of a percentage is an error of kind ---------------

test('a percent-quoted series reports its change in points', () => {
  const asOf = '2026-07-30'
  // A probability going 20 → 25 moved five points. `+25.0%` beside a level
  // reading 25% is two numbers that cannot both be about the same thing — and
  // `us-10y` was already making the smaller version of the same mistake, a
  // yield moving eight basis points printed as +1.7%.
  const market = {
    values: [20, 21, 22, 23, 24, 25],
    periods: dailyPeriods(asOf, 6),
    asOf,
    pct: 4.2,
  }
  const input = sparkInput([market], 7, NOW)
  assert.deepEqual(input.ends, [20, 25], 'the raw ends of exactly what is drawn')
  assert.equal(ribbonPoints(input.ends[1] - input.ends[0]), '+5 pts')
  assert.equal(ribbonPoints(0.08), '+0.08 pts', 'and a yield keeps its precision')
  assert.equal(ribbonPoints(0.001), '0 pts', 'a move that rounds to nothing claims no direction')
})

test('a composite has no ends, because “its units” is not a thing that exists', () => {
  const asOf = '2026-07-30'
  const member = () => ({ values: ramp(40), periods: dailyPeriods(asOf, 40), asOf, pct: 0.1 })
  // `meanIndex` rebases to 100, so a difference across `values` would be a
  // percentage wearing the units of an index.
  assert.equal(sparkInput([member(), member()], 30, NOW).ends, undefined)
})

// --- Selection: a rule over the payload, not a table of ids ----------------
//
// `trends-sources/polymarket.js` fetches the top twenty markets by 24-hour
// volume and emits `poly-<slug>` with no registry entry, so the ids rotate as
// attention does. A `WORLD`-style catalog would have gone quietly blank the
// first week a question closed.

const poly = (id, label, values) => ({
  id,
  label,
  source: 'polymarket',
  cadence: 'daily',
  unit: '%',
  values,
  periods: dailyPeriods('2026-07-30', values.length),
  asOf: '2026-07-30',
  sourceLabel: 'Polymarket',
})

const steady = (n, from, to) =>
  Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1))

test('the odds block takes the biggest movers, by points, up to the cap', () => {
  const rows = oddsEntries(
    [
      poly('poly-a', 'Will the A happen?', steady(20, 10, 40)),
      poly('poly-b', 'Will the B happen?', steady(20, 50, 51)),
      poly('poly-c', 'Will the C happen?', steady(20, 80, 60)),
      poly('poly-d', 'Will the D happen?', steady(20, 30, 35)),
    ],
    30,
    NOW,
  )
  // Ranked by |change| over the window: a +30, c −20, d +5, b +1. The cap is
  // `BLOCK_ROWS`, five since the categories and the layers left the rail, so all
  // four fit here and the ordering is the whole of what this pins.
  assert.deepEqual(
    rows.map((r) => r.id),
    ['poly-a', 'poly-c', 'poly-d', 'poly-b'],
    'ranked on the size of the move, not the level',
  )
  assert.ok(rows.length <= 5, 'and capped, so the rail keeps its controls on screen')
})

test('a young market cannot win the block by being young', () => {
  // Polymarket publishes a question from the day it opens, so the payload
  // carries a seven-point series beside a thirty-two-point one. Ranked on
  // change, a market whose whole history *is* the move that created it wins
  // almost by construction.
  const rows = oddsEntries(
    [
      poly('poly-new', 'Will the new thing happen?', steady(7, 5, 95)),
      poly('poly-old', 'Will the old thing happen?', steady(20, 40, 50)),
    ],
    30,
    NOW,
  )
  assert.deepEqual(rows.map((r) => r.id), ['poly-old'])
})

test('selection is deterministic, so a redraw cannot reshuffle the block', () => {
  const tie = [
    poly('poly-z', 'Will Z happen?', steady(20, 10, 20)),
    poly('poly-a', 'Will A happen?', steady(20, 40, 50)),
  ]
  const once = oddsEntries(tie, 30, NOW).map((r) => r.id)
  const twice = oddsEntries([...tie].reverse(), 30, NOW).map((r) => r.id)
  assert.deepEqual(once, twice, 'ties break on id, not on payload order')
})

test('the question keeps its horizon and loses only what carries nothing', () => {
  const rows = oddsEntries(
    [
      poly('poly-1', 'Will the U.S. invade Iran before 2027?', steady(20, 10, 30)),
      poly('poly-2', 'US-Iran Nuclear Deal by Aug 31, 2026?', steady(20, 40, 10)),
      poly('poly-3', 'Fed raises rates 25 bps after Sept 2026?', steady(20, 20, 60)),
    ],
    30,
    NOW,
  )
  const byId = Object.fromEntries(rows.map((r) => [r.id, r.label]))
  // A probability without a date is not a shorter statement of the same claim,
  // it is a different and unanswerable one.
  assert.equal(byId['poly-1'], 'U.S. invade Iran before 2027')
  assert.equal(byId['poly-2'], 'US-Iran Nuclear Deal by Aug 31')
  assert.equal(byId['poly-3'], 'Fed raises rates 25 bps after Sept 2026')
  assert.ok(rows.every((r) => r.note.includes('not a forecast')), 'and every row says what it is')
})

test('attention has no answer at the day step', () => {
  // Pageviews are strongly day-of-week seasonal, so yesterday against the day
  // before is mostly the calendar — a real number measuring the weekend.
  const wiki = (id, values) => ({
    id,
    label: `${id} — Wikipedia views`,
    source: 'wikipedia',
    cadence: 'daily',
    unit: 'views/day',
    values,
    periods: dailyPeriods('2026-07-30', values.length),
    asOf: '2026-07-30',
    sourceLabel: 'Wikipedia pageviews',
  })
  const feed = [wiki('Iran', steady(20, 100, 400)), wiki('Ukraine', steady(20, 900, 300))]
  assert.deepEqual(attentionEntries(feed, 1, NOW), [])
  const week = attentionEntries(feed, 7, NOW)
  assert.equal(week.length, 2)
  assert.equal(week[0].label, 'Ukraine', 'ranked as a percentage, since views have no fixed scale')
})

// --- The release calendar --------------------------------------------------

test('the next release is the nearest one a reader would recognise', () => {
  const calendar = [
    // FRED's nearest entry is usually plumbing: a weekly Fed balance-sheet
    // statement, forty-three characters of jargon where a fact should be.
    { date: '2026-08-04', release: 'H.4.1 Factors Affecting Reserve Balances' },
    { date: '2026-08-07', release: 'Employment Situation' },
    { date: '2026-08-12', release: 'Consumer Price Index' },
  ]
  assert.deepEqual(nextRelease(calendar, Date.UTC(2026, 7, 3)), {
    label: 'US jobs',
    date: '2026-08-07',
  })
  // Past entries are skipped, and a release published today still counts as
  // next — it lands at 8:30 Eastern and the rail may be read before that.
  assert.deepEqual(nextRelease(calendar, Date.UTC(2026, 7, 7)), {
    label: 'US jobs',
    date: '2026-08-07',
  })
  assert.equal(nextRelease(calendar, Date.UTC(2026, 7, 20)), null, 'and the line simply goes')
})

test('the research CPI is not the CPI', () => {
  // FRED publishes both. `^` anchors the price indices, because a
  // methodological series is not the print anyone is waiting for.
  assert.equal(
    nextRelease(
      [{ date: '2026-08-12', release: 'Research Consumer Price Index' }],
      Date.UTC(2026, 7, 3),
    ),
    null,
  )
})
