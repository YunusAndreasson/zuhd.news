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
import { JSDOM } from 'jsdom'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { bundleIsland, scratchDir } from './island-bundle.js'

const dir = scratchDir('map-island')

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
    // beforeId is recorded, because for two layers it is the whole design and
    // not a detail: the density wash has to go under the borders so a coastline
    // draws through it, and the prayer lines have to go under them for the same
    // reason. Insertion order into this array is not the style order, so the
    // anchor is the only thing a test can hold.
    addLayer(l, before) { this.layers.push(l); l.__before = before }
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
      this.stateWrites = (this.stateWrites || 0) + 1
      Object.assign((this.featureState[ref.id] ||= {}), state)
    }
    // The island clears the whole source's state before every setData and only
    // writes it back once the source is settled -- feature state left across a
    // reload is replayed onto the rebuilt tiles by feature *position*, which is
    // how an ordinary scrub-while-hovering ended in "feature index out of
    // bounds" from inside MapLibre. The stub has to model both calls, and
    // isSourceLoaded, or the island throws here instead.
    // (No backticks in here either -- see the note above.)
    // Counted, not just applied. In MapLibre both of these end in _update(),
    // which dirties the source and schedules a render whether or not anything
    // actually changed -- so a handler on 'idle' that clears unconditionally
    // re-triggers 'idle' forever. What a test has to be able to see is the
    // *call*, not its effect, because the effect of the redundant call is
    // nil by definition.
    removeFeatureState(ref) {
      this.stateWrites = (this.stateWrites || 0) + 1
      if (ref && ref.id != null) delete this.featureState[ref.id]
      else this.featureState = {}
    }
    isSourceLoaded(id) { return id in this.sources }
    setPadding(p) { this.padding = p }
    queryRenderedFeatures() { return [] }
    getZoom() { return 2 }
    getCenter() { return { lng: 12, lat: 22 } }
    getBearing() { return 0 }
    getPitch() { return 0 }
    resize() {}
    setMinZoom() {}
    // A real perspective-sphere projection, and it has to be real.
    //
    // The sky solves the camera from this and nothing else -- it deliberately
    // does not read MapLibre's transform internals -- and it refuses to draw
    // at all when the three-point check says the answer is not a sphere
    // camera. So a stub returning zeros, or a linear one, would leave the
    // whole painter silently unexercised: no stars, no halo, no bodies, and a
    // passing test. f and d are a desktop-shaped camera.
    project(lngLat) {
      var D = Math.PI / 180
      var f = 1369, d = 3.17, cx = 600, cy = 300
      var unit = function (lng, lat) {
        var a = lng * D, b = lat * D, k = Math.cos(b)
        return [k * Math.cos(a), k * Math.sin(a), Math.sin(b)]
      }
      var dot = function (u, v) { return u[0] * v[0] + u[1] * v[1] + u[2] * v[2] }
      var c = this.getCenter()
      var C = unit(c.lng, c.lat)
      var n = [-C[2] * C[0], -C[2] * C[1], 1 - C[2] * C[2]]
      var nl = Math.hypot(n[0], n[1], n[2]) || 1
      n = [n[0] / nl, n[1] / nl, n[2] / nl]
      var e = [
        n[1] * C[2] - n[2] * C[1],
        n[2] * C[0] - n[0] * C[2],
        n[0] * C[1] - n[1] * C[0],
      ]
      var p = unit(lngLat[0], lngLat[1])
      var th = Math.acos(Math.max(-1, Math.min(1, dot(p, C))))
      var r = f * Math.sin(th) / (d - Math.cos(th))
      var pe = dot(p, e), pn = dot(p, n)
      var l = Math.hypot(pe, pn) || 1
      return { x: cx + pe / l * r, y: cy - pn / l * r }
    }
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
  // The worker-pool lifecycle. Recorded rather than ignored, because the pair
  // has to stay a pair: \`prewarm\` without \`clearPrewarmedResources\` leaves a
  // worker running for a page that no longer has a map on it.
  export function prewarm() { globalThis.__zuhdPrewarm = (globalThis.__zuhdPrewarm || 0) + 1 }
  export function clearPrewarmedResources() {
    globalThis.__zuhdPrewarm = (globalThis.__zuhdPrewarm || 0) - 1
  }
  `,
)

// `@shared` comes from the harness and mirrors the island bundler's own alias
// (scripts/build/islands.js) — the map island pulls the GDACS severity parser
// from shared/ so the app and the web sheet reduce `severityText` to the same
// focal number.
const bundlePath = await bundleIsland(dir, 'public/islands/situation-map.ts', 'island.mjs', {
  'maplibre-gl': stubPath,
})

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
    // The sky's own calls. Without these the Proxy hands back `undefined` and
    // the painter dies on the first frame — which, since the island swallows
    // nothing, would surface as a mount failure rather than a missing sky.
    ellipse: () => {},
    rotate: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }),
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
  // jsdom reports a zero box for everything, and the sky sizes its buffer from
  // one — so without this it measures 0×0, returns before it has drawn
  // anything, and every assertion about it passes against a canvas that never
  // ran. `clientWidth`/`clientHeight` below are stubbed for the same reason;
  // this is the same lie told to the one caller that asks a different way.
  window.HTMLCanvasElement.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, top: 0, left: 0, right: 1200, bottom: 600, width: 1200, height: 600, toJSON() {} }
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
  globalThis.Path2D = /** @type {any} */ (class {
    moveTo() {}
    lineTo() {}
    closePath() {}
    arc() {}
    quadraticCurveTo() {}
  })
  globalThis.devicePixelRatio = 2
  globalThis.fetch = /** @type {typeof fetch} */ (/** @type {unknown} */ (async () => ({ ok: false, json: async () => ({}) })))

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

    // Four time-range presets, and the map opens on neither end of them. Not the
    // full fortnight, because the widest range is the one view where nothing
    // stands out — 700-odd mostly cold stories burying the dozen that broke
    // today. And not 24h either, which measured at 29 stories against a real
    // payload and about seven twelve hours after a build: a near-empty world
    // under a rail reading "29 STORIES", and far too few points to raise a
    // density field from. 3d is 135.
    const rangeBtns = [...env.host.querySelectorAll('.map-range')]
    assert.deepEqual(
      rangeBtns.map((b) => b.textContent),
      ['24h', '3d', '7d', '14d'],
    )
    const pressed = rangeBtns.filter((b) => b.getAttribute('aria-pressed') === 'true')
    assert.equal(pressed.length, 1, 'exactly one range is selected')
    assert.equal(pressed[0].textContent, '3d', '3d is the default')

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
      ['prayers', 'disasters', 'thermal', 'straits', 'markets', 'conflict', 'famine'],
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
    const MARKS = [
      'gdacs-marks',
      'thermal-marks',
      'chokepoint-marks',
      'conflict-marks',
      'market-marks',
      'famine-marks',
    ]
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
    // Chokepoints and markets are statements about now; genocide and famine are
    // conditions rather than events. None of them may be filtered by time — an
    // IPC classification was as true on Tuesday as it is at the live edge, so
    // scrubbing back must not take a district out of Emergency.
    for (const id of ['chokepoint-marks', 'market-marks', 'genocide-marks', 'famine-marks']) {
      assert.equal(map.filters[id], undefined, `${id} must not be filtered by time`)
    }

    teardown()
  } finally {
    delete globalThis.__zuhdMaps
    env.restore()
  }
})

/**
 * No layer aggregates stories across places.
 *
 * The guard against reintroduction. Supercluster's `clusterRadius: 30` is screen
 * pixels, which at the zoom this map opens at is about nine degrees of longitude
 * — measured, that put **92% of the corpus inside a merged disc**, and the
 * largest of them read `116` while standing at a coordinate no story held,
 * merging Washington with New York, Atlanta and 23 more datelines. Another merged
 * Gaza with Cairo, Beirut and Damascus.
 *
 * It could not be escaped either: coordinates here are city-level and 445 of 705
 * stories share one exactly, so `expandCluster` offered a descent that no amount
 * of zooming could deliver.
 *
 * Cheap to re-enable by accident — one key on one source — so it is asserted from
 * three directions rather than one.
 */
test('no layer aggregates stories across places', async () => {
  const env = setupDom()
  globalThis.__zuhdMaps = []
  try {
    const { mount } = await import(bundlePath)
    const teardown = mount(env.host)
    env.pump()
    await settle()

    const map = globalThis.__zuhdMaps.at(-1)
    const stories = map.sources.stories
    assert.ok(stories, 'the stories source should exist')
    assert.ok(!stories.cfg.cluster, 'stories must not be clustered')
    assert.equal(stories.cfg.clusterProperties, undefined, 'no cluster aggregation')
    assert.equal(stories.cfg.clusterRadius, undefined)
    for (const l of map.layers) {
      assert.ok(!/cluster/.test(l.id), `${l.id} should not be a cluster layer`)
      assert.ok(
        !JSON.stringify(l.filter ?? null).includes('point_count'),
        `${l.id} should not filter on point_count`,
      )
    }

    teardown()
  } finally {
    delete globalThis.__zuhdMaps
    env.restore()
  }
})

/**
 * The wash is a ground and the numeral is a mark.
 *
 * Two layers replaced the discs and each has one property doing the load-bearing
 * work, neither of which shows up in a screenshot of a quiet day.
 *
 * The field's is its **anchor**. Inserted under `borders`, a coastline draws
 * straight through a patch, which is what makes the wash the only thing on this
 * map with no edge — and an edge is how a reader separates it from a country
 * shaded by the ground metric, which is the same neutral blue-grey family. Move
 * it above the borders and that distinction of *kind* silently becomes a
 * distinction of degree.
 *
 * The numeral's is that it **may be dropped**. That is the exact inverse of the
 * cluster count's policy, which had to be `allow-overlap` because a disc with no
 * numeral was an empty container saying nothing — and being kept out of the
 * collision index entirely is how a market tick's "1.6%" once landed flush
 * against a "3" and rendered "31.6%". A stack of dots with no numeral is still a
 * complete mark, so this one queues like any other label.
 *
 * Also pinned: the threshold lives in `text-field`, never in a layer `filter`. A
 * filter would delete the feature, and the feature is what raises the wash.
 */
test('the density wash is a ground, and the place numeral is a droppable mark', async () => {
  const env = setupDom()
  globalThis.__zuhdMaps = []
  try {
    const { mount } = await import(bundlePath)
    const teardown = mount(env.host)
    env.pump()
    await settle()

    const map = globalThis.__zuhdMaps.at(-1)

    // The source the field reads is ours, and is not the basemap's. `places` is
    // already taken by the world's own cities; overwriting it would replace them
    // with our datelines.
    assert.ok(map.sources['story-places'], 'the places source should exist')
    assert.notEqual(
      map.sources['story-places'],
      map.sources.places,
      'the field must not be reading the basemap place labels',
    )

    const field = map.getLayer('story-density')
    assert.ok(field, 'story-density should be added')
    assert.equal(field.type, 'heatmap')
    assert.equal(field.source, 'story-places')
    assert.equal(field.__before, 'borders', 'the wash goes under the frontiers and the labels')
    assert.equal(field.filter, undefined, 'the wash is filtered by its data, never by a layer')

    // The wash is the one layer whose kernels are sized in *screen* pixels, so
    // on the sphere they compress toward the limb. Every figure it is calibrated
    // against — GAUSS_COEF, `placeDensity(1) = 0.085`, the 1.20 top stop — was
    // measured on the globe, so it has to have faded out by the time the
    // projection reaches the plane. Otherwise the tail of the scale is being
    // read on a projection nothing tuned it for, and a wash is exactly the kind
    // of layer that goes subtly wrong without going visibly wrong.
    // Read off the style the island actually handed the engine, rather than
    // imported — this way the assertion is against what ships, and it fails if
    // the projection stops and the layer ever stop being derived from the same
    // constant.
    const projection = map.opts.style.projection.type
    const plane = projection[projection.length - 2]
    const opacity = field.paint['heatmap-opacity']
    const fadeOut = opacity[opacity.length - 2]
    assert.equal(projection[projection.length - 1], 'mercator', 'the plane is the far stop')
    assert.equal(opacity[opacity.length - 1], 0, 'the wash must end fully transparent')
    assert.ok(
      fadeOut <= plane,
      `the wash fades out at ${fadeOut}, after the plane arrives at ${plane}`,
    )

    // The old glow and the discs are gone, not merely unused.
    for (const id of ['story-glow', 'story-clusters', 'story-cluster-count']) {
      assert.equal(map.getLayer(id), undefined, `${id} should be gone`)
    }

    const numeral = map.getLayer('story-place-count')
    assert.ok(numeral, 'story-place-count should be added')
    assert.equal(numeral.type, 'symbol')
    assert.equal(numeral.source, 'story-places')
    assert.equal(numeral.layout['text-allow-overlap'], false, 'the numeral may be dropped')
    assert.equal(numeral.layout['text-ignore-placement'], false, 'and it occupies space')
    // `text-optional` is a no-op on a text-only layer — it means "draw the icon
    // even if the text does not fit", and there is no icon here. Shipping it
    // would be config promising something it does not do, which is the same
    // defect class as a glyph registered and drawn by nothing.
    assert.equal(numeral.layout['text-optional'], undefined, 'no no-op collision config')
    assert.equal(numeral.filter, undefined, 'the count threshold belongs in text-field')
    assert.ok(
      JSON.stringify(numeral.layout['text-field']).includes('zoom'),
      'the threshold steps with zoom inside text-field',
    )

    teardown()
  } finally {
    delete globalThis.__zuhdMaps
    env.restore()
  }
})

/**
 * Every hit-testable layer has exactly one stated precedence.
 *
 * This pins the fix for a bug that had been live and unreported. Handlers were
 * registered per layer, and MapLibre gives each registration its own
 * `queryRenderedFeatures` over its own layers — so two could both find a feature
 * under one pointer and both fire. Clicking the story aggregate over London flew
 * the camera *and* pinned the London Stock Exchange, because `market-marks` draws
 * above the stories and exchanges sit in exactly the cities that generate the
 * most stories.
 *
 * There is one handler now, resolving through `HIT_ORDER`. A layer in one list
 * and not the other is a bug in either direction: hittable with no stated
 * precedence, or ranked but never queried.
 */
/**
 * The famine layer's own invariants.
 *
 * Three of these pin decisions that a later edit would find perfectly reasonable
 * to undo, and each was a live finding rather than a precaution. The layer is
 * absent from the time filters because a classification is a condition; it draws
 * above the stories because IPC areas sit in exactly the places that generate the
 * most coverage; and its phase-to-glyph mapping is a `match` in the layer rather
 * than a property on the feature, because a `['get', …]` image is invisible to
 * the walk that guards the whole alphabet.
 */
test('the famine layer draws a phase, above the stories, outside the scrubber', async () => {
  const env = setupDom()
  globalThis.__zuhdMaps = []
  try {
    const { mount } = await import(bundlePath)
    const teardown = mount(env.host)
    env.pump()
    await settle()

    const map = globalThis.__zuhdMaps.at(-1)
    const layer = map.getLayer('famine-marks')
    assert.ok(layer, 'famine-marks should be added')

    // The three silhouettes the publication bar can produce, and no others: the
    // bar admits Phase 3 only for an area with a Catastrophe caseload, so a
    // reader can meet any of 3, 4 or 5 and must not meet 1 or 2.
    const image = JSON.stringify(layer.layout['icon-image'])
    for (const id of ['famine-3', 'famine-4', 'famine-5']) {
      assert.ok(image.includes(id), `famine-marks should draw ${id}`)
    }
    for (const id of ['famine-1', 'famine-2']) {
      assert.ok(!image.includes(id), `${id} is below the publication bar and must not be drawn`)
    }

    // Draw order. Above the stories for the reason `market-marks` is: a story
    // pile survives a glyph crossing it and a single famine mark, covered, is
    // simply absent. Below genocide, the one mark nothing may cover.
    const ids = map.layers.map((l) => l.id)
    assert.ok(
      ids.indexOf('famine-marks') > ids.indexOf('story-points'),
      'famine marks must draw above the story beacons',
    )
    assert.ok(
      ids.indexOf('famine-marks') < ids.indexOf('genocide-marks'),
      'nothing may draw over the genocide mark',
    )

    teardown()
  } finally {
    delete globalThis.__zuhdMaps
    env.restore()
  }
})

test('the hit test and its precedence describe the same set of layers', async () => {
  const { MARKER_LAYERS, HIT_ORDER } = await import(bundlePath)
  assert.equal(
    new Set(HIT_ORDER).size,
    HIT_ORDER.length,
    'a layer may not appear twice in the precedence',
  )
  assert.deepEqual(
    [...HIT_ORDER].sort(),
    [...MARKER_LAYERS].sort(),
    'every hittable layer is ranked, and every ranked layer is hittable',
  )
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

/**
 * Country hover is feature state, not a filter.
 *
 * It was a filter, rewritten inside the `mousemove` handler, for as long as the
 * layer had existed. A filter change ends in `Style._updateLayer`, which marks
 * the layer's whole source `'reload'` — so moving the pointer across Africa
 * re-bucketed `countries`, which is 1.6 MB and 99k points, once per country.
 *
 * The rule was already written down one layer up, for the story beacons: hover
 * is `promoteId` + `setFeatureState`, "not a `setPaintProperty` rewrite per
 * pointer move". It had simply never been applied here, and nothing could
 * notice — a filter rewrite is correct, just expensive, so the map looked right
 * the whole time.
 *
 * Asserting the *absence* of a filter rather than the presence of an expression,
 * because the failure being guarded against is the cheap fix coming back: a
 * `global-state` expression looks modern and would be just as bad, since
 * `global-state` inside a paint property that also reads `['get', …]` is
 * data-driven, and `setPaintProperty` returns `isDataDriven` as its
 * `requiresRelayout` flag.
 */
test('country hover paints from feature state and adds no filter', async () => {
  const env = setupDom()
  globalThis.__zuhdMaps = []
  try {
    const { mount } = await import(bundlePath)
    const teardown = mount(env.host)
    env.pump()
    await settle()

    const map = globalThis.__zuhdMaps.at(-1)
    const hover = map.getLayer('country-hover')
    assert.ok(hover, 'country-hover should be added')
    assert.equal(
      hover.filter,
      undefined,
      'country-hover must not carry a filter — that is the per-pointer-move reload',
    )
    assert.equal(
      map.filters['country-hover'],
      undefined,
      'and nothing may setFilter it afterwards either',
    )

    const opacity = JSON.stringify(hover.paint['fill-opacity'])
    assert.match(opacity, /feature-state/, 'the hover bit has to come from feature state')
    assert.doesNotMatch(
      opacity,
      /global-state/,
      'global-state here is data-driven and would reload the source exactly like the filter did',
    )

    teardown()
  } finally {
    delete globalThis.__zuhdMaps
    env.restore()
  }
})

test('an idle tick with nothing to change writes nothing to the map', async () => {
  // The map is a static picture until someone touches it, and MapLibre only
  // draws a frame when something has told it to. Both `idle` handlers cleared
  // their source's feature state unconditionally, and in MapLibre
  // `removeFeatureState` ends in `_update()` whether or not it removed
  // anything -- so each idle tick dirtied a source, scheduled a render, and
  // fired `idle` again. Measured on hardware that was 56.8 renders/second and
  // ~57% of a core, indefinitely, on a map showing no animation at all.
  //
  // The assertion is deliberately about *writes attempted*, not about the
  // resulting state: a redundant clear leaves the state identical, which is
  // exactly why nothing caught this.
  globalThis.__zuhdMaps = []
  const env = setupDom()
  try {
    const { mount } = await import(bundlePath)
    const teardown = mount(env.host)
    env.pump()
    await settle()
    env.pump()

    const map = globalThis.__zuhdMaps.at(-1)
    const idle = map.handlers.idle || []
    assert.ok(idle.length >= 2, 'the island should sync hover state on idle')

    // Let the first tick do whatever setting-up it needs, then hold still.
    for (const f of idle) f({ type: 'idle' })
    map.stateWrites = 0
    for (let i = 0; i < 25; i++) for (const f of idle) f({ type: 'idle' })

    assert.equal(
      map.stateWrites,
      0,
      `25 idle ticks with an unmoved pointer wrote ${map.stateWrites} times; ` +
        'each write re-dirties the source and schedules the next frame',
    )

    teardown()
  } finally {
    env.restore()
    delete globalThis.__zuhdMaps
  }
})

test('the sky is painted behind MapLibre, and paints nothing into it', async () => {
  // Three separate claims, and the first one is the whole design.
  //
  // **Paint order.** `.map-sky` and MapLibre's canvas container are both
  // `position: absolute` with no `z-index`, so tree order alone decides which
  // paints over which — and the island appends the sky *before* constructing
  // the map so MapLibre lands after it. That is what makes the globe occlude
  // the sky in hardware, at the true edge and at the true moment, including
  // the partial clip while a body is halfway over the limb. Move the append
  // after `new MapLibreMap` and the sky draws over the earth, with nothing
  // thrown and nothing logged. Hence: assert the *position*, not the presence.
  //
  // **Nothing reaches MapLibre.** No source, no layer, no image, no feature
  // state. The sky is a 2D canvas and a `move` listener; if it ever starts
  // writing to the engine it inherits every constraint this file pins about
  // idle quiet, collision flags and hit ordering.
  //
  // **It is not in the hit path.** `MARKER_LAYERS` and `HIT_ORDER` must stay
  // the same set (asserted elsewhere in this file), and the sky has no layer to
  // rank — it is queried by geometry inside the one `click`/`mousemove` pair.
  globalThis.__zuhdMaps = []
  const env = setupDom()
  try {
    const { mount, MARKER_LAYERS, HIT_ORDER } = await import(bundlePath)
    const teardown = mount(env.host)
    env.pump()
    await settle()
    env.pump()

    const host = env.host.querySelector('.map-canvas-host')
    const sky = host.querySelector('canvas.map-sky')
    assert.ok(sky, 'the sky canvas is mounted')
    assert.equal(host.firstElementChild, sky, 'the sky is the first child of the canvas host')
    assert.ok(
      sky.compareDocumentPosition(host.querySelector('.maplibregl-canvas-container') ?? host) &
        4 /* DOCUMENT_POSITION_FOLLOWING */ ||
        !host.querySelector('.maplibregl-canvas-container'),
      'MapLibre’s canvas comes after the sky in tree order',
    )
    // It painted. The harness gives canvases a real box precisely so this can
    // be true — with jsdom's zero box the painter returns before drawing and
    // every assertion here would pass against a canvas that never ran.
    assert.ok(sky.width > 0 && sky.height > 0, 'the sky sized its drawing buffer')
    assert.ok(sky.getContext('2d').calls.includes('fill'), 'the sky drew something')

    const map = globalThis.__zuhdMaps.at(-1)
    assert.ok(!('sky' in map.sources) && !('stars' in map.sources), 'the sky adds no source')
    assert.ok(
      !map.layers.some((l) => /sky|star|moon|sun|halo|airglow/i.test(l.id)),
      'the sky adds no layer',
    )
    assert.ok(
      !Object.keys(map.images).some((id) => /sky|star|moon|sun/i.test(id)),
      'the sky registers no image',
    )
    assert.ok(
      !MARKER_LAYERS.some((l) => /sky|star/i.test(l)) && !HIT_ORDER.some((l) => /sky|star/i.test(l)),
      'the sky is not in the layer hit path',
    )

    // Repainting is free of the engine: a `move` must not write feature state.
    map.stateWrites = 0
    for (const f of map.handlers.move || []) f({ type: 'move' })
    assert.equal(map.stateWrites, 0, 'a move repaints the sky and writes nothing to the map')

    teardown()
    assert.equal(env.host.querySelector('canvas.map-sky'), null, 'teardown removes the sky')
  } finally {
    env.restore()
    delete globalThis.__zuhdMaps
  }
})
