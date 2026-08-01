// The event rail: its refresh control, and the read state that greys a row.
//
// `_map/feed.ts` and `_map/read-state.ts` are DOM-only, so they are bundled and
// driven on their own against jsdom — the same arrangement `map-sheet.test.js`
// uses, and for the same reason: none of this needs MapLibre.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { bundleIslands, scratchDir } from './island-bundle.js'

const dir = scratchDir('map-feed')
const bundlePath = await bundleIslands(
  dir,
  [
    'public/islands/_map/feed.ts',
    'public/islands/_map/read-state.ts',
    'public/islands/_map/timeline.ts',
  ],
  'feed.mjs',
)

const setupDom = () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://zuhd.news/' })
  const store = new Map()
  Object.defineProperty(dom.window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    },
  })
  dom.window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
  for (const k of ['window', 'document', 'HTMLElement', 'Node', 'matchMedia', 'localStorage', 'self']) {
    globalThis[k] = k === 'self' ? dom.window : dom.window[k]
  }
  globalThis.clearTimeout = dom.window.clearTimeout.bind(dom.window)
  return { dom, store }
}

const point = (slug, t = Date.now()) => ({
  slug,
  title: `Story ${slug}`,
  cat: 'politics',
  loc: 'Somewhere',
  t,
  lat: 0,
  lng: 0,
})

// --- read state ------------------------------------------------------------

test('the read record is local, bounded, and survives a reload', async () => {
  const { store } = setupDom()
  const { createReadState } = await import(bundlePath)

  const a = createReadState()
  assert.equal(a.has('one'), false)
  assert.equal(a.mark('one'), true, 'marking returns whether it changed anything')
  assert.equal(a.mark('one'), false, 'marking twice is not a change')
  assert.equal(a.has('one'), true)

  // A second instance reads what the first wrote — this is what makes the
  // greying survive a page load, which is the entire point of it.
  assert.equal(createReadState().has('one'), true)

  // It lives in exactly one key, and that key holds slugs and nothing else. If
  // this ever grows a timestamp or a count it becomes a behavioural record
  // rather than a list of what has been seen.
  assert.deepEqual([...store.keys()], ['zuhd:read'])
  assert.deepEqual(JSON.parse(store.get('zuhd:read')), ['one'])

  a.clear()
  assert.equal(a.has('one'), false)
})

test('the read record drops its oldest entries rather than growing forever', async () => {
  setupDom()
  const { createReadState } = await import(bundlePath)
  const s = createReadState()
  for (let i = 0; i < 700; i++) s.mark(`slug-${i}`)
  assert.equal(s.size(), 600, 'capped')
  assert.equal(s.has('slug-0'), false, 'the oldest went first')
  assert.equal(s.has('slug-699'), true, 'the newest is kept')
})

test('storage being unavailable costs the greying, not the rail', async () => {
  const { dom } = setupDom()
  Object.defineProperty(dom.window, 'localStorage', {
    configurable: true,
    get() {
      // Safari with cookies disabled throws on access rather than returning
      // null. The map must not care.
      throw new Error('blocked')
    },
  })
  globalThis.localStorage = undefined
  const { createReadState } = await import(bundlePath)
  const s = createReadState()
  assert.doesNotThrow(() => s.mark('one'))
  assert.equal(s.has('one'), true, 'still works for this session, just not beyond it')
})

// --- the rail --------------------------------------------------------------

test('a read story is greyed in two channels and said in words', async () => {
  setupDom()
  const { createFeed } = await import(bundlePath)
  const read = new Set(['seen'])
  const feed = createFeed({
    onSelect() {},
    onHover() {},
    isRead: (slug) => read.has(slug),
  })
  feed.setItems([point('seen'), point('fresh')], Date.now())

  const seen = feed.element.querySelector('[data-slug="seen"]')
  const fresh = feed.element.querySelector('[data-slug="fresh"]')
  assert.ok(seen.classList.contains('is-read'))
  assert.ok(!fresh.classList.contains('is-read'))

  // Colour alone would leave this invisible to anyone who cannot separate two
  // greys, and inaudible to anyone listening to the page. The dot carries the
  // category as `--cat` so the stylesheet can hollow it without naming a hue,
  // and the row says "read" out loud.
  assert.equal(seen.querySelector('.map-feed-dot').style.getPropertyValue('--cat'), '#d2604a')
  assert.match(seen.querySelector('.sr-only').textContent, /read/i)
  assert.equal(fresh.querySelector('.sr-only'), null)

  // Marking after the fact does the same thing, without a rebuild.
  feed.setRead('fresh')
  assert.ok(fresh.classList.contains('is-read'))
  assert.match(fresh.querySelector('.sr-only').textContent, /read/i)

  // And it cannot stack: marking twice must not append a second announcement.
  feed.setRead('fresh')
  assert.equal(fresh.querySelectorAll('.sr-only').length, 1)
})

test('a read story is greyed, never hidden or reordered', async () => {
  setupDom()
  const { createFeed } = await import(bundlePath)
  const feed = createFeed({ onSelect() {}, onHover() {}, isRead: () => true })
  const now = Date.now()
  feed.setItems([point('a', now), point('b', now - 1000), point('c', now - 2000)], now)

  // The rail captions the map. Dropping or demoting a story the reader has seen
  // would leave a beacon on the map with no row to match it.
  const order = [...feed.element.querySelectorAll('.map-feed-item')].map((li) => li.dataset.slug)
  assert.deepEqual(order, ['a', 'b', 'c'])
  assert.match(feed.element.querySelector('.map-feed-count').textContent, /3 stories/)
})

test('the refresh control is a sibling of the handle, not a child of it', async () => {
  setupDom()
  const { createFeed } = await import(bundlePath)
  let presses = 0
  const feed = createFeed({ onSelect() {}, onHover() {}, onRefresh: () => presses++ })

  // A <button> inside a <button> is invalid, and browsers resolve it by
  // dropping the inner one — which would have left refresh unclickable on the
  // phone layout, the one place the handle is a button at all.
  const refresh = feed.element.querySelector('.map-feed-refresh')
  assert.ok(refresh, 'refresh control exists')
  assert.equal(refresh.closest('button'), refresh, 'it is not nested inside another button')
  assert.equal(feed.element.querySelector('.map-feed-head').tagName, 'DIV')

  refresh.click()
  assert.equal(presses, 1)
})

test('the refresh control says what it found, including nothing', async () => {
  setupDom()
  const { createFeed } = await import(bundlePath)
  const feed = createFeed({ onSelect() {}, onHover() {} })
  const refresh = feed.element.querySelector('.map-feed-refresh')
  const label = () => feed.element.querySelector('.map-feed-refresh-label').textContent

  assert.equal(label(), 'refresh')

  feed.setRefreshState('busy')
  assert.equal(refresh.disabled, true, 'a second press cannot land mid-flight')
  assert.ok(refresh.classList.contains('is-busy'))

  // The answer most presses deserve, and the one a spinner alone never gives:
  // without it, "found nothing" and "failed" look identical.
  feed.setRefreshState(0)
  assert.equal(refresh.disabled, false)
  assert.equal(label(), 'nothing new')

  feed.setRefreshState(3)
  assert.equal(label(), '+3 new')

  feed.setRefreshState('error')
  assert.equal(label(), 'try again')
})

// --- the scrubber's live edge ----------------------------------------------

test('a fresh scrubber knows it is live before anyone touches it', async () => {
  // The bug this pins, found by driving the real map. The island used to keep
  // its own `timelineLive` flag, written only from the scrubber's `onChange` —
  // which fires on a gesture and nothing else. So on a page nobody had scrubbed
  // yet, the flag was an assumption, and refresh read it as "the reader has
  // scrubbed away", declined to follow the new window, and left the new stories
  // outside the visible slice. The button reported "+1 new" over a rail that
  // did not contain it, which is the worst kind of wrong: it looked like it
  // worked.
  setupDom()
  const { createTimeline } = await import(bundlePath)
  const end = Date.UTC(2026, 6, 25, 21, 15)
  const start = end - 14 * 86_400_000

  const fresh = createTimeline({ start, end, onChange() {} })
  assert.equal(fresh.isLive(), true, 'a new scrubber is at the live edge')

  // And the other half: rebuilt with a held position, it reports scrubbed — so
  // a refresh leaves a reader who *has* scrubbed exactly where they were.
  const held = createTimeline({
    start,
    end,
    value: end - 3 * 86_400_000,
    onChange() {},
  })
  assert.equal(held.isLive(), false, 'a restored position is not the live edge')

  // A held position from an older window can sit before the new start once the
  // fortnight rolls forward; it clamps into the rail rather than going negative.
  const stale = createTimeline({ start, end, value: start - 5 * 86_400_000, onChange() {} })
  assert.equal(stale.isLive(), false)
})
