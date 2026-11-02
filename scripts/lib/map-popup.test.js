// The story card: what it says about who reported a story.
//
// `_map/popup.ts` needs MapLibre only for the `Popup` it puts its content in,
// so it is bundled against a stub of that one class and driven through its own
// public surface (`open`), with `fetch` answering for the story. Nothing here
// needs a GPU or the island.

import test from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
import { bundleIsland, scratchDir } from './island-bundle.js'

const dir = scratchDir('map-popup')
const stubPath = join(dir, 'maplibre-stub.mjs')
writeFileSync(
  stubPath,
  `
  export class Popup {
    constructor() { this.open = false; this.handlers = {} }
    on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this }
    off() { return this }
    setLngLat() { return this }
    setDOMContent(node) { this.content = node; globalThis.__card = node; return this }
    addTo() { this.open = true; return this }
    remove() {
      const was = this.open
      this.open = false
      if (was) for (const f of this.handlers.close || []) f()
      return this
    }
    isOpen() { return this.open }
    getElement() { return null }
  }
  `,
)
const bundlePath = await bundleIsland(dir, 'public/islands/_map/popup.ts', 'popup.mjs', {
  'maplibre-gl': stubPath,
})

const point = { slug: 's', title: 'A Story', cat: 'politics', loc: 'Somewhere', t: Date.now(), lat: 0, lng: 0, c: 0, n: 1 }

const storyOf = (over) => ({
  slug: 's',
  title: 'A Story',
  date: '2026-10-10T00:00:00Z',
  dateFormatted: '10 October 2026',
  category: 'politics',
  location: 'Somewhere',
  eventCoverage: 0,
  bodyHtml: '<p>Body.</p>',
  sentimentDivergence: null,
  sources: [],
  ...over,
})

/**
 * Open `story` in a fresh card and hand back its DOM.
 *
 * `entities` answers `/api/entity/{id}.json` by id; an id it does not hold is a
 * 404, which is what a series the build no longer publishes looks like.
 */
const openCard = async (story, p = point, entities = {}) => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://zuhd.news/' })
  // Reduced motion, so `growTo` returns before `Element.animate`, which jsdom
  // does not implement. Every assertion here is about what the card holds.
  dom.window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} })
  globalThis.__scrolls = 0
  dom.window.Element.prototype.scrollIntoView = () => {
    globalThis.__scrolls++
  }
  for (const k of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'MouseEvent', 'matchMedia', 'location']) {
    Object.defineProperty(globalThis, k, { configurable: true, writable: true, value: dom.window[k] })
  }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true, value: dom.window.navigator })
  globalThis.fetch = /** @type {typeof fetch} */ (
    /** @type {unknown} */ (
      async (url) => {
        const entity = /\/api\/entity\/(.+)\.json$/.exec(String(url))
        if (!entity) return { ok: true, json: async () => story }
        const record = entities[decodeURIComponent(entity[1])]
        return record ? { ok: true, json: async () => record } : { ok: false, json: async () => ({}) }
      }
    )
  )
  const { createStoryPopup } = await import(`${bundlePath}?${Math.random()}`)
  const popup = createStoryPopup(fakeMap())
  await popup.open(p, Date.now())
  await settle()
  // Kept for a test that opens the same story again, with its records in hand.
  globalThis.__popup = popup
  return globalThis.__card
}

/** The map a card is opened on: listeners, and the canvas `fit` sizes it to. */
const fakeMap = () => {
  const host = document.createElement('div')
  return { on() {}, off() {}, project: () => ({ x: 0, y: 0 }), getCanvas: () => host, getContainer: () => host }
}

/** Let a fetch and the growth behind it settle. */
const settle = () => new Promise((r) => setTimeout(r, 0))

/** A click as a browser delivers one, so `defaultPrevented` means something. */
const click = (node, init = {}) => {
  const ev = new globalThis.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init })
  node.dispatchEvent(ev)
  return ev
}

/** `/api/entity/{id}.json`, trimmed to what the card reads. */
const series = (over) => ({
  id: 'brent',
  label: 'Brent crude',
  kind: 'DAILY',
  unit: '$/bbl',
  currentFormatted: '125 $/bbl',
  caption: 'FRED · EIA · daily',
  values: [80, 90, 100, 125],
  periods: ['Jul 13', 'Aug 1', 'Sep 1', 'Oct 6'],
  ...over,
})

const outlet = (name, over = {}) => ({ name, url: `https://${name}.example/a`, country: 'GB', sentiment: 0, ...over })

test('the card ends on one folded line of names, with no promise of framing when none is recorded', async () => {
  const card = await openCard(storyOf({ sources: [outlet('one'), outlet('two')] }))
  const details = card.querySelector('details.map-popup-framing')
  assert.equal(details.open, false)
  const line = details.querySelector('summary.map-popup-sources-flat')
  assert.equal(line.querySelector('.map-popup-sources-label').textContent, 'Sources')
  assert.equal(line.querySelector('.map-popup-sources-names').textContent, 'one, two')
  assert.equal(line.querySelector('.map-popup-sources-more'), null, 'no angle, no "how each framed it"')
  assert.equal(line.querySelector('a'), null, 'no link inside the summary: a control in a control')
  // The links are in the rows, with the date line, behind the fold.
  assert.deepEqual([...details.querySelectorAll('a.map-popup-source-name')].map((a) => a.textContent), ['one', 'two'])
  assert.ok(details.querySelector('.map-popup-meta'), 'the date and where it was filed from are in the fold')
})

test('one outlet with an angle is folded like any other, with no note', async () => {
  const card = await openCard(
    storyOf({ sources: [outlet('one', { sentiment: -0.4, angle: 'emphasizes the casualty count' })] }),
  )
  // What the outlet made of the story is the reader's to ask for, on every
  // card: the article page folds a single outlet under the same words.
  const details = card.querySelector('details.map-popup-framing')
  assert.equal(details.open, false)
  assert.equal(details.querySelector('.map-popup-sources-more').textContent, 'how each framed it')
  // Nothing to compare, so no sentence about outlets differing.
  assert.equal(card.querySelector('.map-popup-framing-note'), null)
  // The card still ends on who reported it, in the one line.
  assert.match(details.querySelector('summary').textContent, /Sources\s*one/)
  const row = details.querySelector('.map-popup-source')
  assert.equal(row.querySelector('a.map-popup-source-name').getAttribute('href'), 'https://one.example/a')
  assert.equal(row.querySelector('.map-popup-source-tone').textContent, 'leans critical')
  assert.equal(row.querySelector('.map-popup-source-angle').textContent, 'emphasizes the casualty count')
})

test('several outlets are folded under the article page’s words, and a neutral lean prints no word', async () => {
  const card = await openCard(
    storyOf({
      sentimentDivergence: 0.1,
      sources: [
        outlet('one', { sentiment: 0.05, angle: 'leads with the minister’s statement' }),
        outlet('two', { sentiment: 0.5, angle: 'adds the opposition’s reply' }),
        outlet('three', { sentiment: null }),
      ],
    }),
  )
  const details = card.querySelector('details.map-popup-framing')
  assert.equal(details.open, false, 'an ordinary story keeps its rows folded')
  assert.equal(details.querySelector('.map-popup-sources-names').textContent, 'one, two, three')
  assert.equal(details.querySelector('.map-popup-sources-more').textContent, 'how each framed it')
  assert.equal(details.querySelector('.map-popup-framing-note'), null)
  const rows = [...details.querySelectorAll('.map-popup-source')]
  // The order the story lists them in: nothing is contested, so nothing is ranked.
  assert.deepEqual(rows.map((r) => r.querySelector('.map-popup-source-name').textContent), ['one', 'two', 'three'])
  assert.equal(rows[0].querySelector('.map-popup-source-tone'), null, 'neutral is the usual case and says nothing')
  assert.equal(rows[1].querySelector('.map-popup-source-tone').textContent, 'leans favorable')
  assert.equal(rows[2].querySelector('.map-popup-source-tone'), null, 'unrated is not neutral, and says nothing either')
  assert.equal(rows[2].querySelector('.map-popup-source-angle'), null)
  // One line holds the names, so an outlet is never named twice outside the rows.
  assert.equal(card.querySelectorAll('.map-popup-sources-flat').length, 1)
  // No number: the lean is a machine estimate and is given as a word or not at all.
  assert.doesNotMatch(details.textContent, /[+−-]?\d\.\d\d/)
})

test('a card does not scroll itself to its sources; a reader opening them does', async () => {
  // A `toggle` no press preceded is not the reader's. The rows of a contested
  // story once opened with the card, and the event that queued, answered like
  // a reader's, scrolled the card past its own title and prose.
  const sources = [
    outlet('critic', { sentiment: -0.6, angle: 'calls the claim unverified' }),
    outlet('ally', { sentiment: 0.7, angle: 'reports the advance as fact' }),
  ]
  const card = await openCard(storyOf({ sentimentDivergence: 0.52, sources }))
  const details = card.querySelector('details.map-popup-framing')
  assert.equal(details.open, false, 'folded, a contested story too')
  details.open = true
  details.dispatchEvent(new globalThis.window.Event('toggle'))
  await settle()
  assert.equal(globalThis.__scrolls, 0, 'opened by no press, it moved nothing')

  // Shut and opened by the reader: now the rows are below a fold, and follow.
  const summary = details.querySelector('summary')
  for (const open of [false, true]) {
    click(summary)
    details.open = open
    details.dispatchEvent(new globalThis.window.Event('toggle'))
  }
  assert.equal(globalThis.__scrolls, 1, 'once, for the opening and not for the shutting')
})

test('a contested story keeps its rows folded, ordered by lean, under the shared sentence', async () => {
  const { divergenceNote } = await import(
    await bundleIsland(dir, 'shared/source-framing.ts', 'framing.mjs')
  )
  const sources = [
    outlet('critic', { sentiment: -0.6, angle: 'calls the claim unverified' }),
    outlet('unrated', { sentiment: null, angle: 'reprints the wire' }),
    outlet('ally', { sentiment: 0.7, angle: 'reports the advance as fact' }),
  ]
  const card = await openCard(storyOf({ sentimentDivergence: 0.52, sources }))
  const details = card.querySelector('details.map-popup-framing')
  assert.equal(details.open, false, 'the card is opened for the story; the outlets are a press away')
  assert.equal(details.querySelector('.map-popup-framing-note').textContent, divergenceNote(0.52, 3))
  assert.deepEqual(
    [...details.querySelectorAll('.map-popup-source-name')].map((n) => n.textContent),
    ['ally', 'critic', 'unrated'],
  )

  // The map's own figure stands in when the story payload has none: the ring
  // was drawn from `d`, so the card must account for it from `d`.
  const fromPoint = await openCard(storyOf({ sources }), { ...point, d: 0.4 })
  assert.equal(fromPoint.querySelector('details.map-popup-framing').open, false)
  assert.equal(fromPoint.querySelector('.map-popup-framing-note').textContent, divergenceNote(0.4, 3))
})

// --- the chart a story names ------------------------------------------------

test('a story that names a chart draws it between its title and its prose', async () => {
  const card = await openCard(storyOf({ chart: 'brent' }), point, { brent: series() })
  const block = card.querySelector('a.map-popup-chart')
  assert.ok(block, 'the block is there')
  // Title, chart, prose: the series is what the story is about, and the prose
  // is read against it.
  const kids = [...card.children]
  const at = kids.indexOf(block)
  assert.ok(at > kids.findIndex((n) => n.tagName === 'H2'), 'under the title')
  assert.ok(at < kids.indexOf(card.querySelector('.map-popup-prose')), 'above the prose')

  assert.equal(block.getAttribute('href'), '/e/brent', 'a real address, for every click that is not a plain one')
  assert.equal(block.querySelector('.map-popup-chart-label').textContent, 'Brent crude')
  assert.equal(block.querySelector('.map-popup-chart-reading').textContent, '125 $/bbl')
  // Last against first over the line that is drawn: 80 to 125.
  assert.equal(block.querySelector('.map-popup-chart-move').textContent, '+56.3%')
  assert.ok(block.classList.contains('is-pos'))
  assert.ok(block.querySelector('svg.spark'), 'a line, not the full figure')
  // And the dates that line runs between, which is the period the move is over.
  assert.deepEqual([...block.querySelector('.map-popup-chart-span').children].map((n) => n.textContent), ['Jul 13', 'Oct 6'])
})

test('a story that names no chart draws the first series it follows, and that chip leaves', async () => {
  const story = storyOf({
    entities: [
      { id: 'co:aramco', label: 'Aramco' },
      { id: 'brent', label: 'Brent' },
      { id: 'us-10y', label: 'US 10Y' },
    ],
  })
  const card = await openCard(story, point, { brent: series() })
  const block = card.querySelector('a.map-popup-chart')
  assert.ok(block, 'a series it follows is drawn, not left behind a chip')
  assert.equal(block.getAttribute('href'), '/e/brent', 'the first with a record: a company has none')
  assert.deepEqual([...card.querySelectorAll('.map-entity-chip')].map((c) => c.textContent), ['Aramco', 'US 10Y'])
})

test('a rate moves in points', async () => {
  const rate = await openCard(storyOf({ chart: 'us-10y' }), point, {
    'us-10y': series({ id: 'us-10y', label: 'US 10y Treasury', unit: '%', currentFormatted: '5.22 %', values: [4.62, 4.9, 5.22], periods: ['Jul 13', 'Aug 20', 'Oct 8'] }),
  })
  // 4.62 to 5.22 is sixty basis points, not 13% of anything.
  assert.equal(rate.querySelector('.map-popup-chart-move').textContent, '+0.60 pts')

  // A strait's id needs encoding, and its series is drawn as it is published:
  // the build has already made it the week's mean.
  const strait = await openCard(storyOf({ chart: 'cp:hormuz' }), point, {
    'cp:hormuz': series({ id: 'cp:hormuz', label: 'Strait of Hormuz', unit: 'vessels/day', currentFormatted: '5 vessels/day', values: [10, 8, 5], periods: ['Sep 7', 'Sep 10', 'Sep 14'] }),
  })
  const block = strait.querySelector('.map-popup-chart')
  assert.equal(block.getAttribute('href'), '/e/cp%3Ahormuz')
  assert.equal(block.querySelector('.map-popup-chart-reading').textContent, '5 vessels/day')
  assert.equal(block.querySelector('.map-popup-chart-move').textContent, '−50.0%')
  assert.ok(block.classList.contains('is-neg'))
})

test('the chart’s own series leaves the follows strip, and the two folds take turns', async () => {
  const story = storyOf({
    chart: 'brent',
    entities: [
      { id: 'brent', label: 'Brent' },
      { id: 'us-10y', label: 'US 10Y' },
    ],
  })
  const card = await openCard(story, point, {
    brent: series(),
    'us-10y': series({ id: 'us-10y', label: 'US 10y Treasury', unit: '%', values: [4.6, 5.2], periods: ['Jul 13', 'Oct 8'] }),
  })
  const chips = [...card.querySelectorAll('.map-entity-chip')]
  assert.deepEqual(chips.map((c) => c.textContent), ['US 10Y'], 'one way into a series, not two')

  const block = card.querySelector('.map-popup-chart')
  const chartPanel = block.nextElementSibling
  assert.equal(chartPanel.hidden, true)

  // A modified click belongs to the browser: the block is a link to `/e/brent`.
  assert.equal(click(block, { metaKey: true }).defaultPrevented, false)
  assert.equal(chartPanel.hidden, true)

  assert.equal(click(block).defaultPrevented, true)
  await settle()
  assert.equal(block.getAttribute('aria-expanded'), 'true')
  assert.equal(chartPanel.hidden, false, 'the full figure opens under the block, in the card')
  assert.ok(chartPanel.querySelector('svg'), 'and it is the series panel a chip opens')

  click(chips[0])
  await settle()
  assert.equal(block.getAttribute('aria-expanded'), 'false', 'opening the strip’s panel shuts the chart’s')
  assert.equal(chartPanel.hidden, true)

  // The only chip was the chart's: no strip at all, not a label over nothing.
  const alone = await openCard(storyOf({ chart: 'brent', entities: [{ id: 'brent', label: 'Brent' }] }), point, { brent: series() })
  assert.equal(alone.querySelector('.map-popup-entities'), null)
})

test('a chart that does not arrive leaves its chip, and a company’s is never asked for', async () => {
  // The strip gives up the charted series' chip because the chart is the way
  // in. When the chart fails, the chip is the only way in.
  const entities = [{ id: 'brent', label: 'Brent' }, { id: 'us-10y', label: 'US 10Y' }]
  const failed = await openCard(storyOf({ chart: 'brent', entities }))
  assert.equal(failed.querySelector('.map-popup-chart'), null)
  assert.deepEqual([...failed.querySelectorAll('.map-entity-chip')].map((c) => c.textContent), ['Brent', 'US 10Y'])

  // Drawn at once, from a record already in hand (the ordinary path, after the
  // preview's prefetch): the chip is gone before the strip is placed, and a
  // strip of one is no strip.
  const first = await openCard(storyOf({ chart: 'brent', entities: [entities[0]] }), point, { brent: series() })
  assert.equal(first.querySelector('.map-popup-entities'), null)
  await globalThis.__popup.open(point, Date.now())
  await settle()
  const again = globalThis.__card
  assert.ok(again.querySelector('.map-popup-chart svg.spark'), 'the second opening draws from the cache')
  assert.equal(again.querySelector('.map-popup-entities'), null, 'and places no empty strip')

  // A company has a card in the app and no series page here. The block held
  // its height, the fetch 404ed on every open, and the prose jumped.
  let asked = 0
  const company = await openCard(storyOf({ chart: 'co:aramco' }))
  const realFetch = globalThis.fetch
  globalThis.fetch = /** @type {typeof fetch} */ (
    (input, init) => {
      asked++
      return realFetch(input, init)
    }
  )
  await globalThis.__popup.open(point, Date.now())
  await settle()
  assert.equal(company.querySelector('.map-popup-chart'), null)
  assert.equal(globalThis.__card.querySelector('.map-popup-chart'), null)
  assert.equal(asked, 0, 'no request for a record that cannot exist')
})

test('no chart, no block; and a series that cannot be drawn takes its block away', async () => {
  const plain = await openCard(storyOf({ sources: [outlet('one')] }))
  assert.equal(plain.querySelector('.map-popup-chart'), null)

  // The build no longer publishes it.
  const gone = await openCard(storyOf({ chart: 'retired' }))
  assert.equal(gone.querySelector('.map-popup-chart'), null)
  // And its empty fold goes with it: the prose follows the title directly. (The
  // prose keeps a fold of its own after it, for the country tags.)
  assert.ok(
    !gone.querySelector('.map-popup-prose').previousElementSibling.classList.contains('map-popup-entity-panel'),
    'the chart’s fold was left behind',
  )

  // One observation is a dot, not a line.
  const dot = await openCard(storyOf({ chart: 'brent' }), point, { brent: series({ values: [80], periods: ['Oct 6'] }) })
  assert.equal(dot.querySelector('.map-popup-chart'), null)
})

test('the card names the country it is about, and lets go of it', async () => {
  await openCard(storyOf({}))
  const told = []
  const { createStoryPopup } = await import(`${bundlePath}?${Math.random()}`)
  const popup = createStoryPopup(fakeMap(), { onCountry: (iso) => told.push(iso) })
  await popup.openCountry('SD', [30, 15])
  await popup.openCountry('SD', [31, 16])
  assert.deepEqual(told, ['SD'], 'told once, when the card became about Sudan')
  // A story replaces the country card without closing it.
  await popup.open(point, Date.now())
  assert.deepEqual(told, ['SD', null])
  await popup.openCountry('TD', [19, 15])
  popup.close()
  assert.deepEqual(told, ['SD', null, 'TD', null], 'closing the card lets go of Chad')
})

/** `/api/country/{ISO2}.json`, trimmed to what the card reads. */
const profile = (iso2, name) => ({ iso2, name, flag: '', region: 'Northern Africa', metaLine: '', highlights: [{ label: 'Population', value: 52_000_000, rank: 28, total: 176 }], coverage: [] })

/** A country card opened against `hazards` for `/api/country-hazards.json`, or a failed fetch of it when null. */
const openCountryCard = async (iso, hazards) => {
  await openCard(storyOf({}))
  globalThis.fetch = /** @type {typeof fetch} */ (
    /** @type {unknown} */ (
      async (url) => {
        if (String(url).endsWith('/api/country-hazards.json')) {
          return hazards ? { ok: true, json: async () => ({ countries: hazards }) } : { ok: false, json: async () => ({}) }
        }
        const m = /\/api\/country\/([A-Z]{2})\.json$/.exec(String(url))
        return { ok: true, json: async () => profile(m?.[1], m?.[1] === 'SD' ? 'Sudan' : 'Chad') }
      }
    )
  )
  const { createStoryPopup } = await import(`${bundlePath}?${Math.random()}`)
  const popup = createStoryPopup(fakeMap())
  await popup.openCountry(iso, [30, 15])
  return globalThis.__card
}

test('a country card states what the hazard sources count there, above its rankings', async () => {
  const card = await openCountryCard('SD', {
    SD: {
      hunger: { analysed: 47_535_794, p3plus: 19_466_533, p5: 134_808, vintage: 'Jan 2026' },
      conflict: { events: 6, killed: 57, civilians: 33, windowStart: '2026-08-25', windowEnd: '2026-08-31' },
      alerts: [{ level: 'Orange', name: 'Flood in Sudan' }],
      lowerAlerts: 2,
    },
  })
  const facts = [...card.querySelectorAll('.map-country-fact')].map((li) => li.textContent)
  assert.deepEqual(facts, [
    'hunger19.5 million people in crisis or worse41% of the 47.5 million analysed · 134,808 in catastrophe · IPC, Jan 2026',
    'conflict6 events · 57 killed · 33 civilians' + 'Aug 25–31, the latest week from UCDP',
    'alertsFlood in Sudan (orange)and 2 at the lowest level · GDACS',
  ])
  const facts$ = card.querySelector('.map-country-facts')
  const metrics = card.querySelector('.map-country-metrics')
  assert.ok(facts$.compareDocumentPosition(metrics) & globalThis.Node.DOCUMENT_POSITION_FOLLOWING, 'the facts come before the rankings')
})

test('a country nothing is counted in, or a hazards file that fails, is a card without the block', async () => {
  const quiet = await openCountryCard('TD', { SD: { alerts: [], lowerAlerts: 1 } })
  assert.equal(quiet.querySelector('.map-country-facts'), null)
  assert.ok(quiet.querySelector('.map-country-metrics'), 'the rankings still stand')
  const failed = await openCountryCard('SD', null)
  assert.equal(failed.querySelector('.map-country-facts'), null)
  assert.ok(failed.querySelector('.map-country-metrics'))
})

test('a source URL that is not a web address is no link', async () => {
  const card = await openCard(
    storyOf({ sources: [outlet('good'), outlet('bad', { url: 'javascript:alert(1)' })] }),
  )
  const names = [...card.querySelectorAll('.map-popup-source-name')]
  const named = (text) => names.find((n) => n.textContent === text)
  assert.equal(named('good').tagName, 'A')
  assert.equal(named('bad').tagName, 'SPAN')
})

test('a story still loading does not land on the preview of the next one pressed', async () => {
  await openCard(storyOf({}))
  const popup = globalThis.__popup
  let answer = () => {}
  globalThis.fetch = /** @type {typeof fetch} */ (
    /** @type {unknown} */ (
      (url) =>
        String(url).includes('slow')
          ? new Promise((resolve) => {
              answer = () => resolve({ ok: true, json: async () => storyOf({ title: 'Slow' }) })
            })
          : Promise.resolve({ ok: false, json: async () => ({}) })
    )
  )
  const opening = popup.open({ ...point, slug: 'slow', title: 'Slow' }, Date.now())
  popup.preview({ ...point, slug: 'next', title: 'Next' }, {}, Date.now())
  answer()
  await opening
  await settle()
  assert.match(globalThis.__card.textContent, /Next/)
  assert.doesNotMatch(globalThis.__card.textContent, /Slow/)
})
