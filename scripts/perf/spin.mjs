// What a turn of the globe costs, in the two numbers that hold still on a busy
// machine: WebGL draw calls per frame, and main-thread milliseconds inside
// MapLibre's `_render`.
//
// Frame times on a loaded laptop swing ±30% between identical runs, and a
// server without a GPU runs WebGL in software, which says nothing about the
// globe. Draw calls are deterministic for a view; render milliseconds are
// comparable only inside one page, so an A/B alternates A and B in the same
// tab (`--b` switches to B, `--a` back), never across two launches.
//
// The map is reached by rewriting the island's `new Map({container:` to keep a
// handle on `globalThis.__map`. If the bundle stops matching, this says so and
// stops rather than measuring nothing.
//
//   node scripts/perf/spin.mjs [--base URL] [--runs N] [--headed] [--chrome PATH]
//     [--a "<js with m in scope>"] [--b "<js with m in scope>"]
//
// `--chrome` (or `PERF_CHROME`) runs a Chromium other than Playwright's own,
// for when the installed browser build trails the package.
//
// Example, the heatmaps off as B:
//   --b "for (const id of ['story-density','story-bloom']) m.setLayoutProperty(id,'visibility','none')"
//   --a "for (const id of ['story-density','story-bloom']) m.setLayoutProperty(id,'visibility','visible')"

import { chromium } from 'playwright'
import { argAt as arg } from '../lib/argv.js'

const BASE = arg('base', 'http://127.0.0.1:8788')
const RUNS = Number(arg('runs', 4))
const A = arg('a')
const B = arg('b')
const HEADED = process.argv.includes('--headed')
const CHROME = arg('chrome', process.env.PERF_CHROME)

// Headless Chromium falls back to software GL without these.
const browser = await chromium.launch({
  headless: !HEADED,
  ...(CHROME ? { executablePath: CHROME } : {}),
  args: ['--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-gpu'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
let exposed = false
await page.route('**/islands/situation-map.js*', async (route) => {
  const res = await route.fetch()
  const body = await res.text()
  const next = body.replace(/([\w$]+)=new ([\w$]+)\(\{container:/, '$1=globalThis.__map=new $2({container:')
  exposed = next !== body
  await route.fulfill({ response: res, body: next })
})
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
if (!exposed) {
  console.error('spin: the island bundle no longer matches `new Map({container:`; nothing measured')
  process.exit(1)
}
await page.waitForFunction(() => globalThis.__map?.loaded(), null, { timeout: 120_000 })
// Marks fade in and the idle tier loads after the first idle.
await page.waitForTimeout(8000)

const renderer = await page.evaluate(() => {
  const gl = globalThis.__map.painter.context.gl
  const info = gl.getExtension('WEBGL_debug_renderer_info')
  return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown'
})

await page.evaluate(() => {
  const m = globalThis.__map
  const gl = m.painter.context.gl
  const probe = { calls: 0, layer: '(outside layers)', byLayer: {} }
  globalThis.__probe = probe
  for (const fn of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
    const raw = gl[fn].bind(gl)
    gl[fn] = (...args) => {
      probe.calls++
      probe.byLayer[probe.layer] = (probe.byLayer[probe.layer] || 0) + 1
      return raw(...args)
    }
  }
  const renderLayer = m.painter.renderLayer.bind(m.painter)
  m.painter.renderLayer = (painter, source, layer, ...rest) => {
    probe.layer = layer.id
    try {
      return renderLayer(painter, source, layer, ...rest)
    } finally {
      probe.layer = '(outside layers)'
    }
  }
})

/** One still frame at the opening view, by layer. */
const stillFrame = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const m = globalThis.__map
        const probe = globalThis.__probe
        m.once('render', () => {
          probe.calls = 0
          probe.byLayer = {}
          m.once('render', () => resolve({ calls: probe.calls, byLayer: { ...probe.byLayer } }))
          m.triggerRepaint()
        })
        m.triggerRepaint()
      }),
  )

/** Three scripted turns, across both hemispheres and back. */
const spin = () =>
  page.evaluate(async () => {
    const m = globalThis.__map
    const probe = globalThis.__probe
    const ms = []
    const calls = []
    const render = m._render.bind(m)
    m._render = (t) => {
      const s = performance.now()
      probe.calls = 0
      const r = render(t)
      ms.push(performance.now() - s)
      calls.push(probe.calls)
      return r
    }
    const go = (o) =>
      new Promise((r) => {
        m.once('moveend', r)
        m.easeTo({ ...o, duration: 3000, easing: (x) => x })
      })
    const c = m.getCenter()
    await go({ center: [c.lng + 150, 30] })
    await go({ center: [c.lng + 300, -30] })
    await go({ center: [c.lng, c.lat] })
    m._render = render
    const s = ms.slice().sort((a, b) => a - b)
    const at = (q) => s[Math.min(s.length - 1, Math.floor(s.length * q))]
    return {
      frames: s.length,
      mean: s.reduce((a, b) => a + b, 0) / s.length,
      p50: at(0.5),
      p90: at(0.9),
      calls: calls.reduce((a, b) => a + b, 0) / calls.length,
    }
  })

// One turn first, discarded: the first loads tiles and warms the JIT, and ran
// twice as slow as the rest.
await spin()
const still = await stillFrame()
console.log(`renderer: ${renderer}`)
console.log(`still frame: ${still.calls} draw calls`)
for (const [id, n] of Object.entries(still.byLayer).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${String(n).padStart(4)}  ${id}`)
}

/**
 * CPU time a frame costs, from a Chrome trace: the page's main thread and the
 * GPU process's main thread, in thread time (`tdur`), which a busy machine
 * preempting the browser does not inflate the way it inflates wall time.
 */
const cpuPerFrame = (trace, frames) => {
  const names = new Map()
  for (const e of trace.traceEvents) {
    if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args.name)
  }
  const sum = new Map()
  for (const e of trace.traceEvents) {
    if (e.ph !== 'X' || e.name !== 'ThreadControllerImpl::RunTask' || e.tdur == null) continue
    const key = `${e.pid}:${e.tid}`
    sum.set(key, (sum.get(key) || 0) + e.tdur)
  }
  const busiest = (thread) =>
    Math.max(0, ...[...sum].filter(([k]) => names.get(k) === thread).map(([, v]) => v))
  return { main: busiest('CrRendererMain') / 1000 / frames, gpu: busiest('CrGpuMain') / 1000 / frames }
}

const fmt = (r) =>
  `${r.frames} frames · CPU/frame main ${r.main.toFixed(1)} ms, gpu ${r.gpu.toFixed(1)} ms · render wall p50 ${r.p50.toFixed(1)} ms · ${Math.round(r.calls)} calls/frame`
const results = { A: [], B: [] }
for (let i = 0; i < RUNS; i++) {
  const side = B && i % 2 === 1 ? 'B' : 'A'
  if (side === 'B') await page.evaluate(`(async () => { const m = globalThis.__map; ${B} })()`)
  else if (B && A && i > 0) await page.evaluate(`(async () => { const m = globalThis.__map; ${A} })()`)
  await page.waitForTimeout(1500)
  await browser.startTracing(undefined, { categories: ['toplevel', 'disabled-by-default-devtools.timeline'] })
  const r = await spin()
  Object.assign(r, cpuPerFrame(JSON.parse((await browser.stopTracing()).toString()), r.frames))
  results[side].push(r)
  console.log(`${side} ${fmt(r)}`)
}
const mean = (rs, k) => rs.reduce((a, r) => a + r[k], 0) / rs.length
for (const side of ['A', 'B']) {
  const rs = results[side]
  if (!rs.length) continue
  console.log(
    `${side} over ${rs.length}: CPU/frame main ${mean(rs, 'main').toFixed(2)} ms, gpu ${mean(rs, 'gpu').toFixed(2)} ms · ${Math.round(mean(rs, 'calls'))} calls/frame`,
  )
}
await browser.close()
