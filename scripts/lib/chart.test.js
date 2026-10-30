// The series chart: that there is one of it, and that it tells the truth.
//
// This repo had three implementations of the same thirty lines of geometry and
// they had drifted into three different charts — one with a y-axis, a rule and
// a tint, two with a line and two dots, and a `preserveAspectRatio="none"` that
// was diagnosed and removed in two of them and left in the third for the whole
// of its life. Every assertion here pins one of the failures that produced, or
// one the interactive layer introduced and the range control exposed.
//
// Two things are checked side by side throughout: the model (`@shared/chart/
// series`, pure) and the browser chart (`public/islands/_chart.ts`, bundled and
// driven against jsdom). A chart that is correct in the abstract and wrong in
// the document is the exact failure mode this file exists to stop.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bundleIsland, scratchDir } from './island-bundle.js'

const ROOT = new URL('../..', import.meta.url).pathname
const dir = scratchDir('chart')
const bundle = (entry, out) => bundleIsland(dir, entry, out)

const series = await import(await bundle('shared/chart/series.ts', 'series.mjs'))
const rankMod = await import(await bundle('shared/chart/rank-strip.ts', 'rank.mjs'))
const chartPath = await bundle('public/islands/_chart.ts', 'chart.mjs')

const { seriesModel, staticFigure, renderMarkup, rangeOptions, chartDescription } = series

/** A DOM the chart can be built into. jsdom needs no `<dialog>` here. */
function withDom(fn) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://zuhd.news/',
  })
  const g = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'SVGElement', 'KeyboardEvent']
  const saved = Object.fromEntries(g.map((k) => [k, globalThis[k]]))
  for (const k of g) globalThis[k] = dom.window[k] ?? dom.window
  globalThis.document = dom.window.document
  globalThis.navigator ??= dom.window.navigator
  try {
    return fn(dom.window)
  } finally {
    for (const k of g) globalThis[k] = saved[k]
  }
}

// A quarter of daily closes that FALL overall but RISE over the last stretch.
// The shape is the one the range control has to get right: a chart of the whole
// thing is a decline, and a chart of the tail is a rally.
const N = 80
const FALL_THEN_RISE = Array.from({ length: N }, (_, i) =>
  i < 50 ? 120 - i * 1.2 : 60 + (i - 50) * 0.9,
)
const PERIODS = Array.from({ length: N }, (_, i) => `d${i + 1}`)

const baseOpts = {
  values: FALL_THEN_RISE,
  periods: PERIODS,
  reference: 'open',
  referenceLabel: 'the window’s open',
  direction: 'window',
  palette: 'signed',
  step: 'sessions',
  label: 'Test index',
}

// --- 1. One chart, three surfaces -----------------------------------------

test('the static figure and the browser chart draw the same geometry', async () => {
  const model = seriesModel(baseOpts)
  const fromModel = model
    .scene()
    .filter((n) => n.tag === 'polyline')
    .map((n) => n.attrs.points)

  const { createChart } = await import(chartPath)
  const inDom = withDom(() => {
    const chart = createChart({ ...baseOpts })
    return [...chart.element.querySelectorAll('.chart-line')].map((n) => n.getAttribute('points'))
  })

  assert.deepEqual(
    inDom,
    fromModel,
    'the DOM renderer and the string renderer are adapters over one geometry, ' +
      'not two implementations that happen to agree',
  )
  assert.ok(fromModel[0].length > 100, 'the line actually has points')
})

test('no surface stretches the chart', () => {
  // `preserveAspectRatio="none"` against a fixed viewBox is a non-uniform
  // scale, and everything that is not the line pays for it: the axis labels
  // come out wide for their height and every dot is drawn as an ellipse. It
  // was found and removed twice and survived in `entity-pages.js` — on the one
  // page whose entire subject is a chart — because there were three copies.
  const html = renderMarkup(staticFigure(seriesModel(baseOpts), { caption: 'x' }))
  assert.match(html, /preserveAspectRatio="xMidYMid meet"/)
  assert.doesNotMatch(html, /preserveAspectRatio="none"/)

  const chartSrc = readFileSync(join(ROOT, 'public/islands/_chart.ts'), 'utf8')
  assert.doesNotMatch(chartSrc, /preserveAspectRatio:\s*'none'/)
})

test('colour is a class, never a literal', () => {
  // `colour-system.test.js` bans literals in the stylesheet; a chart that
  // inlined `stroke="#c08a6a"` would route straight around it. Every mark here
  // takes its colour from `currentColor` on a classed element.
  const html = renderMarkup(staticFigure(seriesModel(baseOpts), {}))
  assert.doesNotMatch(html, /#[0-9a-fA-F]{3,8}\b/, 'no hex in the emitted chart')
  assert.doesNotMatch(html, /\b(?:rgb|hsl|oklch)\(/, 'no colour function either')
})

// --- 2. The range control moves what the chart means ----------------------

test('the reference follows the drawn window, not the source series', () => {
  const all = seriesModel(baseOpts)
  const short = seriesModel({ ...baseOpts, window: 20 })

  assert.equal(all.reference, FALL_THEN_RISE[0], 'over everything, the rule is the first close')
  assert.equal(
    short.reference,
    FALL_THEN_RISE[N - 20],
    'narrowed, the rule is the first close *of what is drawn*',
  )
  // The bug this pins: with the reference pinned to the source series the rule
  // sat at 120 while the drawn window spanned 60–87 — outside its own domain,
  // squashing the data into the bottom third, under a caption still claiming
  // it marked "the window's open". Nothing throws; a rule off the top of the
  // data still looks exactly like a rule.
  assert.ok(
    short.reference >= short.lo && short.reference <= short.hi,
    'the rule is inside the domain it is drawn in',
  )
  assert.ok(short.referenceY != null, 'and is therefore actually drawn')
})

test('the tint turns around with the range', () => {
  // The series falls over the quarter and rises over the last twenty. A chart
  // of the tail drawn in the decline's colour is the chart contradicting its
  // own line.
  assert.equal(seriesModel(baseOpts).tone, 'is-neg')
  assert.equal(seriesModel({ ...baseOpts, window: 20 }).tone, 'is-pos')
})

test('an external reference is not recomputed', () => {
  // A chokepoint's 90-day baseline is published. It must stay put when the
  // reader narrows to 30 days — that is the whole point of drawing it.
  const opts = { ...baseOpts, reference: 100, direction: 0.2 }
  assert.equal(seriesModel(opts).reference, 100)
  assert.equal(seriesModel({ ...opts, window: 20 }).reference, 100)
})

test('a fixed domain replaces the scale and nothing else', () => {
  // What the money rail's 24h step needs: two points whose *magnitude* is the
  // fact. Autoscaled they are a full-height diagonal whatever they are, so a
  // −0.02% day and a −2.9% day draw identically.
  const at = (values, domain) => {
    const m = seriesModel({ values, domain })
    return m.points[1].y - m.points[0].y
  }
  const calm = at([0, -0.02], [-3, 3])
  const violent = at([0, -2.9], [-3, 3])
  assert.ok(Math.abs(calm) < Math.abs(violent) / 10, 'the slope carries the magnitude')
  assert.ok(Math.abs(at([0, -0.02], undefined)) > Math.abs(calm), 'autoscaled, it would not')

  // The observations still own the axis: a domain widened past the data must
  // not put a number on the gutter that nobody reported.
  const m = seriesModel({ values: [10, 20], domain: [0, 100] })
  assert.equal(m.lo, 0)
  assert.equal(m.hi, 100)
  assert.equal(m.peak.value, 20)
  assert.equal(m.trough.value, 10)

  // A domain that is not one is ignored rather than obeyed into a broken chart.
  for (const bad of [[3, -3], [Number.NaN, 3], [1, 1]]) {
    const fell = seriesModel({ values: [10, 20], domain: bad })
    assert.equal(fell.lo, 10, `${JSON.stringify(bad)} falls back to autoscale`)
    assert.equal(fell.hi, 20)
  }
})

test('a range is only offered when it would change the chart', () => {
  assert.deepEqual(rangeOptions(20), [], 'nothing to choose between')
  assert.deepEqual(rangeOptions(86), [30, 0])
  assert.deepEqual(rangeOptions(200), [30, 90, 180, 0])
  for (const n of rangeOptions(45)) {
    assert.ok(n === 0 || n <= 35, `a ${n}-point window of a 45-point series is the same chart`)
  }
})

// --- 3. The numbers behind the picture ------------------------------------

test('the table prints what the source published, not what the axis rounds to', () => {
  // Brent peaked at 124.24 the day after closing at 124.16. The axis rounds to
  // one decimal above 100, which is right for a scale label — and when the
  // table borrowed that precision it printed `124.2` twice and put the word
  // "high" beside the second one. A row marked as the maximum whose number
  // equals the row above it reads as a broken chart, in the one place whose
  // entire job is letting a reader check the picture.
  const values = [113.89, 117.62, 124.16, 124.24, 118.26]
  const model = seriesModel({ values, periods: ['a', 'b', 'c', 'd', 'e'] })
  assert.equal(model.format(124.24), '124.2', 'the axis stays terse')
  assert.equal(model.formatExact(124.24), '124.24', 'the table does not')

  const html = renderMarkup(staticFigure(model, {}))
  assert.match(html, /124\.16/)
  assert.match(html, /124\.24/)
  const peakRow = html.match(/<tr class="[^"]*is-peak[^"]*">.*?<\/tr>/)?.[0]
  assert.ok(peakRow, 'the peak row is marked')
  assert.match(peakRow, /124\.24/, 'and carries the value that made it the peak')
  assert.match(peakRow, />high</, 'named in a word — this typeface has no triangle')
})

test('a gap is a row, not a missing row', () => {
  // PortWatch and Yahoo both publish holes. A table that dropped them would
  // make a fortnight look like it had fewer days in it.
  const values = [10, Number.NaN, 12, 14]
  const model = seriesModel({ values, periods: ['a', 'b', 'c', 'd'] })
  assert.equal(model.points.length, 3, 'the line skips the gap')
  const html = renderMarkup(staticFigure(model, {}))
  const rows = html.match(/<tr[^>]*>/g) ?? []
  assert.equal(rows.length, 5, 'four observations and one header row')
  assert.match(html, /—/, 'the gap is stated')
})

test('a period label cannot write markup into the page', () => {
  const model = seriesModel({
    values: [1, 2, 3],
    periods: ['<script>x</script>', 'b&c', '"quoted"'],
    label: '</svg><img onerror=alert(1)>',
  })
  const html = renderMarkup(staticFigure(model, { caption: '<b>no</b>' }))
  assert.doesNotMatch(html, /<script>/)
  assert.doesNotMatch(html, /<img/)
  assert.doesNotMatch(html, /<b>no<\/b>/)
  assert.match(html, /&lt;script&gt;/)
})

// --- 4. What a reader who cannot see it is told ---------------------------

test('the description names what is drawn, not what was passed in', () => {
  // Callers used to append the count themselves, so a 30-session view of an
  // 80-session series announced itself as "Test index over 80 observations.
  // 30 sessions." — a label contradicting itself in one breath, and only for
  // the readers with no way to check it against the picture.
  const d = chartDescription(seriesModel({ ...baseOpts, window: 20 }), true)
  assert.match(d, /20 sessions/)
  // Not a bare /80/: the period labels are `d1`…`d80`, and the description
  // legitimately names the latest one. What must not appear is the source
  // series' length presented as the chart's.
  assert.doesNotMatch(d, /80 sessions|80 observations/)
  assert.match(d, /arrow keys/, 'and says how to read individual values')

  const staticD = chartDescription(seriesModel(baseOpts), false)
  assert.match(staticD, /table below/, 'with no script, the table is the route in')
  assert.doesNotMatch(staticD, /arrow keys/, 'and the cursor is not offered')
})

test('the numbers are reachable without a script', () => {
  // `<details>` and `<table>` need no JavaScript. The static page is not a
  // degraded chart — it is the same chart minus the affordances that would be
  // inert anyway.
  const html = renderMarkup(staticFigure(seriesModel(baseOpts), { caption: 'x' }))
  assert.match(html, /<details class="chart-data">/)
  assert.match(html, /<table class="chart-table">/)
  assert.equal((html.match(/<tr/g) ?? []).length, N + 1, 'every observation, plus the header')
  assert.doesNotMatch(html, /chart-range/, 'no range buttons — they would do nothing')
  assert.doesNotMatch(html, /chart-copy/, 'and no clipboard button')
})

// --- 5. The browser chart -------------------------------------------------

test('the keyboard walks the series and the readout follows', async () => {
  const { createChart } = await import(chartPath)
  const out = withDom((win) => {
    const chart = createChart({ ...baseOpts })
    win.document.body.append(chart.element)
    const plot = chart.element.querySelector('.chart-plot')
    const readout = chart.element.querySelector('.chart-readout')
    const key = (k) =>
      plot.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true }))

    const rest = readout.textContent
    key('Home')
    const first = readout.textContent
    key('ArrowRight')
    const second = readout.textContent
    key('End')
    const last = readout.textContent
    key('Escape')
    const cleared = readout.textContent

    return {
      rest,
      first,
      second,
      last,
      cleared,
      focusable: plot.tabIndex,
      described: plot.getAttribute('aria-describedby') === readout.id,
      live: readout.getAttribute('aria-live'),
    }
  })

  assert.equal(out.focusable, 0, 'the plot is reachable by keyboard')
  assert.ok(out.described, 'and points at the line that answers for it')
  assert.equal(out.live, 'polite', 'which is announced as it changes')
  assert.match(out.first, /^d1 · /, 'Home is the first observation')
  assert.match(out.second, /^d2 · /, 'and the arrow steps one')
  assert.match(out.last, /^d80 · /, 'End is the last')
  assert.equal(out.cleared, out.rest, 'Escape returns to the resting readout')
  assert.match(out.rest, /^d80 · /, 'which names the latest point — date and all')
})

test('a pressed range keeps the keyboard focus through the redraw', async () => {
  const { createChart } = await import(chartPath)
  const out = withDom((window) => {
    const chart = createChart({ ...baseOpts })
    window.document.body.append(chart.element)
    const range = (text) =>
      [...chart.element.querySelectorAll('.chart-range')].find((b) => b.textContent === text)
    range('30').focus()
    range('30').click()
    const kept = window.document.activeElement === range('30')
    const other = window.document.createElement('button')
    window.document.body.append(other)
    other.focus()
    chart.update({ ...baseOpts })
    return { kept, untouched: window.document.activeElement === other }
  })
  assert.equal(out.kept, true, 'the focus is on the new button, not on <body>')
  assert.equal(out.untouched, true, 'a redraw takes no focus that was elsewhere')
})

test('the range control rebuilds the chart it labels', async () => {
  const { createChart } = await import(chartPath)
  const out = withDom(() => {
    const chart = createChart({ ...baseOpts })
    const el = chart.element
    const btn = [...el.querySelectorAll('.chart-range')].find((b) => b.textContent === '30')
    const before = {
      tone: el.className,
      count: el.querySelector('.chart-data-count').textContent,
      dates: [...el.querySelectorAll('.chart-date')].map((t) => t.textContent),
    }
    btn.click()
    return {
      before,
      after: {
        tone: el.className,
        count: el.querySelector('.chart-data-count').textContent,
        dates: [...el.querySelectorAll('.chart-date')].map((t) => t.textContent),
        pressed: [...el.querySelectorAll('.chart-range')].map((b) => b.getAttribute('aria-pressed')),
      },
      keptClass: el.classList.contains('chart'),
    }
  })

  assert.equal(out.before.count, String(N))
  assert.equal(out.after.count, '30')
  assert.notDeepEqual(out.after.dates, out.before.dates, 'the axis reprints its own ends')
  assert.deepEqual(out.after.pressed, ['true', 'false'])
  // The tone class is written to `className` wholesale on every rebuild, which
  // is how a caller's own class got dropped on the first press.
  assert.ok(out.keptClass)
  assert.ok(out.before.tone.includes('is-neg') && out.after.tone.includes('is-pos'))
})

test('a series too short to have a shape draws nothing at all', async () => {
  const { createChart } = await import(chartPath)
  assert.equal(seriesModel({ values: [42] }).ok, false)
  assert.equal(staticFigure(seriesModel({ values: [42] }), {}), null, 'and so does the string one')
  assert.equal(renderMarkup(staticFigure(seriesModel({ values: [42] }), {})), '')
  withDom(() => {
    assert.equal(createChart({ values: [42], periods: ['a'] }), null, 'the caller renders nothing')
  })
})

test('a cited story is a mark on the model’s own scale, in both figures and in the table', async () => {
  // An annotation, not a second shape: it sits on an observation the line
  // already draws, follows the range control because it is resolved against
  // the window, and is dropped rather than pinned to an edge when the window
  // no longer holds its day.
  const values = Array.from({ length: 30 }, (_, i) => 100 + i)
  const periods = values.map((_, i) => `d${i}`)
  const marks = [
    { index: 5, label: '1' },
    { index: 25, label: '2' },
    { index: 25, label: '3' },
  ]
  const all = seriesModel({ values, periods, marks })
  assert.deepEqual(all.cites.map((c) => [c.point.period, c.label]), [['d5', '1'], ['d25', '2 · 3']], 'two on one day share a mark')
  const dots = (model) => model.scene().filter((n) => n.attrs?.class === 'chart-cite')
  const labels = (model) => model.scene().filter((n) => n.attrs?.class === 'chart-cite-label').map((n) => n.text)
  assert.equal(dots(all).length, 2)
  assert.deepEqual(labels(all), ['1', '2 · 3'])
  // On the line: the mark's centre is its observation's own point.
  const p25 = all.points.find((p) => p.period === 'd25')
  assert.equal(dots(all)[1].attrs.cx, Number(p25.x.toFixed(1)))
  assert.equal(dots(all)[1].attrs.cy, Number(p25.y.toFixed(1)))

  // The last ten observations: story 1 fell before them and is not drawn at the
  // window's left edge as though it had happened there.
  const recent = seriesModel({ values, periods, marks, window: 10 })
  assert.deepEqual(recent.cites.map((c) => [c.point.period, c.label]), [['d25', '2 · 3']])
  // A mark on a gap, or past either end, is nothing.
  const gapped = seriesModel({ values: [1, Number.NaN, 3], marks: [{ index: 1, label: '1' }, { index: 9, label: '2' }, { index: -1, label: '3' }] })
  assert.deepEqual(gapped.cites, [])
  // And no marks is no marks: the figures of every existing chart are unchanged.
  assert.equal(dots(seriesModel({ values, periods })).length, 0)

  // The table is the chart for a reader who cannot see it.
  const html = renderMarkup(staticFigure(all, {}))
  assert.match(html, /story 1/)
  assert.match(html, /story 2 · 3/)
  assert.equal((html.match(/class="chart-cite"/g) ?? []).length, 2, 'the static figure draws them')
  const { createChart } = await import(chartPath)
  withDom(() => {
    const chart = createChart({ values, periods, marks })
    assert.equal(chart.element.querySelectorAll('.chart-cite').length, 2, 'and so does the browser’s')
    assert.deepEqual([...chart.element.querySelectorAll('.chart-cite-label')].map((n) => n.textContent), ['1', '2 · 3'])
  })

  // Styled, or a class that exists only in the markup.
  const css = readFileSync(join(ROOT, 'public/style.css'), 'utf8')
  assert.match(css, /^\.chart-cite \{/m)
  assert.match(css, /^\.chart-cite-label \{/m)
})

test('a comparison is a second line on the same scale, and nothing else', async () => {
  // The world's median beside a country's own series. It must share the model's
  // scale (two models laid over each other disagree about where a year falls),
  // follow the window, and add nothing to what describes the country: the end
  // dot, the rings, the axis and the table.
  const values = [10, 11, 12, 13, 14, 15]
  const world = [40, 41, null, 43, 44, 45]
  const plain = seriesModel({ values })
  const model = seriesModel({ values, comparison: { values: world, label: 'world median' } })
  const lines = (m) => m.scene().filter((n) => n.attrs?.class === 'chart-compare')

  assert.equal(lines(plain).length, 0, 'no comparison, no line: every existing chart is unchanged')
  assert.equal(lines(model).length, 1)
  assert.equal(model.comparisonLabel, 'world median')
  // Five points: the year the world has no figure for is skipped, not zero.
  assert.equal(lines(model)[0].attrs.points.split(' ').length, 5)
  // The domain holds both lines, and the country's own extremes are still its own.
  assert.equal(model.hi, 45)
  assert.equal(model.lo, 10)
  assert.equal(model.peak.value, 15)
  // Same x for the same year on both lines.
  const xOfYear4 = lines(model)[0].attrs.points.split(' ')[3].split(',')[0]
  assert.equal(Number(xOfYear4), Number(model.points[4].x.toFixed(1)))

  // It follows the window.
  const recent = seriesModel({ values, comparison: { values: world, label: 'world median' }, window: 3 })
  assert.equal(lines(recent)[0].attrs.points.split(' ').length, 3)

  // A fixed domain is the caller's, and the comparison does not move it.
  const fixed = seriesModel({ values, comparison: { values: world, label: 'w' }, domain: [0, 20] })
  assert.deepEqual([fixed.lo, fixed.hi], [0, 20])

  // The widening happens before the rule is considered: 2.1 sits under every
  // value of a high-fertility country, and the world's line brings it in range.
  const fertility = seriesModel({ values: [6.8, 6.5, 6.1], comparison: { values: [2.4, 2.3, 2.106], label: 'w' }, reference: 2.2 })
  assert.ok(fertility.referenceY != null, 'the rule is inside the domain the comparison opened')
  assert.equal(seriesModel({ values: [6.8, 6.5, 6.1], reference: 2.2 }).referenceY, null, 'and outside it without one')

  // And a rule can be a threshold: drawn and labelled, with no percentage taken
  // against it. 6.1 children is not "+177% vs replacement".
  const base = { values: [6.8, 6.5, 6.1], periods: ['a', 'b', 'c'], comparison: { values: [2.4, 2.3, 2.106], label: 'w' }, reference: 2.2, referenceLabel: 'replacement' }
  assert.match(series.pointReadout(seriesModel(base), seriesModel(base).latest), /vs replacement/)
  const threshold = seriesModel({ ...base, referenceChange: false })
  assert.match(series.pointReadout(threshold, threshold.latest), /^c · 6\.10?$/, 'the period and the value, and no percentage')
  assert.ok(threshold.referenceY != null, 'the rule is still drawn')

  // One line in each figure, and styled.
  const html = renderMarkup(staticFigure(model, {}))
  assert.equal((html.match(/class="chart-compare"/g) ?? []).length, 1)
  assert.doesNotMatch(html, />4[0-5]</, 'the world’s figures are in neither the axis nor the table')
  const { createChart } = await import(chartPath)
  withDom(() => {
    const chart = createChart({ values, comparison: { values: world, label: 'world median' } })
    assert.equal(chart.element.querySelectorAll('.chart-compare').length, 1)
  })
  assert.match(readFileSync(join(ROOT, 'public/style.css'), 'utf8'), /^\.chart-compare \{/m)
})

test('a series quoted in % moves in points where nobody said so', () => {
  // `/e/fed-funds`, the `follows` panel and a daily rail card each drew a rate
  // without `change`: the table read `+6.7%` and the readout `−20.0% vs the
  // window’s open`, under a hero that read `+0.25 pts`.
  const open = { reference: 'open', referenceLabel: 'the window’s open' }
  const rate = seriesModel({ values: [5, 4.25, 4], periods: ['a', 'b', 'c'], unit: '%', ...open })
  assert.equal(rate.change, 'points')
  assert.equal(series.rowChange(rate, 1).text, '−0.75 pts')
  assert.match(series.pointReadout(rate, rate.latest), /· −1\.00 pts vs the window’s open$/)
  assert.doesNotMatch(series.pointReadout(rate, rate.latest), /%\s+vs|−20/)
  // A caller's word stands, and a level is a percentage as it was.
  assert.equal(seriesModel({ values: [5, 4], unit: '%', change: 'percent' }).change, 'percent')
  const level = seriesModel({ values: [100, 110], periods: ['a', 'b'], unit: '$/bbl', ...open })
  assert.equal(level.change, 'percent')
  assert.match(series.pointReadout(level, level.latest), /· \+10\.0% vs the window’s open$/)
})

test('a rate moves in points in the table, and a level in percent', async () => {
  // The table's third column divided every series by its previous value. For a
  // rate of inflation that is a percentage of a percentage: Finland's going
  // 0.0001% to 1.2% printed `+129080802.8%`, and an index crossing zero printed
  // five-figure swings. A series says which kind it is.
  const rate = seriesModel({ values: [72.3, 53.9, 0.0001, 1.2, 1.2], periods: ['a', 'b', 'c', 'd', 'e'], change: 'points' })
  assert.equal(series.rowChange(rate, 0), null, 'nothing to change from')
  assert.deepEqual(series.rowChange(rate, 1), { value: 53.9 - 72.3, text: '−18.4 pts' })
  assert.equal(series.rowChange(rate, 3).text, '+1.20 pts')
  // A difference that prints as zero is zero: no `−0 pts`, and no tint.
  assert.deepEqual(series.rowChange(rate, 4), { value: 0, text: '0 pts' })
  assert.deepEqual(series.rowChange(seriesModel({ values: [1, 1.004], change: 'points' }), 1), { value: 0, text: '0 pts' })
  // Across a gap there is no change to state.
  assert.equal(series.rowChange(seriesModel({ values: [1, Number.NaN, 3], change: 'points' }), 2), null)

  // A level is unchanged: every existing chart.
  const level = seriesModel({ values: [100, 110], periods: ['a', 'b'] })
  assert.equal(level.change, 'percent')
  assert.equal(series.rowChange(level, 1).text, '+10.0%')

  // Both tables, and the copied one's header.
  const html = renderMarkup(staticFigure(rate, {}))
  assert.match(html, /−18\.4 pts/)
  assert.doesNotMatch(html, /129080802|−25\.5%/)
  const { createChart } = await import(chartPath)
  withDom(() => {
    const chart = createChart({ values: [72.3, 53.9], periods: ['a', 'b'], change: 'points' })
    const details = chart.element.querySelector('.chart-data')
    details.open = true
    details.dispatchEvent(new globalThis.window.Event('toggle'))
    assert.equal(chart.element.querySelector('.chart-table td.is-change.is-neg').textContent, '−18.4 pts')
  })
})

test('a second line is named to a reader who cannot see it', () => {
  const model = seriesModel({ values: [1, 2, 3], comparison: { values: [2, 2, 2], label: 'world median' } })
  assert.match(series.chartDescription(model, false), /a thinner line shows the world median/)
  assert.doesNotMatch(series.chartDescription(seriesModel({ values: [1, 2, 3] }), false), /thinner line/)
})

test('the island redraws a figure from the options the figure was built with', async () => {
  // `/e/{id}` sends a series and gets the indicator's chart. A country page
  // sends what its static figure was drawn with, and must get that chart back
  // with a cursor: the world's line, the threshold, the same words for a value.
  const { mount } = await import(await bundle('public/islands/series-chart.ts', 'series-chart.mjs'))
  const host = (source) => {
    const div = globalThis.document.createElement('div')
    div.innerHTML = '<figure class="chart is-static"></figure><script type="application/json" class="chart-source"></script>'
    div.querySelector('script').textContent = JSON.stringify(source)
    return div
  }
  withDom(() => {
    // A trajectory: births, with a year the series lacks (JSON has no NaN).
    const births = host({
      values: [6.8, null, 6.1, 5.9],
      periods: ['2021', '2022', '2023', '2024'],
      label: 'Children born per woman',
      caption: 'World Bank',
      options: {
        comparison: { values: [2.4, 2.3, 2.2, 2.106], label: 'world median' },
        reference: 2.1,
        referenceLabel: 'replacement',
        referenceChange: false,
        format: 'births',
        step: 'years',
      },
    })
    mount(births)
    assert.equal(births.querySelectorAll('figure.chart').length, 1, 'the static figure is replaced, not joined')
    assert.equal(births.querySelector('figure.chart.is-static'), null)
    assert.equal(births.querySelectorAll('.chart-compare').length, 1, 'the world’s line survives the swap')
    assert.ok(births.querySelector('.chart-ref'), 'and so does the rule')
    const readout = births.querySelector('.chart-readout').textContent
    assert.match(readout, /2024 · 5\.9$/, `the card's own format, and no percentage against a threshold: ${readout}`)
    assert.equal(births.querySelector('.chart-data-count').textContent.trim(), '4', 'the gap is a row, not a missing one')

    // An indicator, as before: no options, the indicator's defaults.
    const brent = host({ values: [80, 90, 100], periods: ['a', 'b', 'c'], unit: '$/bbl', kind: 'DAILY', label: 'Brent' })
    mount(brent)
    assert.equal(brent.querySelectorAll('.chart-compare').length, 0)
    assert.match(brent.querySelector('.chart-readout').textContent, /vs the window’s open/)
    assert.ok(brent.querySelector('figure.chart').classList.contains('is-pos'), 'signed, as an indicator is')
  })
})

test('the two figures share one class vocabulary', async () => {
  // The island replaces the static figure wholesale, so nothing forces the two
  // to agree — except that both are styled by one block in style.css. A class
  // that exists on only one of them is a rule that silently applies to only
  // one of them.
  const { createChart } = await import(chartPath)
  const live = withDom(() => {
    const chart = createChart({ ...baseOpts })
    chart.element.querySelector('.chart-data').open = true
    chart.element.querySelector('.chart-data').dispatchEvent(new globalThis.window.Event('toggle'))
    // The root `<figure>` carries `.chart` and the tone, so it has to be in
    // the set — `querySelectorAll` alone starts one level in.
    return new Set(
      [chart.element, ...chart.element.querySelectorAll('[class]')].flatMap((n) =>
        String(n.getAttribute('class')).split(/\s+/),
      ),
    )
  })
  const staticHtml = renderMarkup(staticFigure(seriesModel(baseOpts), { caption: 'x' }))
  const still = new Set(
    [...staticHtml.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)),
  )

  const css = readFileSync(join(ROOT, 'public/style.css'), 'utf8')
  for (const cls of new Set([...live, ...still])) {
    if (!cls.startsWith('chart')) continue
    assert.ok(css.includes(`.${cls}`), `.${cls} is emitted by a chart and styled by nothing`)
  }

  // Everything the static figure draws, the live one draws too. The reverse is
  // deliberately false: the controls have nothing to do without a script.
  for (const cls of still) {
    if (!cls.startsWith('chart')) continue
    assert.ok(live.has(cls), `the interactive chart dropped .${cls}`)
  }
})

test('the stylesheet holds the type to its floor against the width the model draws at', () => {
  // The type is in viewBox units, so a chart drawn narrower than it was
  // authored shrank its labels with it: 8.3px in the map's card and 5.6px on a
  // phone, against an 11px floor. The stylesheet divides the authored width by
  // the drawn one to undo that, and the authored width is a number it cannot
  // import. If the two part, every label on the site is the wrong size and
  // nothing else fails.
  const css = readFileSync(join(ROOT, 'public/style.css'), 'utf8')
  const authored = css.match(/--chart-authored-w:\s*(\d+)px/)
  assert.ok(authored, 'the stylesheet states the width the chart was authored at')
  assert.equal(Number(authored[1]), series.CHART_W)
  assert.equal(seriesModel({ values: [1, 2, 3] }).width, series.CHART_W, 'and the model draws at it')

  // The container the drawn width is read from is the wrapper both adapters emit.
  assert.match(css, /^\.chart-plot \{ container-type: inline-size; \}/m)
})

// --- 6. The rank strip ----------------------------------------------------

test('the rank strip means the rank, at both ends and outside them', () => {
  const { rankStrip } = rankMod
  assert.equal(rankStrip(1, 145).css, '100.0%', 'rank 1 fills the bar')
  assert.equal(rankStrip(145, 145).css, '0.0%', 'last empties it')
  assert.equal(rankStrip(73, 145).text, '73 of 145')
  assert.equal(rankStrip(null, 145).text, '—', 'no rank is a dash, not a zero-length bar')
  assert.equal(rankStrip(null, 145).fill, 0)
  // A single-country metric has no scale to place anyone on, and a rank
  // outside the set would otherwise produce a negative width.
  assert.equal(rankStrip(1, 1).css, '0%')
  assert.equal(rankStrip(300, 145).fill, 0)
})

test('the strip is written once and read by both surfaces', () => {
  // It used to be the same expression in `country-pages.js` and twice in
  // `_map/popup.ts`. Nothing had drifted, and "nothing had drifted" was the
  // whole of the guarantee that a country page and a map card agree.
  const country = readFileSync(join(ROOT, 'scripts/build/country-pages.js'), 'utf8')
  const popup = readFileSync(join(ROOT, 'public/islands/_map/popup.ts'), 'utf8')
  for (const [name, src] of [
    ['country-pages.js', country],
    ['_map/popup.ts', popup],
  ]) {
    assert.doesNotMatch(
      src,
      /1 - \(\s*\w*[Rr]ank\w* - 1\s*\)/,
      `${name} still computes the percentile itself`,
    )
    assert.match(src, /rankStrip/, `${name} should use the shared strip`)
  }
})
