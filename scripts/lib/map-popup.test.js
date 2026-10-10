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
    remove() { this.open = false; return this }
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
  dom.window.Element.prototype.scrollIntoView = () => {}
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
  const popup = createStoryPopup({ on() {}, off() {} })
  await popup.open(p, Date.now())
  await settle()
  return globalThis.__card
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

test('with no angle recorded and nothing contested, the card ends on the flat line of names', async () => {
  const card = await openCard(storyOf({ sources: [outlet('one'), outlet('two')] }))
  assert.equal(card.querySelector('.map-popup-framing'), null)
  assert.equal(card.querySelector('.map-popup-sources'), null)
  const flat = card.querySelector('.map-popup-sources-flat')
  assert.match(flat.textContent, /Sources/)
  assert.deepEqual([...flat.querySelectorAll('a')].map((a) => a.textContent), ['one', 'two'])
})

test('one outlet with an angle is shown open, with no control and no note', async () => {
  const card = await openCard(
    storyOf({ sources: [outlet('one', { sentiment: -0.4, angle: 'emphasizes the casualty count' })] }),
  )
  // Nothing to compare, so nothing to fold and no sentence about outlets differing.
  assert.equal(card.querySelector('details'), null)
  assert.equal(card.querySelector('.map-popup-framing-note'), null)
  assert.equal(card.querySelector('.map-popup-sources-flat'), null)
  assert.equal(card.querySelector('.map-popup-section').textContent, 'Source')
  const row = card.querySelector('.map-popup-source')
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
  assert.equal(details.querySelector('summary').textContent, 'How each outlet framed it')
  assert.equal(details.querySelector('.map-popup-framing-note'), null)
  const rows = [...details.querySelectorAll('.map-popup-source')]
  // The order the story lists them in: nothing is contested, so nothing is ranked.
  assert.deepEqual(rows.map((r) => r.querySelector('.map-popup-source-name').textContent), ['one', 'two', 'three'])
  assert.equal(rows[0].querySelector('.map-popup-source-tone'), null, 'neutral is the usual case and says nothing')
  assert.equal(rows[1].querySelector('.map-popup-source-tone').textContent, 'leans favorable')
  assert.equal(rows[2].querySelector('.map-popup-source-tone'), null, 'unrated is not neutral, and says nothing either')
  assert.equal(rows[2].querySelector('.map-popup-source-angle'), null)
  // The names still end the card while the fold is shut; the stylesheet hides
  // this line when it is open.
  assert.equal(details.nextElementSibling.className, 'map-popup-sources-flat')
  // No number: the lean is a machine estimate and is given as a word or not at all.
  assert.doesNotMatch(details.textContent, /[+−-]?\d\.\d\d/)
})

test('a contested story opens its rows, ordered by lean, under the shared sentence', async () => {
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
  assert.equal(details.open, true, 'the ring on the map is a question; the card answers it unasked')
  assert.equal(details.querySelector('.map-popup-framing-note').textContent, divergenceNote(0.52, 3))
  assert.deepEqual(
    [...details.querySelectorAll('.map-popup-source-name')].map((n) => n.textContent),
    ['ally', 'critic', 'unrated'],
  )

  // The map's own figure stands in when the story payload has none: the ring
  // was drawn from `d`, so the card must account for it from `d`.
  const fromPoint = await openCard(storyOf({ sources }), { ...point, d: 0.4 })
  assert.equal(fromPoint.querySelector('details.map-popup-framing').open, true)
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
