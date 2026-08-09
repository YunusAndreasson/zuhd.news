// Nothing opens somewhere else.
//
// The site has one gesture for "tell me about this number" — a chip in a
// `follows` strip — and it had three different answers depending on where the
// reader happened to be standing: the map's story card unfolded it in place,
// the article page threw a 44rem `<dialog>` and a scrim over the sentence that
// raised the question, and the "full record →" at the foot of both walked the
// reader off to `/e/{id}` regardless. The last of those is the one worth a
// test: it is the disclosure undone at its own final line, it looks exactly
// like the link it used to be, and nothing about a rendered page reveals which
// of the two it is.
//
// So these drive the real modules against jsdom and assert the property rather
// than the markup: an ordinary click never navigates, and a modified click
// always can.

import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { bundleIsland, scratchDir } from './island-bundle.js'

const ROOT = new URL('../..', import.meta.url).pathname
const dir = scratchDir('disclosure')
const bundle = (entry, name) => bundleIsland(dir, entry, name)

const disclosurePath = await bundle('public/islands/_disclosure.ts', 'disclosure.mjs')
// `el` used to be exported from `_disclosure.ts`. It is `_dom.ts` now — five
// islands had their own copy of the same four lines, so it moved to the module
// that is only that.
const domPath = await bundle('public/islands/_dom.ts', 'dom.mjs')
const stripPath = await bundle('public/islands/entity-strip.ts', 'entity-strip.mjs')

/** `/api/entity/{id}.json`, trimmed to the fields these surfaces read. */
const RECORD = {
  id: 'brent',
  label: 'Brent crude',
  kind: 'DAILY',
  sourceLabel: 'FRED · EIA',
  unit: 'USD',
  currentFormatted: '$71.20',
  current: 71.2,
  deltaLabel: '−1.4%',
  deltaTone: 'neg',
  caption: 'FRED · EIA · daily',
  asOf: '2026-07-27',
  values: Array.from({ length: 40 }, (_, i) => 70 + Math.sin(i / 3) * 4),
  periods: Array.from({ length: 40 }, (_, i) => `2026-06-${String((i % 28) + 1).padStart(2, '0')}`),
  mentions: Array.from({ length: 30 }, (_, i) => ({
    slug: `2026-07-0${(i % 9) + 1}-story-${i}`,
    title: `Story ${i}`,
    date: '2026-07-29T07:48:05Z',
    dateFormatted: '29 July 2026',
    source: 'Reuters',
  })),
}

function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://zuhd.news/' })
  const { window } = dom

  // Reduced motion, deliberately: `growTo` returns before touching
  // `Element.animate` (which jsdom does not implement), and every assertion
  // here is about what the DOM ends up holding, not how long it took to get
  // there. The animated path is the same mutation with a measurement round it.
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} })
  window.Element.prototype.scrollIntoView = () => {}
  window.Element.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 })

  const globals = [
    'window',
    'document',
    'HTMLElement',
    'Element',
    'Event',
    'MouseEvent',
    'Node',
    'matchMedia',
    'DocumentFragment',
  ]
  const saved = {}
  for (const k of globals) {
    saved[k] = globalThis[k]
    globalThis[k] = k === 'window' ? window : window[k]
  }
  saved.fetch = globalThis.fetch
  // A stub answering exactly the two shapes the island reads. Cast because it
  // is deliberately not a whole Response.
  globalThis.fetch = /** @type {typeof fetch} */ (/** @type {unknown} */ (async (url) =>
    String(url).includes('/api/entity/')
      ? { ok: true, json: async () => RECORD }
      : { ok: false, json: async () => ({}) }))

  return {
    window,
    restore() {
      for (const k of globals) globalThis[k] = saved[k]
      globalThis.fetch = saved.fetch
      dom.window.close()
    },
  }
}

/** A click as a browser delivers one, so `defaultPrevented` means something. */
const click = (node, init = {}) => {
  const ev = new globalThis.MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    button: 0,
    ...init,
  })
  node.dispatchEvent(ev)
  return ev
}

/** Let the island's fetch and its two awaited growths settle. */
const settle = () => new Promise((r) => setTimeout(r, 0))

test('a chip opens the panel in place, and a second chip replaces it', async () => {
  const env = setupDom()
  try {
    const { disclosure } = await import(disclosurePath)
    const { el } = await import(domPath)
    const d = disclosure('panel')
    document.body.append(d.panel)

    const a = el('a', 'chip', 'A')
    const b = el('a', 'chip', 'B')
    document.body.append(a, b)
    d.bind('a', a, async () => ({ node: el('p', null, 'A body') }))
    d.bind('b', b, async () => ({ node: el('p', null, 'B body') }))

    assert.equal(a.getAttribute('aria-expanded'), 'false', 'a disclosure, announced as one')

    const ev = click(a)
    assert.equal(ev.defaultPrevented, true, 'an ordinary click never navigates')
    await settle()
    assert.equal(a.getAttribute('aria-expanded'), 'true')
    assert.equal(d.panel.hidden, false)
    assert.match(d.panel.textContent, /A body/)

    click(b)
    await settle()
    assert.equal(a.getAttribute('aria-expanded'), 'false', 'only one is open at a time')
    assert.equal(b.getAttribute('aria-expanded'), 'true')
    assert.match(d.panel.textContent, /B body/)
    assert.doesNotMatch(d.panel.textContent, /A body/, 'the panel is replaced, not appended to')

    click(b)
    await settle()
    assert.equal(d.panel.hidden, true, 'pressing the open chip folds it away')
    assert.equal(b.getAttribute('aria-expanded'), 'false')
  } finally {
    env.restore()
  }
})

test('a modified click is left to the browser, on the chip and on "full record"', async () => {
  const env = setupDom()
  try {
    const { disclosure, moreLink } = await import(disclosurePath)
    const { el } = await import(domPath)
    const d = disclosure('panel')
    document.body.append(d.panel)
    const chip = el('a', 'chip', 'A')
    chip.href = '/e/brent'
    document.body.append(chip)
    d.bind('a', chip, async () => ({ node: el('p', null, 'body') }))

    for (const mod of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { button: 1 }]) {
      const ev = click(chip, mod)
      assert.equal(
        ev.defaultPrevented,
        false,
        `${JSON.stringify(mod)} still reaches the canonical page`,
      )
    }
    await settle()
    assert.equal(d.panel.hidden, true, 'and none of them opened the panel')

    const box = el('div')
    document.body.append(box)
    const [link] = moreLink({
      labels: ['full record →', 'less ↑'],
      href: '/e/brent',
      box,
      linkClass: 'full',
      moreClass: 'more',
      fill: (into) => into.append(el('p', null, 'the rest')),
    })
    box.append(...[link])
    assert.equal(click(link, { metaKey: true }).defaultPrevented, false)
  } finally {
    env.restore()
  }
})

test('"full record" opens the rest here rather than at /e/{id}', async () => {
  const env = setupDom()
  try {
    const { moreLink } = await import(disclosurePath)
    const { el } = await import(domPath)
    const box = el('div')
    document.body.append(box)

    let fills = 0
    const nodes = moreLink({
      labels: ['full record →', 'less ↑'],
      href: '/e/brent',
      box,
      linkClass: 'full',
      moreClass: 'more',
      fill: (into) => {
        fills++
        into.append(el('p', null, 'the rest of the record'))
      },
    })
    box.append(...nodes)
    const [link, more] = nodes

    // The escape hatch it replaces: the href is still real, and still the
    // canonical page.
    assert.equal(link.getAttribute('href'), '/e/brent')
    assert.equal(more.hidden, true, 'closed to begin with')

    const ev = click(link)
    assert.equal(ev.defaultPrevented, true, 'the ordinary click stays on this page')
    await settle()
    assert.equal(more.hidden, false)
    assert.match(more.textContent, /the rest of the record/)
    assert.equal(link.textContent, 'less ↑', 'the label says which way it goes now')
    assert.equal(link.getAttribute('aria-expanded'), 'true')

    click(link)
    await settle()
    assert.equal(more.hidden, true, 'and it folds back')
    assert.equal(link.textContent, 'full record →')

    click(link)
    await settle()
    assert.equal(fills, 1, 'built once, kept — reopening does not rebuild it')
  } finally {
    env.restore()
  }
})

test("the article's follows chip unfolds the series under the strip", async () => {
  const env = setupDom()
  try {
    const { mount } = await import(stripPath)
    document.body.innerHTML = `
      <div class="article-entities-block">
        <aside class="article-entities">
          <span class="article-entities-label">Follows</span>
          <a class="article-entity-chip" href="/e/brent" data-id="brent">Brent crude</a>
        </aside>
      </div>`
    const block = document.querySelector('.article-entities-block')
    mount(block)

    const panel = /** @type {HTMLElement | null} */ (block.querySelector('.article-entity-panel'))
    assert.ok(panel, 'the panel is a sibling of the chip row, not inside its flex line')
    assert.equal(panel.hidden, true)

    const chip = block.querySelector('.article-entity-chip')
    const ev = click(chip)
    assert.equal(ev.defaultPrevented, true, 'the chip no longer navigates to /e/{id}')
    await settle()
    await settle()

    assert.equal(panel.hidden, false)
    assert.match(panel.textContent, /\$71\.20/, 'the current value')
    assert.match(panel.textContent, /−1\.4%/, 'and which way it moved')
    assert.ok(panel.querySelector('svg'), 'the series itself, drawn')

    // No dialog, no scrim: the whole reason this stopped being `entity-sheet`.
    assert.equal(document.querySelector('dialog'), null, 'nothing opens over the article')

    const full = panel.querySelector('.article-entity-full')
    assert.equal(full.getAttribute('href'), '/e/brent', 'still a real link for a modified click')
    click(full)
    await settle()
    const more = /** @type {HTMLElement} */ (panel.querySelector('.article-entity-more'))
    assert.equal(more.hidden, false)
    assert.match(more.textContent, /as of 2026-07-27/, 'when the last observation was taken')
    assert.match(more.textContent, /Cited in · 30/, 'and what cites it')
    assert.equal(
      more.querySelectorAll('.article-entity-mention-title').length,
      8,
      'eight rows, not thirty — the panel is an aside, not the entity page',
    )
  } finally {
    env.restore()
  }
})

test('no built page routes a reader into a chart dialog', () => {
  const dist = join(ROOT, 'dist')
  let checked = 0
  const pages = readdirSync(join(dist, 'a')).slice(0, 400)
  for (const f of pages) {
    if (!f.endsWith('.html')) continue
    const html = readFileSync(join(dist, 'a', f), 'utf8')
    // The class name also appears in the page's inlined stylesheet, so match
    // the markup rather than the string — a ruler as careless as the thing it
    // measures reports failures that are not there.
    if (!html.includes('class="article-entity-chip"')) continue
    checked++
    assert.doesNotMatch(
      html,
      /data-island="entity-sheet"/,
      `${f} still opens the chart as a modal over the article`,
    )
    assert.match(
      html,
      /data-island-auto="entity-strip"/,
      `${f} renders a chip row with nothing to unfold it`,
    )
    // The strip is a progressive enhancement, not a replacement: without the
    // bundle these are ordinary links to the canonical page.
    assert.match(html, /class="article-entity-chip" href="\/e\//, `${f} lost its real href`)
  }
  assert.ok(checked > 0, 'the sample has to contain some strips for this to mean anything')
})
