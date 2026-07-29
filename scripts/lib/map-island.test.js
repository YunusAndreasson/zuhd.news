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
      // Every instance, so a test can inspect what the island actually asked
      // the engine to draw. The stub is bundled *into* the island, so a global
      // is the only channel out of it.
      ;(globalThis.__zuhdMaps ||= []).push(this)
      // NB: Map here is this stub class, not the global — use a plain object.
      this.sources = Object.create(null)
      this.layers = []
      this.images = {}
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
    // Sprite registration for the no-data hatch. The stub lacked it, and the
    // island calls it partway through addDataLayers -- so every layer after
    // the hatch (stories, disasters, conflict, genocide) silently never got
    // added. That is the shape of the bug the guard in the island now covers,
    // and the stub has to be able to reach the code past it.
    // (No backticks in here: this class is itself inside a template literal.)
    addImage(id, img) { this.images[id] = img }
    hasImage(id) { return id in this.images }
    getLayer(id) { return this.layers.find((l) => l.id === id) }
    getSource(id) { return this.sources[id] }
    getCanvas() { return { style: {} } }
    setPaintProperty() {}
    setLayoutProperty(id, k, v) { (this.layout[id] ||= {})[k] = v }
    setFilter(id, f) { this.filters[id] = f }
    setFeatureState(ref, state) {
      Object.assign((this.featureState[ref.id] ||= {}), state)
    }
    // The island clears the whole source's state before every setData and only
    // writes it back once the source is settled -- feature state left across a
    // reload is replayed onto the rebuilt tiles by feature *position*, which is
    // how an ordinary scrub-while-hovering ended in "feature index out of
    // bounds" from inside MapLibre. The stub has to model both calls, and
    // isSourceLoaded, or the island throws here instead.
    // (No backticks in here either -- see the note above.)
    removeFeatureState(ref) {
      if (ref && ref.id != null) delete this.featureState[ref.id]
      else this.featureState = {}
    }
    isSourceLoaded(id) { return id in this.sources }
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
    constructor(opts) { this.opts = opts; this.open = false; this.handlers = {} }
    // MapLibre's Popup extends Evented and fires 'close' when it is removed —
    // including by its own × button, which is the only way the island can hear
    // about a reader dismissing a story card.
    on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this }
    off(ev, fn) {
      const list = this.handlers[ev]
      if (list) list.splice(list.indexOf(fn) >>> 0, 1)
      return this
    }
    fire(ev) { for (const f of this.handlers[ev] || []) f({ type: ev }) }
    setLngLat() { return this }
    setDOMContent(node) { this.content = node; return this }
    addTo() { this.open = true; return this }
    remove() {
      const was = this.open
      this.open = false
      if (was) this.fire('close')
      return this
    }
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
  // Mirrors the island bundler's own alias (scripts/build/islands.js) — the
  // map island pulls the GDACS severity parser from shared/ so the app and the
  // web sheet reduce `severityText` to the same focal number.
  alias: { 'maplibre-gl': stubPath, '@shared': join(ROOT, 'shared') },
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
    // The spec *queues* this event rather than firing it synchronously, and
    // the difference is load-bearing here: the map sheet promotes a hover peek
    // to a pinned modal by closing and re-showing, so a synchronous `close`
    // runs the handler before the promotion and hides a real ordering bug. See
    // map-sheet.test.js.
    queueMicrotask(() => this.dispatchEvent(new window.Event('close')))
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

  // `Element` is here because the island narrows event targets with
  // `instanceof` — a real document has every one of these and a harness that
  // omits one turns a correct guard into a ReferenceError jsdom swallows.
  const globals = ['window', 'document', 'Element', 'HTMLElement', 'Event', 'CustomEvent', 'Node']
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

    // Layer toggles exist alongside the category filters. Conflict is the one
    // that was built and served but never wired to the map, so its presence
    // here is the regression guard. The order is the order they are drawn in,
    // and is asserted rather than sorted so that adding a layer is a deliberate
    // edit to this line — `thermal` sits next to `disasters` because it shares
    // that layer's hue one step lighter, and the pair is only legible adjacent.
    const layers = [...env.host.querySelectorAll('.map-filter[data-kind="layer"]')]
    assert.deepEqual(
      layers.map((b) => b.textContent),
      ['prayers', 'disasters', 'thermal', 'straits', 'markets', 'conflict'],
    )
    for (const f of layers) assert.equal(f.getAttribute('aria-pressed'), 'true')

    // The prayer chip carries the calculation method. The lines are drawn to
    // one school's angles and no single method is right everywhere, so a chip
    // that names the layer without naming the authority is making a claim it
    // does not attribute.
    const prayers = layers[0]
    assert.match(prayers.title, /Umm al-Qura/, 'the prayer chip names its method')
    assert.match(prayers.getAttribute('aria-label') ?? '', /Umm al-Qura/)

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

/**
 * Every mark the alphabet registers is drawn by a layer.
 *
 * This is the guard whose absence let the mark alphabet ship half-built.
 * `glyphs.ts` authored `hazard`, `strait-rest/pinch/surge` and `conflict-mark`,
 * `addImage` registered all four, and the HUD chips rendered them as SVG — while
 * `gdacs-marks`, `chokepoint-marks` and `conflict-marks` stayed `circle` layers
 * that never referenced them. So each of those chips promised a silhouette its
 * own layer did not draw: the legend-drifting-from-the-mark failure the module
 * exists to prevent, running backwards. Nothing failed, because the images were
 * valid and the chips were right, and nothing asked whether anything used them.
 *
 * Asserted against what the island actually handed the engine, rather than by
 * reading the source, because the question is not whether a name appears in the
 * file — it did — but whether a layer draws it.
 */
test('every registered glyph is drawn by a layer, not only by its chip', async () => {
  const env = setupDom()
  globalThis.__zuhdMaps = []
  try {
    const { mount } = await import(bundlePath)
    const teardown = mount(env.host)
    env.pump()
    await settle()

    const map = globalThis.__zuhdMaps.at(-1)
    assert.ok(map, 'the island should have constructed a map')

    // Which glyphs reach `icon-image`, walking the expression rather than
    // assuming a bare string: three of these layers pick their mark with a
    // `['case', …]`.
    const used = new Set()
    const walk = (v) => {
      if (typeof v === 'string') used.add(v)
      else if (Array.isArray(v)) for (const x of v) walk(x)
    }
    for (const layer of map.layers) walk(layer.layout?.['icon-image'])

    // `dot` and `prayer-line` are chip-only by design — a circle layer whose
    // hover reads feature-state, and a line layer MapLibre dashes natively.
    for (const id of Object.keys(map.images)) {
      if (id === 'nodata-hatch') continue
      assert.ok(used.has(id), `glyph '${id}' is registered as an image but no layer draws it`)
    }
    assert.ok(used.has('thermal'), 'the thermal mark should be drawn')
    assert.ok(used.has('hazard'), 'the disaster mark should be the hazard triangle')
    assert.ok(used.has('conflict-mark'), 'the conflict mark should be the square')
    assert.ok(used.has('strait-pinch'), 'a pinched strait should narrow its channel')

    teardown()
  } finally {
    delete globalThis.__zuhdMaps
    env.restore()
  }
})

/**
 * Symbols collide where circles never did, and both flags are load-bearing.
 *
 * `icon-allow-overlap` because `queryRenderedFeatures` only returns *placed*
 * symbols — a collided conflict mark is not merely invisible, it is unhoverable,
 * and its card can never open. `icon-ignore-placement` because a circle layer
 * was never in the collision index at all: without it several thousand conflict
 * marks would begin deleting the country and city names beneath them.
 *
 * Both are silent failures on a live map and neither shows up in a screenshot of
 * a quiet day, which is why they are pinned here.
 */
test('every symbol mark layer opts out of collision, both ways', async () => {
  const env = setupDom()
  globalThis.__zuhdMaps = []
  try {
    const { mount } = await import(bundlePath)
    const teardown = mount(env.host)
    env.pump()
    await settle()

    const map = globalThis.__zuhdMaps.at(-1)
    const MARKS = ['gdacs-marks', 'thermal-marks', 'chokepoint-marks', 'conflict-marks', 'market-marks']
    for (const id of MARKS) {
      const layer = map.getLayer(id)
      assert.ok(layer, `${id} should be added`)
      assert.equal(layer.type, 'symbol', `${id} should draw a glyph, not a circle`)
      assert.equal(layer.layout['icon-allow-overlap'], true, `${id} may be suppressed on collision`)
      assert.equal(
        layer.layout['icon-ignore-placement'],
        true,
        `${id} would push the basemap's own labels out of the way`,
      )
    }

    // The dated overlays move with the scrub head. A satellite pass happened at
    // a moment, so thermal is one of them — leaving it pinned to the present
    // while the stories rewind is the quiet lie the time filters exist to stop.
    for (const id of ['gdacs-marks', 'conflict-marks', 'thermal-marks']) {
      assert.ok(map.filters[id], `${id} should carry a time filter`)
    }
    // Chokepoints and markets are statements about now, and genocide is a
    // condition rather than an event. None of them may be filtered by time.
    for (const id of ['chokepoint-marks', 'market-marks', 'genocide-marks']) {
      assert.equal(map.filters[id], undefined, `${id} must not be filtered by time`)
    }

    teardown()
  } finally {
    delete globalThis.__zuhdMaps
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
