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

test('an exchange pinned from its mark is a card over a live map, in its peek’s corner', async () => {
  const env = setupDom()
  try {
    const { createSheet } = await import(bundlePath)
    const { window } = env
    let modal = 0
    const showModal = window.HTMLDialogElement.prototype.showModal
    window.HTMLDialogElement.prototype.showModal = function () {
      modal++
      showModal.call(this)
    }
    const host = window.document.createElement('div')
    host.className = 'map-canvas-host'
    const canvas = host.appendChild(window.document.createElement('canvas'))
    const rail = window.document.createElement('button')
    window.document.body.append(host, rail)
    const press = (target) =>
      target.dispatchEvent(new window.Event('pointerdown', { bubbles: true }))

    const sheet = createSheet()
    // The hover first, then the click on the same mark: the island's two calls.
    sheet.showMarket(EXCHANGE, false)
    sheet.dockTo(null)
    sheet.showMarket(EXCHANGE, true, undefined, true)
    assert.equal(modal, 0, 'no backdrop: the map stays in view')
    assert.equal(sheet.element.open, true)
    assert.equal(sheet.isPinned(), true)
    assert.deepEqual(
      ['is-docked', 'is-corner', 'is-peek'].map((c) => sheet.element.classList.contains(c)),
      [true, true, false],
    )
    assert.ok(sheet.element.querySelector('.chart'), 'at the pinned density, not the peek’s')

    // The reader turns the globe under it, as under a story's card.
    press(canvas)
    assert.equal(sheet.element.open, true, 'a press on the map does not shut it')
    press(rail)
    assert.equal(sheet.element.open, false, 'a press anywhere else does')

    // From a rail row it stands beside the row, and the corner is not left on
    // it; pinned from a mark again, the row's offsets are not left on it either.
    sheet.dockTo(rail)
    sheet.showMarket(EXCHANGE, true, 3, true)
    assert.equal(sheet.element.classList.contains('is-corner'), false)
    assert.notEqual(sheet.element.style.top, '')
    sheet.close()
    sheet.dockTo(null)
    sheet.showMarket(EXCHANGE, true, undefined, true)
    assert.equal(sheet.element.classList.contains('is-corner'), true)
    assert.equal(sheet.element.style.top, '')
    assert.equal(sheet.element.style.right, '')
    assert.equal(modal, 0)

    // Nor on a peek: hovering a mark after a rail card had shut opened the peek
    // beside the rail, and pinning it then moved it to the corner.
    sheet.close()
    sheet.dockTo(rail)
    sheet.showMarket(EXCHANGE, true, 3, true)
    assert.notEqual(sheet.element.style.top, '')
    sheet.close()
    sheet.showMarket(EXCHANGE, false)
    assert.equal(sheet.element.classList.contains('is-peek'), true)
    assert.deepEqual(
      ['top', 'right', 'left', 'bottom'].map((side) => sheet.element.style.getPropertyValue(side)),
      ['', '', '', ''],
      'a peek keeps no card’s offsets',
    )

    sheet.destroy()
  } finally {
    env.restore()
  }
})

test('a genocide card pinned from its mark dims nothing, as a story’s does not', async () => {
  // Every mark's card opens this way on the desktop: the reader asked for no
  // backdrop over the map anywhere it can be avoided.
  const env = setupDom()
  try {
    const { createSheet } = await import(bundlePath)
    const { window } = env
    let modal = 0
    const showModal = window.HTMLDialogElement.prototype.showModal
    window.HTMLDialogElement.prototype.showModal = function () {
      modal++
      showModal.call(this)
    }
    const situation = {
      id: 'gaza',
      name: 'Gaza',
      iso2: 'PS',
      lat: 31.4,
      lng: 34.4,
      finding: 'genocide',
      body: 'UN Independent International Commission of Inquiry',
      document: 'A/HRC/60/CRP.3',
      date: '2025-09-16',
      summary: 'The Commission found that genocide is being committed.',
      url: 'https://www.ohchr.org/',
      since: '2023-10',
    }
    const sheet = createSheet()
    sheet.showGenocide(situation, false)
    sheet.dockTo(null)
    sheet.showGenocide(situation, true, true)
    assert.equal(modal, 0, 'no backdrop: the map stays in view')
    assert.deepEqual(
      ['is-docked', 'is-corner', 'is-peek'].map((c) => sheet.element.classList.contains(c)),
      [true, true, false],
    )
    assert.match(sheet.element.textContent, /Read the finding/, 'at the pinned density')
    sheet.destroy()
  } finally {
    env.restore()
  }
})

test('a hover over Makkah while another card is pinned starts nothing', async () => {
  // The countdown once started anyway, wrote its minutes into the pinned
  // card's hero and, when the prayer entered, replaced that card with Makkah's.
  const env = setupDom()
  const realSet = globalThis.setInterval
  let timers = 0
  globalThis.setInterval = /** @type {typeof setInterval} */ (
    /** @type {unknown} */ (
      (/** @type {() => void} */ fn, /** @type {number} */ ms) => {
        timers++
        return realSet(fn, ms)
      }
    )
  )
  try {
    const { createSheet } = await import(bundlePath)
    const sheet = createSheet()
    sheet.dockTo(null)
    sheet.showMarket(EXCHANGE, true, undefined, true)
    const before = sheet.element.textContent
    sheet.showMakkah(Date.parse('2026-10-15T10:00:00Z'), false)
    assert.equal(timers, 0, 'no countdown for a card that was not drawn')
    assert.equal(sheet.element.textContent, before, 'the pinned card is untouched')
    // Pinned, it draws and counts.
    sheet.showMakkah(Date.parse('2026-10-15T10:00:00Z'), true, true)
    assert.equal(timers, 1)
    assert.match(sheet.element.textContent, /Makkah/)
    sheet.destroy()
  } finally {
    globalThis.setInterval = realSet
    env.restore()
  }
})

test('an exchange card leads with the move the mark was drawn from', async () => {
  // The mark, the panel row and this hero are one reading over the range the
  // timeline is set to. A card that led with the day's move under a tick drawn
  // from the week's would be two answers to one press.
  const env = setupDom()
  const realNow = Date.now
  // The day after the fixture's last close.
  Date.now = () => Date.parse('2026-07-24T12:00:00Z')
  try {
    const { createSheet } = await import(bundlePath)
    const sheet = createSheet()
    const hero = () => sheet.element.querySelector('.map-sheet-hero')

    // Three days: 10,715.61 to 10,720.28.
    sheet.showMarket(EXCHANGE, false, undefined, undefined, { heroDays: 3 })
    assert.equal(hero().querySelector('.map-sheet-hero-focal').textContent, '+0.04%')
    assert.match(hero().textContent, /TASI · 10,720\.28 SAR · 3 days/, 'and it says which period')
    // Under the flat band the tick is neutral, so the figure is not tinted: a
    // level day used to tint green.
    assert.equal(hero().querySelector('.map-sheet-hero-focal').className, 'map-sheet-hero-focal')

    // The day step is the day's move, and names no period.
    sheet.showMarket(EXCHANGE, false, undefined, undefined, { heroDays: 1 })
    assert.equal(hero().querySelector('.map-sheet-hero-focal').textContent, '+0.15%')
    assert.doesNotMatch(hero().textContent, /days/)

    // A series that has stopped has no reading: the last session's move, as
    // before, and it is not captioned as the week's.
    Date.now = () => Date.parse('2026-10-10T12:00:00Z')
    sheet.showMarket({ ...EXCHANGE, changePct: -0.4 }, false, undefined, undefined, { heroDays: 7 })
    assert.equal(hero().querySelector('.map-sheet-hero-focal').textContent, '−0.40%')
    assert.doesNotMatch(hero().textContent, /days/, 'a day’s move does not wear a week’s label')

    // Opened from the rail, the rail's range is the hero's range. (Last, because
    // a pinned card is not replaced by a peek.)
    Date.now = () => Date.parse('2026-07-24T12:00:00Z')
    sheet.showMarket({ ...EXCHANGE, series: { periods: ['Jul 21', 'Jul 22', 'Jul 23'], values: [11000, 10900, 10720.28] } }, true, 3)
    assert.equal(hero().querySelector('.map-sheet-hero-focal').textContent, '−2.54%')
    assert.ok(hero().querySelector('.map-sheet-hero-focal').classList.contains('is-neg'))

    sheet.destroy()
  } finally {
    Date.now = realNow
    env.restore()
  }
})

test('a flagged exchange’s card names the run and leads with its account', async () => {
  const env = setupDom()
  try {
    const { createSheet } = await import(bundlePath)
    const sheet = createSheet()
    const pattern = { kind: 'monthly', sessions: 20, changePct: -15.2, direction: -1, score: 3, startDate: '2026-09-11', endDate: '2026-10-09' }
    const signal = {
      id: 'mkt:tadawul',
      title: 'TASI',
      asOf: '2026-10-09',
      pattern,
      facts: 'TASI fell 15.2% over 20 sessions.',
      commentary: 'Aramco’s results missed and the index followed.',
      citations: [{ slug: 'aramco-misses', title: 'Aramco Misses', date: '2026-10-08', url: 'https://zuhd.news/a/aramco-misses' }],
    }
    const exchange = { ...EXCHANGE, recent: 'The exchange’s own account.' }

    // A peek has room for what the doubled tick means and nothing more.
    sheet.showMarket(exchange, false, undefined, undefined, { signal })
    assert.match(sheet.element.querySelector('.map-sheet-kicker').textContent, /Month-long fall/)
    assert.equal(sheet.element.querySelector('.map-sheet-flag'), null)

    sheet.showMarket(exchange, true, undefined, undefined, { signal })
    assert.equal(
      sheet.element.querySelector('.map-sheet-flag').textContent,
      'Month-long fall, 15.2% over 20 sessions · 11 Sep to 9 Oct',
    )
    // One account, with the stories it was written from: the run's, not the
    // exchange's own and not both.
    const text = sheet.element.textContent
    assert.match(text, /Aramco’s results missed/)
    assert.doesNotMatch(text, /The exchange’s own account/)
    assert.match(text, /Read from/)
    assert.equal(sheet.element.querySelector('.map-sheet-more-link').getAttribute('href'), '/a/aramco-misses')
    assert.doesNotMatch(text, /Related coverage/)
    sheet.close()

    // No cause written: the run is still named, and the card is the exchange's own.
    sheet.showMarket(exchange, true, undefined, undefined, { signal: { ...signal, commentary: '', citations: [] } })
    assert.ok(sheet.element.querySelector('.map-sheet-flag'))
    assert.match(sheet.element.textContent, /The exchange’s own account/)
    assert.match(sheet.element.textContent, /Related coverage/)
    sheet.close()

    // No signal, no flag: the card of 2026-10-10.
    sheet.showMarket(exchange, true)
    assert.equal(sheet.element.querySelector('.map-sheet-flag'), null)
    assert.doesNotMatch(sheet.element.querySelector('.map-sheet-kicker').textContent, /fall|rise|streak/i)

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

test('the stories an account was written from are numbered on the chart and in the list', async () => {
  const env = setupDom()
  try {
    const { createSheet } = await import(bundlePath)
    const sheet = createSheet()
    const exchange = {
      ...EXCHANGE,
      recent: 'The index rose on Aramco’s results.',
      // The build's word that this list is the account's own citations.
      relatedCited: true,
      relatedArticles: [
        { slug: 'on-the-22nd', title: 'On the 22nd', date: '2026-07-22T09:00:00Z' },
        { slug: 'a-weekend', title: 'A Weekend Story', date: '2026-07-25T09:00:00Z' },
        { slug: 'on-the-23rd', title: 'On the 23rd', date: '2026-07-23T09:00:00Z' },
      ],
    }
    sheet.showMarket(exchange, true)
    const chart = sheet.element.querySelector('.chart')
    assert.deepEqual([...chart.querySelectorAll('.chart-cite-label')].map((n) => n.textContent), ['1', '2'])
    // The same numbers beside the same stories; the one with no session that
    // day keeps its row and takes none.
    const rows = [...sheet.element.querySelectorAll('.map-sheet-more li')].map((li) => [
      li.querySelector('.map-sheet-more-n')?.textContent ?? null,
      li.querySelector('a').textContent,
    ])
    assert.deepEqual(rows, [
      ['1', 'On the 22nd'],
      [null, 'A Weekend Story'],
      ['2', 'On the 23rd'],
    ])
    sheet.close()

    // No account, no marks: without one the list is tag matches, and a dot for
    // a story that merely mentions the exchange would claim a cause.
    sheet.showMarket({ ...exchange, recent: undefined }, true)
    assert.equal(sheet.element.querySelector('.chart-cite'), null)
    assert.equal(sheet.element.querySelector('.map-sheet-more-n'), null)
    sheet.close()
    // An account whose citations no longer resolve keeps its prose and gets tag
    // matches for a list. Those are not its sources either.
    sheet.showMarket({ ...exchange, relatedCited: undefined }, true)
    assert.match(sheet.element.textContent, /Aramco’s results/)
    assert.equal(sheet.element.querySelector('.chart-cite'), null)
    assert.equal(sheet.element.querySelector('.map-sheet-more-n'), null)
    sheet.close()

    // Opened from the rail the chart is windowed, and a story before the window
    // has no dot. It takes no number, and the rest count from one: the list
    // read 1, 2, 3 under a chart showing 2 and 3.
    const periods = Array.from({ length: 40 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 5, 15) + i * 86_400_000)
      return `${d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })} ${d.getUTCDate()}`
    })
    const long = {
      ...exchange,
      asOf: '2026-07-24',
      series: { periods, values: periods.map((_, i) => 100 + i) },
      relatedArticles: [
        { slug: 'long-ago', title: 'Long Ago', date: '2026-06-20T09:00:00Z' },
        { slug: 'this-week', title: 'This Week', date: '2026-07-22T09:00:00Z' },
        { slug: 'yesterday', title: 'Yesterday', date: '2026-07-24T09:00:00Z' },
      ],
    }
    const realNow = Date.now
    Date.now = () => Date.parse('2026-07-25T12:00:00Z')
    try {
      sheet.showMarket(long, true, 3)
    } finally {
      Date.now = realNow
    }
    assert.deepEqual([...sheet.element.querySelectorAll('.chart-cite-label')].map((n) => n.textContent), ['1', '2'])
    assert.deepEqual(
      [...sheet.element.querySelectorAll('.map-sheet-more li')].map((li) => li.querySelector('.map-sheet-more-n')?.textContent ?? null),
      [null, '1', '2'],
    )
    sheet.destroy()
  } finally {
    env.restore()
  }
})

test('a pinned card sets a move against a day, a week and a month', async () => {
  const env = setupDom()
  const realNow = Date.now
  try {
    const { createSheet } = await import(bundlePath)
    const sheet = createSheet()
    const cells = () =>
      [...sheet.element.querySelectorAll('.map-sheet-move')].map((c) => [
        c.querySelector('dt').textContent,
        c.querySelector('dd').textContent,
        c.getAttribute('aria-current'),
      ])

    // Forty sessions rising a point a day, read the day after the last.
    const periods = Array.from({ length: 40 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 5, 15) + i * 86_400_000)
      return `${d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })} ${d.getUTCDate()}`
    })
    const values = Array.from({ length: 40 }, (_, i) => 100 + i)
    Date.now = () => Date.parse('2026-07-25T12:00:00Z')
    sheet.showMarket({ ...EXCHANGE, changePct: (1 / 138) * 100, level: 139, asOf: '2026-07-24', series: { periods, values } }, true, 7)
    assert.deepEqual(cells(), [
      ['1 day', '+0.7%', null],
      ['7 days', '+5.3%', 'true'],
      ['30 days', '+27.5%', null],
    ])
    // Nothing on the chart is as high: it says so, and only as far back as the
    // chart goes.
    assert.match(sheet.element.textContent, /Highest in a month\./)
    sheet.close()

    // A close too old to be any of the three: each keeps its place with a
    // dash, so the columns do not shift between cards.
    Date.now = () => Date.parse('2026-10-10T12:00:00Z')
    sheet.showMarket(EXCHANGE, true)
    assert.deepEqual(cells(), [
      ['1 day', '—', null],
      ['7 days', '—', null],
      ['30 days', '—', null],
    ])
    sheet.close()

    // A peek has no room for it.
    sheet.showMarket(EXCHANGE, false)
    assert.equal(sheet.element.querySelector('.map-sheet-moves'), null)
    sheet.destroy()
  } finally {
    Date.now = realNow
    env.restore()
  }
})

test('a pinned strait charts the week’s mean and says what is moving, by class', async () => {
  const env = setupDom()
  const realNow = Date.now
  Date.now = () => Date.parse('2026-07-25T12:00:00Z')
  try {
    const { createSheet } = await import(bundlePath)
    const sheet = createSheet()
    const strait = {
      ...CHOKEPOINT,
      last7Avg: { n_total: 12.1, n_tanker: 4, n_container: 6.5, n_roro: 0.2 },
      baseline90Avg: { n_total: 30, n_tanker: 14, n_container: 12, n_roro: 0.3 },
      delta7vs90: { n_total: -0.6, n_tanker: -0.71, n_container: -0.46, n_roro: -0.3 },
    }
    sheet.showChokepoint(strait, true)

    // The chart is the series the rail's row and the map's label read: one
    // point per day that has a week behind it.
    assert.equal(sheet.element.querySelector('.chart-data-count').textContent.trim(), String(40 - 6))
    assert.match(sheet.element.textContent, /7-day mean/)

    // Three columns that keep their place, as on an exchange.
    assert.deepEqual(
      [...sheet.element.querySelectorAll('.map-sheet-move dt')].map((n) => n.textContent),
      ['1 day', '7 days', '30 days'],
    )

    // By class, and only the classes that sail here: a tenth of a ro-ro a day
    // is not a row.
    const rows = [...sheet.element.querySelectorAll('.map-sheet-class')].map((r) =>
      [...r.children].map((n) => n.textContent),
    )
    // The columns are named once, then one row a class.
    assert.deepEqual(rows[0], ['', 'this week', 'vs 90 days'])
    assert.deepEqual(rows.slice(1).map((r) => r[0]), ['tankers', 'container ships'])
    assert.deepEqual(rows[1], ['tankers', '4/day', '−71%'])
    // A class a fraction of a percent off its normal is at its normal.
    sheet.close()
    sheet.showChokepoint({ ...strait, delta7vs90: { ...strait.delta7vs90, n_tanker: -0.004, n_container: 0.003 } }, true)
    assert.deepEqual(
      [...sheet.element.querySelectorAll('.map-sheet-class-delta')].slice(1).map((n) => n.textContent),
      ['0%', '0%'],
    )

    // One class is the total again, not a table.
    sheet.close()
    sheet.showChokepoint(CHOKEPOINT, true)
    assert.equal(sheet.element.querySelector('.map-sheet-classes'), null)
    sheet.destroy()
  } finally {
    Date.now = realNow
    env.restore()
  }
})

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

test('a pinned card says why it moved, and sets the definition below it', async () => {
  const env = setupDom()
  try {
    const { createSheet } = await import(bundlePath)
    const sheet = createSheet()

    // Both payloads have carried `recent` since the dispatch stage existed and
    // neither card read it, so a reader saw 86 days of transits and a sentence
    // defining the strait — never a word about what happened in them.
    sheet.showChokepoint({ ...CHOKEPOINT, recent: 'Transits fell after the tanker strike.' }, true)
    assert.match(sheet.element.textContent, /Transits fell after the tanker strike/)
    // The claim about the world takes lead weight; the definition steps down to
    // the rung `.map-sheet-standing` exists for. Rendering a definition at lead
    // size is what put the two on the card as equals.
    assert.match(
      sheet.element.querySelector('.map-sheet-lead').textContent,
      /Transits fell/,
      'the analysis leads',
    )
    assert.match(
      sheet.element.querySelector('.map-sheet-standing').textContent,
      /fifth of the world/,
      'the definition is the quiet rung',
    )

    sheet.showMarket({ ...EXCHANGE, recent: 'The index rose on Aramco’s results.' }, true)
    assert.match(sheet.element.querySelector('.map-sheet-lead').textContent, /Aramco/)
    assert.match(
      sheet.element.querySelector('.map-sheet-standing').textContent,
      /largest exchange by market value/,
    )

    // No analysis is a supported state, not a blank paragraph: the card is the
    // one it has always been.
    sheet.showChokepoint(CHOKEPOINT, true)
    assert.equal(sheet.element.querySelector('.map-sheet-lead'), null)
    assert.match(sheet.element.textContent, /fifth of the world/)

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

/**
 * A percent-quoted indicator, as `tickerEntries` builds one — thirty daily
 * observations ending on `asOf`, so a 3-day and a 7-day window are genuinely
 * different numbers and a floor applied to the wrong one is visible.
 */
const dailyLabels = (asOf, n) => {
  const end = Date.parse(`${asOf}T00:00:00Z`)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(end - (n - 1 - i) * 86_400_000)
    return `${d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })} ${d.getUTCDate()}`
  })
}

/**
 * The row and the card it opens report one window.
 *
 * `CARD_MIN_DAYS` floors what the chart may *draw*, because two observations in
 * a full-size figure read as a rendering fault. It floored the **hero** too, and
 * nothing caught it: measured on the built page at the map's default 3d, a
 * ceasefire row printed `+26 pts` and the card it opened printed `+43 pts` — the
 * "two numbers about one thing" failure that hero was rewritten to end, arriving
 * through a constant meant for the chart.
 *
 * It went unnoticed for as long as the rail also drew a line the reader could
 * compare shapes with. The rows draw no shape since 2026-08-07 and the figure is
 * the whole reading, so the press has to land on the same number. This asserts
 * the hero against the *rail's* arithmetic rather than against a literal, since
 * a literal here would be a third opinion about the same window.
 */
test('a company’s list is `Read from` only where its account was written from it', async () => {
  // An account can outlive its citations: the build then lists the stories
  // about the company under the same paragraph, and the card titled those
  // `Read from` too.
  const env = setupDom()
  try {
    const { createSheet } = await import(bundlePath)
    const company = (account) => ({
      id: 'co:test', group: 'companies', label: 'Test', name: 'Test', flag: '', unit: '$',
      level: 12, pct: 1, values: [10, 11, 12], periods: ['Oct 7', 'Oct 8', 'Oct 9'], asOf: '2026-10-09',
      account,
    })
    const related = [{ slug: 'a-story', title: 'A Story' }]
    const text = (account) => {
      const sheet = createSheet()
      sheet.showIndicator(company(account), true, 3, false)
      const out = sheet.element.textContent
      sheet.destroy()
      return out
    }
    assert.match(text({ recent: 'Why it moved.', related, cited: true }), /Read from/)
    const about = text({ recent: 'Why it moved.', related })
    assert.match(about, /Why it moved\./, 'the account still stands')
    assert.match(about, /Related coverage/)
    assert.doesNotMatch(about, /Read from/)
    assert.match(text({ related }), /Related coverage/)
  } finally {
    env.restore()
  }
})

test('a card’s table states each step the way its hero does', async () => {
  // An AI lab's card led with `+5.2 pts` and listed its releases as `+1.6%`:
  // the table took its kind from the unit, and `index points` is not `%`.
  const env = setupDom()
  try {
    const { createSheet } = await import(bundlePath)
    const lab = {
      id: 'ai:test', group: 'ai models', label: 'Model 3', name: 'A lab', flag: '',
      unit: 'index points', level: 156, pct: 1, step: 'releases', change: 'points',
      values: [140, 150, 156], periods: ['1 Jan 2026', '1 May 2026', '1 Sep 2026'], asOf: '2026-09-01',
      own: { pct: 1, figure: '+6.0 pts', period: 'over 90 days' }, account: {},
    }
    // The change column of the table, which is built when it is opened.
    const steps = (entry) => {
      const sheet = createSheet()
      sheet.showIndicator(entry, true, 3, false)
      const details = sheet.element.querySelector('.chart-data')
      details.open = true
      details.dispatchEvent(new env.window.Event('toggle'))
      const cells = [...sheet.element.querySelectorAll('.chart-table td.is-change')].map((td) => td.textContent)
      sheet.destroy()
      return cells.filter(Boolean)
    }
    const inPoints = steps(lab)
    assert.ok(inPoints.length >= 2, 'a row for each release after the first')
    assert.ok(inPoints.every((t) => /pts$/.test(t)), `a release is a step in points, got ${inPoints}`)
    // Unsaid, the unit decides as before: a rate in points, a price in per cent.
    const { change: _unsaid, ...bare } = lab
    assert.ok(steps({ ...bare, unit: '%' }).every((t) => /pts$/.test(t)))
    assert.ok(steps({ ...bare, unit: '$/mt' }).every((t) => /%$/.test(t)))

    // A monthly row is dated by its month. Its series is stamped the first,
    // and the card opened `central bank rates · 1 Sep`.
    const kickerOf = (entry) => {
      const sheet = createSheet()
      sheet.showIndicator(entry, true, 3, false)
      const text = sheet.element.querySelector('.map-sheet-kicker').textContent
      sheet.destroy()
      return text
    }
    const rate = { ...bare, group: 'central bank rates', unit: '%', step: 'months' }
    assert.match(kickerOf(rate), /September 2026$/)
    assert.doesNotMatch(kickerOf(rate), /1 Sep/)
    assert.match(kickerOf(lab), /1 Sep$/, 'a dated release keeps its day')

    // And a price in dollars is written the way the rail writes it.
    const priced = (entry) => {
      const sheet = createSheet()
      sheet.showIndicator(entry, true, 3, false)
      const out = sheet.element.querySelector('.chart-readout').textContent
      sheet.destroy()
      return out
    }
    assert.match(priced({ ...bare, unit: '$' }), /· \$156/, 'a bare sign leads its figure')
    assert.doesNotMatch(priced({ ...bare, unit: '$' }), /\d \$/)
    assert.match(priced({ ...bare, unit: '$/mt' }), /156(\.\d+)? \$\/mt/, 'a compound unit still follows it')
  } finally {
    env.restore()
  }
})

test('a card’s figure takes its row’s tone, and an inverted currency’s line its own unit', async () => {
  // A currency at `+0.02%` was green on its card and neutral on the rail: the
  // hero asked only whether the figure was under zero. And the chart read the
  // reciprocals it draws out under the level's unit, `0.000011 LBP / USD`.
  const env = setupDom()
  try {
    const { createSheet } = await import(bundlePath)
    const now = Date.now()
    const asOf = new Date(now).toISOString().slice(0, 10)
    const fx = (values) => ({
      id: 'fx-test', group: 'currencies', label: 'LBP', name: 'Lebanese pound', flag: '',
      unit: 'LBP / USD', seriesUnit: 'USD / LBP', level: 89561, pct: 0,
      values, periods: dailyLabels(asOf, values.length), asOf,
    })
    const card = (entry) => {
      const sheet = createSheet()
      sheet.showIndicator(entry, true, 7, false)
      const focal = sheet.element.querySelector('.map-sheet-hero-focal')
      const out = { tone: focal.className, readout: sheet.element.querySelector('.chart-readout').textContent }
      sheet.destroy()
      return out
    }
    const flat = card(fx([1, 1, 1, 1, 1, 1, 1.0002]))
    assert.equal(flat.tone, 'map-sheet-hero-focal', 'inside the flat band there is no way it went')
    assert.match(card(fx([1, 1, 1, 1, 1, 1, 1.02])).tone, /is-pos/)
    assert.match(card(fx([1, 1, 1, 1, 1, 1, 0.98])).tone, /is-neg/)
    assert.match(flat.readout, /USD \/ LBP/, 'the line is dollars to the pound')
    assert.doesNotMatch(flat.readout, /LBP \/ USD/)
  } finally {
    env.restore()
  }
})

test('the card’s figure is the row’s, even inside the chart’s floor', async () => {
  const env = setupDom()
  try {
    const { createSheet } = await import(bundlePath)
    const marketsPath = await bundleIsland(dir, 'public/islands/_map/markets.ts', 'mk.mjs')
    const { sparkInput, ribbonPoints } = await import(marketsPath)

    // Dated to *today*, because `showIndicator` reads the real clock and a
    // fixture pinned to a literal date would drift out of every window it names
    // and pass by comparing two fallbacks. The dates are the fixture's only
    // moving part; the shape below is fixed.
    const now = Date.now()
    const asOf = new Date(now).toISOString().slice(0, 10)
    // A shape that moves in opposite directions inside and outside three days,
    // so a window mix-up cannot pass by producing a similar number.
    const values = [40, 44, 48, 52, 56, 60, 58, 56]
    const entry = {
      id: 'poly-test', group: 'odds', label: 'A question', name: 'A question',
      unit: '%', level: 56, pct: -2, values, periods: dailyLabels(asOf, values.length),
      asOf, flag: '',
    }

    for (const days of [1, 3, 7, 30]) {
      const sheet = createSheet()
      sheet.showIndicator(entry, true, days, false)
      const focal = sheet.element.querySelector('.map-sheet-hero-focal')
      assert.ok(focal, `the card leads with a figure at ${days}d`)
      const shown = focal.textContent
      const drawn = sparkInput([entry], days, now, entry.edge)
      const expected = drawn?.ends
        ? ribbonPoints(drawn.ends[1] - drawn.ends[0])
        : null
      if (expected) {
        assert.ok(
          shown.includes(expected),
          `at ${days}d the card should print the row's ${expected}, got "${shown.slice(0, 40)}"`,
        )
      }
      sheet.destroy()
    }
  } finally {
    env.restore()
  }
})
