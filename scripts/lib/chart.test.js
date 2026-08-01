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
