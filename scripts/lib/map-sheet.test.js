// The map's detail sheet: peek, pinned, and the promotion between them.
//
// The sheet is the one part of the map with two open states rather than one,
// and the whole hover-then-commit gesture rests on `isPinned()` being right:
// the island dismisses the sheet 260ms after the pointer leaves a marker
// *unless* the sheet says it is pinned. Get that wrong and clicking a marker
// appears to do nothing — the card opens and then closes itself.
//
// No MapLibre here. `_map/sheet.ts` is DOM-only, so it is bundled and driven
// on its own against jsdom.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { bundleIsland, scratchDir } from './island-bundle.js'

const dir = scratchDir('map-sheet')
const bundlePath = await bundleIsland(dir, 'public/islands/_map/sheet.ts', 'sheet.mjs')

function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://zuhd.news/',
  })
  const { window } = dom

  // jsdom's <dialog> support varies by version; model the two things this
  // suite depends on — that `show`/`showModal` set `open`, and that `close`
  // fires its event *asynchronously*, as the HTML spec requires. That timing
  // is the whole point of the promotion test below: the sheet has to close a
  // non-modal peek before `showModal` will accept it, and a `close` handler
  // that lands after the promotion must not undo it.
  window.HTMLDialogElement.prototype.show = function () {
    this.setAttribute('open', '')
  }
  window.HTMLDialogElement.prototype.showModal = function () {
    if (this.hasAttribute('open')) throw new window.DOMException('already open', 'InvalidStateError')
    this.setAttribute('open', '')
  }
  window.HTMLDialogElement.prototype.close = function () {
    if (!this.hasAttribute('open')) return
    this.removeAttribute('open')
    queueMicrotask(() => this.dispatchEvent(new window.Event('close')))
  }
  Object.defineProperty(window.HTMLDialogElement.prototype, 'open', {
    configurable: true,
    get() {
      return this.hasAttribute('open')
    },
  })

  const globals = ['window', 'document', 'HTMLElement', 'Event', 'Node']
  const saved = {}
  for (const k of globals) {
    saved[k] = globalThis[k]
    globalThis[k] = k === 'window' ? window : window[k]
  }
  saved.localStorage = globalThis.localStorage
  globalThis.localStorage = window.localStorage

  return {
    window,
    restore() {
      for (const k of globals) globalThis[k] = saved[k]
      globalThis.localStorage = saved.localStorage
      dom.window.close()
    },
  }
}

/** A GdacsAlert as `/api/gdacs.json` actually serves one. */
const ALERT = {
  eventid: '1000001',
  eventtype: 'EQ',
  alertlevel: 'Orange',
  name: 'Earthquake in Region',
  country: 'Chile',
  iso3: 'CHL',
  affectedCountries: ['Chile'],
  lat: -33,
  lng: -71,
  fromDate: '2026-07-20T00:00:00Z',
  toDate: null,
  modifiedDate: '2026-07-20T02:00:00Z',
  severityText: 'Magnitude 6.2M, Depth:10km',
  severityValue: 6.2,
  severityUnit: 'M',
  description: '',
  source: 'NEIC',
  reportUrl: null,
}

/** Let a queued `close` event land. */
const flush = () => new Promise((r) => setTimeout(r, 0))

test('a hover peek opens non-modal and unpinned', async () => {
  const env = setupDom()
  try {
    const { createSheet } = await import(bundlePath)
    const sheet = createSheet()
    sheet.showGdacs(ALERT, null, false)

    assert.equal(sheet.isOpen(), true, 'peek opens the sheet')
    assert.equal(sheet.isPinned(), false, 'a peek is not pinned')
    assert.equal(sheet.element.classList.contains('is-peek'), true, 'peek density')

    sheet.destroy()
  } finally {
    env.restore()
  }
})

test('clicking a marker promotes a peek to a pinned sheet, and it stays pinned', async () => {
  const env = setupDom()
  try {
    const { createSheet } = await import(bundlePath)
    const sheet = createSheet()

    // The real gesture: the pointer rests on a marker, then the reader clicks.
    sheet.showGdacs(ALERT, null, false)
    sheet.showGdacs(ALERT, null, true)

    assert.equal(sheet.isOpen(), true, 'the pinned sheet is open')
    assert.equal(sheet.isPinned(), true, 'the click pinned it')
    assert.equal(sheet.element.classList.contains('is-peek'), false, 'pinned density')

    // The regression. Promotion has to close the non-modal dialog before
    // `showModal` will take it, and `close` fires its event one task later —
    // so a handler that unconditionally cleared the flag unpinned a sheet the
    // reader had just clicked. The symptom was that pinning did nothing: the
    // island dismisses an unpinned sheet as soon as the pointer leaves.
    await flush()
    assert.equal(sheet.isPinned(), true, 'still pinned after the queued close event')
    assert.equal(sheet.isOpen(), true, 'still open after the queued close event')

    sheet.destroy()
  } finally {
    env.restore()
  }
})

test('a pinned sheet ignores hover, and closing it clears the pin', async () => {
  const env = setupDom()
  try {
    const { createSheet } = await import(bundlePath)
    const sheet = createSheet()
    sheet.showGdacs(ALERT, null, true)

    // Hovering another marker must not downgrade a card the reader committed
    // to — otherwise a pinned sheet vanishes mid-read as the pointer travels.
    sheet.showGdacs({ ...ALERT, eventid: '1000002', name: 'Other' }, null, false)
    assert.equal(sheet.isPinned(), true, 'hover cannot unpin')
    assert.equal(sheet.element.classList.contains('is-peek'), false)

    sheet.close()
    await flush()
    assert.equal(sheet.isOpen(), false)
    assert.equal(sheet.isPinned(), false, 'a closed sheet is not pinned')

    sheet.destroy()
  } finally {
    env.restore()
  }
})

/**
 * A tracked exchange, shaped as `/api/markets.json` publishes it. Riyadh
 * because it is the one whose week differs from the Western default, and the
 * fixed `days` here are what the peek's freshness line is derived from.
 */
const EXCHANGE = {
  id: 'tadawul',
  name: 'Saudi Exchange',
  indexName: 'TASI',
  city: 'Riyadh',
  iso2: 'SA',
  lat: 24.7136,
  lng: 46.6753,
  level: 10720.28,
  changePct: 0.15,
  currency: 'SAR',
  tz: 'Asia/Riyadh',
  sessionStart: '10:00',
  sessionEnd: '15:00',
  days: [0, 1, 2, 3, 4],
  series: {
    periods: ['Jul 21', 'Jul 22', 'Jul 23'],
    values: [10715.61, 10704.51, 10720.28],
  },
  asOf: '2026-07-23',
  sourceLabel: 'Yahoo Finance · SAU',
  blurb: 'The Arab world’s largest exchange by market value.',
  relatedArticles: [{ slug: 'a-story', title: 'A Story', dateFormatted: 'Jul 23' }],
}

test('a market peek states the level and the move, and nothing else', async () => {
  const env = setupDom()
  try {
    const { createSheet } = await import(bundlePath)
    const sheet = createSheet()
    sheet.showMarket(EXCHANGE, false)

    const text = sheet.element.textContent
    assert.match(text, /Saudi Exchange/)
    assert.match(text, /10,720\.28 SAR/, 'the level, in the currency it is quoted in')
    assert.match(text, /\+0\.15%/, 'a rise carries its sign')
    assert.equal(sheet.element.classList.contains('is-peek'), true)
    // Peek is capped at 55vh and clips rather than scrolls, so the things that
    // belong to the pinned density must not be rendered into it.
    assert.doesNotMatch(text, /largest exchange by market value/, 'no blurb in a peek')
    assert.equal(sheet.element.querySelector('.chart'), null, 'no chart in a peek')
    assert.doesNotMatch(text, /Related coverage/, 'no related list in a peek')

    sheet.destroy()
  } finally {
    env.restore()
  }
})

test('a pinned market card carries the series, its provenance and its coverage', async () => {
  const env = setupDom()
  try {
    const { createSheet } = await import(bundlePath)
    const sheet = createSheet()
    sheet.showMarket(EXCHANGE, true)

    const text = sheet.element.textContent
    assert.match(text, /largest exchange by market value/, 'the blurb')
    assert.match(text, /Yahoo Finance/, 'provenance')
    assert.match(text, /Related coverage/)

    const chart = sheet.element.querySelector('.chart')
    assert.ok(chart, 'the pinned card draws the series')
    // A rising index must not be drawn in the chokepoint blockage gold — it is
    // the signed palette or it is borrowing someone else's meaning.
    assert.equal(chart.classList.contains('is-pos'), true, 'a rise uses the signed palette')
    assert.equal(chart.classList.contains('is-up'), false, 'not the straits palette')

    sheet.destroy()
  } finally {
    env.restore()
  }
})

test('a market with too short a series still opens, without a chart', async () => {
  // Cairo is the live case: Yahoo returns a level and no usable history. The
  // card must degrade to the number rather than render an empty figure — and
  // `createChart` returning null is what makes that automatic.
  const env = setupDom()
  try {
    const { createSheet } = await import(bundlePath)
    const sheet = createSheet()
    sheet.showMarket({ ...EXCHANGE, series: { periods: ['Jul 23'], values: [10720.28] } }, true)

    assert.equal(sheet.isOpen(), true)
    assert.match(sheet.element.textContent, /10,720\.28 SAR/)
    assert.equal(sheet.element.querySelector('.chart'), null, 'one point draws no chart')

    sheet.destroy()
  } finally {
    env.restore()
  }
})

// A strait's chart is the one that reads a *published* baseline rather than
// its own opening value, and the one drawn in the chokepoint vocabulary. Both
// were previously untested, and both are things the range control could break
// without anything throwing: a rule recomputed per window stops being the
// 90-day average, and a rising strait drawn in the signed palette borrows the
// meaning of a market.
const CHOKEPOINT = {
  id: 'hormuz',
  name: 'Strait of Hormuz',
  lat: 26.5,
  lng: 56.2,
  primaryField: 'n_total',
  last7Avg: { n_total: 12.1 },
  baseline90Avg: { n_total: 11.9 },
  delta7vs90: { n_total: -0.42 },
  series: {
    periods: Array.from({ length: 40 }, (_, i) => `Jun ${i + 1}`),
    values: [],
    total: Array.from({ length: 40 }, (_, i) => 12 + Math.sin(i / 3) * 2),
  },
  asOf: '2026-07-24',
  blurb: 'A fifth of the world’s oil passes through it.',
  relatedArticles: [{ slug: 'a-story', title: 'A Story' }],
}

test('a pinned chokepoint draws its traffic against the published baseline', async () => {
  const env = setupDom()
  try {
    const { createSheet } = await import(bundlePath)
    const sheet = createSheet()
    sheet.showChokepoint(CHOKEPOINT, true)

    const chart = sheet.element.querySelector('.chart')
    assert.ok(chart, 'the pinned card draws the series')
    // Falling traffic is the chokepoint's gold, not the market's red. The two
    // palettes mean different things and share a card surface.
    assert.equal(chart.classList.contains('is-down'), true, 'the straits palette')
    assert.equal(chart.classList.contains('is-neg'), false, 'not the signed one')

    // The rule is the 90-day average — an external, published figure. If it
    // were recomputed from the drawn window it would silently become "the
    // window's open" while the caption went on naming the baseline.
    const ref = sheet.element.querySelector('.chart-ref')
    assert.ok(ref, 'the baseline is drawn')
    assert.match(
      sheet.element.querySelector('.chart-readout').textContent,
      /vs the 90-day average/,
      'and the readout says what a value is being compared against',
    )
    assert.match(sheet.element.textContent, /vessels/, 'the unit reaches the readout')

    sheet.destroy()
  } finally {
    env.restore()
  }
})

test('a chokepoint peek is the number, not the chart', async () => {
  const env = setupDom()
  try {
    const { createSheet } = await import(bundlePath)
    const sheet = createSheet()
    sheet.showChokepoint(CHOKEPOINT, false)
    assert.equal(sheet.element.querySelector('.chart'), null)
    assert.match(sheet.element.textContent, /12\.1 vessels\/day/)
    sheet.destroy()
  } finally {
    env.restore()
  }
})
