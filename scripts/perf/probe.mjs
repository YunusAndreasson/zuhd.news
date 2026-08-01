// Drive the built site in a real browser and report what a reader would get:
// render errors, paint timings, what the main thread spent, and what it cost to
// fetch. One page type each, because a defect on the article template is a
// defect on 711 pages.
//
// Every number comes from the browser's own accounting (CDP
// Performance.getMetrics, PerformanceObserver, Resource Timing) rather than
// from wall-clock around an await, which cannot tell a slow page from a page
// this script simply waited longer on.
//
// What the map costs while nobody is touching it is *not* here — see
// scripts/perf/idle-renders.mjs, which needs a control and a real GPU to answer
// it honestly.
//
//   node scripts/perf/probe.mjs [--base URL] [--json FILE] [--headed]

import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]
}

const BASE = arg('base', 'http://127.0.0.1:8788')
const JSON_OUT = arg('json', null)
const HEADED = process.argv.includes('--headed')

/** Pages worth probing, and what each one is here to prove. */
const PAGES = [
  { name: 'map', path: '/', settle: 9000 },
  { name: 'article', path: '/a/2026-07-18-aerobic-exercise-depression-frontal-function-rct', settle: 3000 },
  { name: 'country', path: '/country/PS', settle: 3000 },
  { name: 'entity', path: '/e/brent', settle: 3000 },
  { name: 'category', path: '/c/politics', settle: 2500 },
  { name: 'about', path: '/about', settle: 2500 },
]

/**
 * Long tasks, layout shifts and paint timings, installed before any page
 * script runs so nothing is missed between navigation and our first await.
 */
const OBSERVER_INIT = `
  window.__probe = { longTasks: [], shifts: [], lcp: 0, cls: 0 }
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__probe.longTasks.push({ start: Math.round(e.startTime), dur: Math.round(e.duration) })
    }).observe({ type: 'longtask', buffered: true })
  } catch {}
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__probe.lcp = Math.round(e.startTime)
    }).observe({ type: 'largest-contentful-paint', buffered: true })
  } catch {}
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (e.hadRecentInput) continue
        window.__probe.cls += e.value
        window.__probe.shifts.push({ start: Math.round(e.startTime), value: Number(e.value.toFixed(4)) })
      }
    }).observe({ type: 'layout-shift', buffered: true })
  } catch {}
`

/** CDP Performance.getMetrics, reduced to the counters that mean something. */
const metrics = async (cdp) => {
  const { metrics: m } = await cdp.send('Performance.getMetrics')
  const get = (n) => m.find((x) => x.name === n)?.value ?? 0
  return {
    task: get('TaskDuration'),
    script: get('ScriptDuration'),
    layout: get('LayoutDuration'),
    recalc: get('RecalcStyleDuration'),
    frames: get('Frames'),
    nodes: get('Nodes'),
    listeners: get('JSEventListeners'),
  }
}

const delta = (a, b) => ({
  taskMs: +((b.task - a.task) * 1000).toFixed(1),
  scriptMs: +((b.script - a.script) * 1000).toFixed(1),
  layoutMs: +((b.layout - a.layout) * 1000).toFixed(1),
  recalcMs: +((b.recalc - a.recalc) * 1000).toFixed(1),
  frames: b.frames - a.frames,
})

const run = async () => {
  // Launch flags are deliberately empty. Chromium's default headless GPU path
  // resolves WebGL2 through ANGLE/SwiftShader and works; every hand-picked
  // combination of --use-gl / --ignore-gpu-blocklist tried here made it worse,
  // and one of them (--use-gl=angle --ignore-gpu-blocklist) killed WebGL2
  // outright — which reads exactly like the site failing to render.
  //
  // Headless resolves WebGL2 to SwiftShader, which is honest about *errors*
  // and useless about the map's frame cost: a software frame is ~100× a GPU
  // one. Pass --headed for any number that depends on rendering speed.
  const browser = await chromium.launch({ headless: !HEADED })
  const results = []

  for (const page of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await ctx.addInitScript(OBSERVER_INIT)
    const tab = await ctx.newPage()

    const errors = []
    const warnings = []
    const requests = []

    tab.on('console', (msg) => {
      const type = msg.type()
      if (type === 'error') errors.push(`console.error: ${msg.text()}`)
      else if (type === 'warning') warnings.push(msg.text())
    })
    tab.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
    tab.on('requestfailed', (req) => {
      // A cancelled prefetch on teardown is not a failure a reader ever sees.
      if (req.failure()?.errorText === 'net::ERR_ABORTED') return
      errors.push(`requestfailed: ${req.url()} — ${req.failure()?.errorText}`)
    })
    tab.on('response', (res) => {
      requests.push({ url: res.url(), status: res.status() })
      if (res.status() >= 400) errors.push(`http ${res.status()}: ${res.url()}`)
    })
    // Worker-scope failures never reach the page's console.
    tab.on('worker', (w) => {
      w.on('close', () => {})
    })

    const cdp = await ctx.newCDPSession(tab)
    await cdp.send('Performance.enable')

    const t0 = Date.now()
    await tab.goto(`${BASE}${page.path}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await tab.waitForTimeout(page.settle)
    const loadMetrics = await metrics(cdp)
    const loadWall = Date.now() - t0

    const probe = await tab.evaluate(() => {
      const nav = /** @type {PerformanceNavigationTiming} */ (performance.getEntriesByType('navigation')[0])
      const res = /** @type {PerformanceResourceTiming[]} */ (performance.getEntriesByType('resource'))
      const paint = performance.getEntriesByType('paint')
      return {
        lcp: window.__probe.lcp || null,
        cls: +window.__probe.cls.toFixed(4),
        shifts: window.__probe.shifts.filter((s) => s.value > 0.001),
        longTasks: window.__probe.longTasks.filter((t) => t.dur >= 50),
        // Null, not 0, when the entry never arrived. A headed window that the
        // window manager opened behind another one is never painted, so Chrome
        // reports no paint timing at all — and a 0 there reads as "instant",
        // which is the most flattering possible way to render a measurement
        // that did not happen.
        fcp: paint.find((p) => p.name === 'first-contentful-paint')
          ? Math.round(paint.find((p) => p.name === 'first-contentful-paint').startTime)
          : null,
        domContentLoaded: Math.round(nav?.domContentLoadedEventEnd ?? 0),
        resources: res.length,
        transferKB: Math.round(res.reduce((n, r) => n + (r.transferSize || 0), 0) / 1024),
        decodedKB: Math.round(res.reduce((n, r) => n + (r.decodedBodySize || 0), 0) / 1024),
        heaviest: res
          .map((r) => ({ url: r.name.replace(location.origin, ''), kb: Math.round((r.transferSize || 0) / 1024) }))
          .filter((r) => r.kb > 20)
          .sort((a, b) => b.kb - a.kb)
          .slice(0, 8),
      }
    })

    const entry = {
      page: page.name,
      path: page.path,
      loadWall,
      ...probe,
      load: delta({ task: 0, script: 0, layout: 0, recalc: 0, frames: 0 }, loadMetrics),
      nodes: loadMetrics.nodes,
      listeners: loadMetrics.listeners,
      errors,
      warnings: warnings.slice(0, 10),
      requestCount: requests.length,
    }

    // Idle behaviour is deliberately not measured here. It needs a control
    // (see scripts/perf/idle-renders.mjs) to tell "the map is at rest" from
    // "the window was not rendering", and it needs a real GPU to avoid the
    // software renderer manufacturing a repaint loop of its own. Measuring it
    // in passing, headless, produced a confident 111% that was an artifact.

    results.push(entry)
    await ctx.close()
  }

  await browser.close()
  return results
}

const pad = (s, n) => String(s).padEnd(n)
/** `not painted` rather than `0ms` — see the note on `fcp` above. */
const ms = (v) => (v == null ? 'n/a' : `${v}ms`)
const results = await run()

console.log(`\n  BASE ${BASE}   ${HEADED ? 'headed (real GPU)' : 'headless (SwiftShader)'}\n`)
for (const r of results) {
  console.log(`── ${r.page}  ${r.path}`)
  console.log(
    `   paint    fcp ${pad(ms(r.fcp), 8)} lcp ${pad(ms(r.lcp), 8)} cls ${pad(r.cls, 8)} dcl ${r.domContentLoaded}ms`,
  )
  console.log(
    `   thread   task ${pad(`${r.load.taskMs}ms`, 9)} script ${pad(`${r.load.scriptMs}ms`, 9)} layout ${pad(`${r.load.layoutMs}ms`, 8)} recalc ${r.load.recalcMs}ms`,
  )
  console.log(
    `   weight   ${pad(`${r.transferKB}KB over ${r.resources} reqs`, 26)} dom ${pad(`${r.nodes} nodes`, 14)} ${r.listeners} listeners`,
  )
  if (r.longTasks.length) {
    const total = r.longTasks.reduce((n, t) => n + t.dur, 0)
    console.log(`   blocking ${r.longTasks.length} long tasks, ${total}ms total, worst ${Math.max(...r.longTasks.map((t) => t.dur))}ms`)
  }
  if (r.heaviest.length) {
    console.log(`   heaviest ${r.heaviest.map((h) => `${h.url.split('/').pop()} ${h.kb}KB`).join('  ')}`)
  }
  if (r.shifts.length) console.log(`   shifts   ${r.shifts.map((s) => `${s.value}@${s.start}ms`).join('  ')}`)
  if (r.errors.length) {
    console.log(`   ERRORS   ${r.errors.length}`)
    for (const e of [...new Set(r.errors)].slice(0, 12)) console.log(`     ✖ ${e}`)
  } else {
    console.log('   errors   none')
  }
  console.log()
}

if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify(results, null, 2))
  console.log(`  wrote ${JSON_OUT}\n`)
}

const failed = results.filter((r) => r.errors.length)
if (failed.length) process.exitCode = 1
