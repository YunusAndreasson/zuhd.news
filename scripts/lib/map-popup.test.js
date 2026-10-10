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

/** Open `story` in a fresh card and hand back its DOM. */
const openCard = async (story, p = point) => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://zuhd.news/' })
  dom.window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} })
  for (const k of ['window', 'document', 'HTMLElement', 'Node', 'matchMedia', 'location']) {
    Object.defineProperty(globalThis, k, { configurable: true, writable: true, value: dom.window[k] })
  }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true, value: dom.window.navigator })
  globalThis.fetch = /** @type {typeof fetch} */ (
    /** @type {unknown} */ (async () => ({ ok: true, json: async () => story }))
  )
  const { createStoryPopup } = await import(`${bundlePath}?${Math.random()}`)
  const popup = createStoryPopup({ on() {}, off() {} })
  await popup.open(p, Date.now())
  return globalThis.__card
}

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
