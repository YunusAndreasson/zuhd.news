// Mount/teardown smoke test for the situational-map island.
//
// The geometry is covered by map-geo.test.js; this covers the wiring — that
// the island builds its DOM, survives a render frame, responds to input, and
// removes everything it created on teardown. Without it, a typo in the mount
// path only shows up as a blank homepage.
//
// The map engine is MapLibre, which needs WebGL that jsdom does not have, so
// the bundle is built with a stub aliased in its place. That keeps this suite
// focused on what it can actually verify — the DOM wiring, the controls, the
// feed, and that teardown removes everything — while the rendering itself is
// checked visually via scripts/shoot.mjs.

import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const ROOT = new URL('../..', import.meta.url).pathname
const dir = mkdtempSync(join(tmpdir(), 'zuhd-map-island-'))
const bundlePath = join(dir, 'island.mjs')

// A MapLibre stand-in: records what the island asks of it, resolves 'load'
// asynchronously like the real thing, and needs no GPU.
const stubPath = join(dir, 'maplibre-stub.mjs')
writeFileSync(
  stubPath,
  `export class Map {
    constructor(opts) {
      this.opts = opts
      // NB: Map here is this stub class, not the global — use a plain object.
      this.sources = Object.create(null)
      this.layers = []
      this.handlers = {}
      this.filters = Object.create(null)
      this.layout = Object.create(null)
      this.featureState = Object.create(null)
      this.padding = null
      this.touchZoomRotate = { disableRotation() {} }
      queueMicrotask(() => {
        for (const f of this.handlers.load || []) f()
        for (const f of this.onceHandlers_load || []) f()
      })
    }
    on(ev, a, b) { (this.handlers[ev] ||= []).push(b || a) }
    once(ev, a, b) {
      if (ev === 'load') (this.onceHandlers_load ||= []).push(b || a)
      else this.on(ev, a, b)
    }
    off(ev, fn) {
      const list = this.handlers[ev]
      if (!list) return
      const i = list.indexOf(fn)
      if (i >= 0) list.splice(i, 1)
    }
    addSource(id, cfg) { this.sources[id] = { cfg, setData(d) { this.data = d } } }
    addLayer(l) { this.layers.push(l) }
    getLayer(id) { return this.layers.find((l) => l.id === id) }
    getSource(id) { return this.sources[id] }
    getCanvas() { return { style: {} } }
    setPaintProperty() {}
    setLayoutProperty(id, k, v) { (this.layout[id] ||= {})[k] = v }
    setFilter(id, f) { this.filters[id] = f }
    setFeatureState(ref, state) {
      Object.assign((this.featureState[ref.id] ||= {}), state)
    }
    setPadding(p) { this.padding = p }
    queryRenderedFeatures() { return [] }
    getZoom() { return 2 }
    getCenter() { return { lng: 12, lat: 22 } }
    flyTo() {}
    easeTo() {}
    isStyleLoaded() { return true }
    addControl() {}
    remove() { this.removed = true }
  }
  export class NavigationControl {}
  export class Popup {
    constructor(opts) { this.opts = opts; this.open = false }
    setLngLat() { return this }
    setDOMContent(node) { this.content = node; return this }
    addTo() { this.open = true; return this }
    remove() { this.open = false; return this }
    isOpen() { return this.open }
  }
  `,
)

await build({
  entryPoints: [join(ROOT, 'public/islands/situation-map.ts')],
  outfile: bundlePath,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  logLevel: 'silent',
  alias: { 'maplibre-gl': stubPath },
})
process.on('exit', () => rmSync(dir, { recursive: true, force: true }))

/** A no-op 2D context that records which operations were attempted. */
function stubContext() {
  const calls = []
  const target = {
    calls,
    canvas: null,
    setTransform: () => calls.push('setTransform'),
    clearRect: () => calls.push('clearRect'),
    fillRect: () => calls.push('fillRect'),
    fill: () => calls.push('fill'),
    stroke: () => calls.push('stroke'),
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    quadraticCurveTo: () => {},
    arc: () => {},
    save: () => {},
    restore: () => {},
    scale: () => {},
    translate: () => {},
    drawImage: () => calls.push('drawImage'),
    fillText: () => calls.push('fillText'),
    measureText: () => ({ width: 10 }),
  }
  // Style properties are assigned freely by the renderer.
  return new Proxy(target, {
    get: (t, k) => (k in t ? t[k] : typeof k === 'string' ? undefined : undefined),
    set: (t, k, v) => {
      t[k] = v
      return true
    },
  })
}

function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', {
    pretendToBeVisual: true,
    url: 'https://zuhd.news/',
  })
  const { window } = dom

  window.HTMLCanvasElement.prototype.getContext = function () {
    if (!this.__ctx) this.__ctx = stubContext()
    return this.__ctx
  }
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
  // jsdom's <dialog> support varies; make open/close observable either way.
  window.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  window.HTMLDialogElement.prototype.show = function () {
    this.setAttribute('open', '')
  }
  window.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
    this.dispatchEvent(new window.Event('close'))
  }
  // The island measures its container; jsdom reports zero for everything.
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return 1200
    },
  })
  Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return 600
    },
  })

  const globals = ['window', 'document', 'HTMLElement', 'Event', 'CustomEvent', 'Node']
  const saved = {}
  for (const k of globals) {
    saved[k] = globalThis[k]
    globalThis[k] = k === 'window' ? window : window[k]
  }
  // Frames are pumped by hand. Backing rAF with setTimeout would let the
  // island's self-rescheduling render loop run forever and hang the runner.
  const pending = []
  globalThis.requestAnimationFrame = (cb) => pending.push(cb)
  globalThis.cancelAnimationFrame = () => {
    pending.length = 0
  }
  const pump = (n = 3) => {
    for (let i = 0; i < n; i++) {
      const batch = pending.splice(0)
      for (const cb of batch) cb(i)
    }
  }
  globalThis.matchMedia = window.matchMedia
  globalThis.getComputedStyle = window.getComputedStyle.bind(window)
  globalThis.localStorage = window.localStorage
  globalThis.ResizeObserver = window.ResizeObserver
  // jsdom ships no Path2D; the renderer only builds and hands them to the
  // (stubbed) context, so a shape that swallows path commands is enough.
  globalThis.Path2D = class {
    moveTo() {}
    lineTo() {}
    closePath() {}
    arc() {}
    quadraticCurveTo() {}
  }
  globalThis.devicePixelRatio = 2
  globalThis.fetch = async () => ({ ok: false, json: async () => ({}) })

  return {
    window,
    pump,
    host: window.document.getElementById('host'),
    restore() {
      for (const k of globals) globalThis[k] = saved[k]
      dom.window.close()
    },
  }
}

/** Let pending promises (the data loads) settle. */
const settle = () => new Promise((r) => setTimeout(r, 5))

test('the island mounts, renders, and tears down cleanly', async () => {
  const env = setupDom()
  try {
    const { mount } = await import(bundlePath)
    const teardown = mount(env.host)

    assert.equal(env.host.classList.contains('map-root'), true, 'container should be marked')
    assert.ok(env.host.querySelector('.map-canvas-host'), 'map container present')
    assert.ok(env.host.querySelector('.map-hud'), 'HUD present')
    assert.ok(env.host.querySelector('.map-status'), 'status readout present')
    assert.ok(env.host.querySelector('.map-feed'), 'event rail present')

    // Four time-range presets. The map opens on 24h, not the full fortnight:
    // the widest range is the one view where nothing stands out, because the
    // dozen stories that broke today sit under 700-odd cold ones.
    const rangeBtns = [...env.host.querySelectorAll('.map-range')]
    assert.deepEqual(
      rangeBtns.map((b) => b.textContent),
      ['24h', '3d', '7d', '14d'],
    )
    const pressed = rangeBtns.filter((b) => b.getAttribute('aria-pressed') === 'true')
    assert.equal(pressed.length, 1, 'exactly one range is selected')
    assert.equal(pressed[0].textContent, '24h', '24h is the default')

    // Four category filters, all lit by default.
    const cats = env.host.querySelectorAll('.map-filter[data-kind="category"]')
    assert.equal(cats.length, 4)
    for (const f of cats) assert.equal(f.getAttribute('aria-pressed'), 'true')

    // Layer toggles exist alongside the category filters: disasters, straits
    // and conflict. Conflict is the one that was built and served but never
    // wired to the map, so its presence here is the regression guard.
    const layers = [...env.host.querySelectorAll('.map-filter[data-kind="layer"]')]
    assert.deepEqual(
      layers.map((b) => b.textContent),
      ['disasters', 'straits', 'conflict'],
    )
    for (const f of layers) assert.equal(f.getAttribute('aria-pressed'), 'true')

    await settle()
    assert.equal(typeof teardown, 'function', 'mount must return a teardown')
    teardown()
    assert.equal(env.host.children.length, 0, 'teardown must remove created DOM')
    assert.equal(env.host.classList.contains('map-root'), false)
    assert.equal(
      env.window.document.querySelectorAll('dialog.map-sheet').length,
      0,
      'teardown must remove the sheet from <body>',
    )
  } finally {
    env.restore()
  }
})

test('toggling a category filter never blanks the map', async () => {
  const env = setupDom()
  try {
    const { mount } = await import(bundlePath)
    const teardown = mount(env.host)
    const cats = [...env.host.querySelectorAll('.map-filter[data-kind="category"]')]

    // Turning every category off in turn must leave the last one lit.
    for (const f of cats) f.dispatchEvent(new env.window.Event('click', { bubbles: true }))
    const lit = cats.filter((f) => f.getAttribute('aria-pressed') === 'true')
    assert.equal(lit.length, 1, 'the final category must stay on')

    teardown()
  } finally {
    env.restore()
  }
})

test('a failed data fetch degrades to an empty map rather than throwing', async () => {
  const env = setupDom()
  globalThis.fetch = async () => {
    throw new Error('offline')
  }
  try {
    const { mount } = await import(bundlePath)
    const teardown = mount(env.host)
    env.pump()
    await settle()
    env.pump()
    // Still standing: the rail and map container survive a failed fetch.
    assert.ok(env.host.querySelector('.map-canvas-host'))
    assert.ok(env.host.querySelector('.map-feed'))
    teardown()
  } finally {
    env.restore()
  }
})
