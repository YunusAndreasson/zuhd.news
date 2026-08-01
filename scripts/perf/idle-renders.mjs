// Does the map stop drawing when nobody is touching it?
//
// The honest version of that question, because the obvious ways to ask it both
// lie.
//
//   1. A backgrounded or occluded window has requestAnimationFrame suspended
//      entirely, so "no frames while idle" is exactly what a *broken*
//      measurement also returns. Every run therefore opens with a control: pan
//      the camera and count frames. If the control does not show a healthy
//      frame rate, the window was not rendering and the idle figure below it
//      proves nothing, so it is reported as a failure rather than as a pass.
//
//   2. Under a software renderer a single frame costs so much that MapLibre's
//      300ms placement-recency window expires before the next one lands, which
//      manufactures a repaint loop that does not exist on a GPU. So this runs
//      headed against the real adapter by default.
//
// Frames are counted by wrapping requestAnimationFrame rather than by asking
// the map, so this needs nothing from the page and can be pointed at the
// deployed site as easily as at a local build. MapLibre drives its render loop
// through rAF; while the map is at rest nothing schedules one.
//
//   node scripts/perf/idle-renders.mjs [--base URL] [--settle MS] [--window MS] [--headless]

import { chromium } from 'playwright'
import { argAt as arg } from '../lib/argv.js'

const BASE = arg('base', 'http://127.0.0.1:8788')
const SETTLE = Number(arg('settle', 16000))
const WINDOW = Number(arg('window', 10000))
const HEADLESS = process.argv.includes('--headless')

const INIT = `
  window.__frames = 0
  const raw = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (cb) => raw((t) => { window.__frames++; return cb(t) })
`

const browser = await chromium.launch({ headless: HEADLESS })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addInitScript(INIT)
const tab = await ctx.newPage()
const cdp = await ctx.newCDPSession(tab)
await cdp.send('Performance.enable')

await tab.goto(BASE, { waitUntil: 'domcontentloaded' })
await tab.waitForTimeout(SETTLE)

const taskSeconds = async () =>
  (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration').value
const frames = () => tab.evaluate(() => window.__frames)

const gpu = await tab.evaluate(() => {
  const g = document.createElement('canvas').getContext('webgl2')
  const d = g?.getExtension('WEBGL_debug_renderer_info')
  return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : String(!!g)
})

// ── Control. Drag across the canvas: the map must draw while it is moving.
const box = await tab.evaluate(() => {
  const c = document.querySelector('.maplibregl-canvas')
  if (!c) return null
  const r = c.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
})
if (!box) {
  console.log('\n  ✖ no map canvas on the page — is this the homepage?\n')
  await browser.close()
  process.exit(2)
}
const c0 = await frames()
const cT0 = Date.now()
await tab.mouse.move(box.x, box.y)
await tab.mouse.down()
for (let i = 1; i <= 20; i++) {
  await tab.mouse.move(box.x + i * 6, box.y + Math.sin(i / 3) * 20)
  await tab.waitForTimeout(25)
}
await tab.mouse.up()
await tab.waitForTimeout(400)
const controlFrames = (await frames()) - c0
const controlFps = controlFrames / ((Date.now() - cT0) / 1000)

// Let any momentum and the placement settle before the idle window opens.
await tab.waitForTimeout(2500)

const f0 = await frames()
const t0 = await taskSeconds()
await tab.waitForTimeout(WINDOW)
const restFrames = (await frames()) - f0
const cpuMs = ((await taskSeconds()) - t0) * 1000

const ok = controlFps >= 20
console.log(`\n  ${HEADLESS ? 'headless' : 'headed'}   gpu: ${gpu}`)
console.log(`  control  ${controlFrames} frames while dragging  (${controlFps.toFixed(1)} fps)`)
if (!ok) {
  console.log('\n  ✖ CONTROL FAILED — the window was not rendering (occluded, backgrounded, or no GPU).')
  console.log('    Nothing below is evidence of anything; re-run with a visible window.\n')
}
console.log(`  at rest  ${restFrames} frames / ${WINDOW / 1000}s  (${(restFrames / (WINDOW / 1000)).toFixed(2)}/s)`)
console.log(`  cpu      ${cpuMs.toFixed(0)}ms main thread  (${((cpuMs / WINDOW) * 100).toFixed(1)}% of one core)\n`)

await browser.close()
process.exitCode = ok ? 0 : 2
