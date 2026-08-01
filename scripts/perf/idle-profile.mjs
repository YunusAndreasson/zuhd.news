// A real CPU profile of an untouched map.
//
// idle-trace.mjs says how many frames were scheduled; this says what ran inside
// them. CDP's sampling profiler attributes self-time to actual functions,
// including MapLibre's own, which is the only way to tell "the map is
// re-placing symbols every frame" from "something in our island is looping".
//
//   node scripts/perf/idle-profile.mjs [--base URL] [--settle MS] [--window MS]

import { chromium } from 'playwright'
import { argAt as arg } from '../lib/argv.js'

const BASE = arg('base', 'http://127.0.0.1:8788')
const SETTLE = Number(arg('settle', 14000))
const WINDOW = Number(arg('window', 6000))
const PATH = arg('path', '/')

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const tab = await ctx.newPage()
const cdp = await ctx.newCDPSession(tab)

await tab.goto(`${BASE}${PATH}`, { waitUntil: 'domcontentloaded' })
await tab.waitForTimeout(SETTLE)

await cdp.send('Profiler.enable')
await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
await cdp.send('Profiler.start')
await tab.waitForTimeout(WINDOW)
const { profile } = await cdp.send('Profiler.stop')

// Self time per node, from the sample stream.
const byId = new Map(profile.nodes.map((n) => [n.id, n]))
const self = new Map()
const deltas = profile.timeDeltas || []
profile.samples.forEach((id, i) => {
  self.set(id, (self.get(id) || 0) + (deltas[i] || 0))
})

const label = (n) => {
  const f = n.callFrame
  const name = f.functionName || '(anonymous)'
  const file = (f.url || '').replace(/^https?:\/\/[^/]+/, '') || '(native)'
  return `${name}  ${file}:${f.lineNumber + 1}`
}

const rows = [...self.entries()]
  .map(([id, us]) => ({ node: byId.get(id), ms: us / 1000 }))
  .filter((r) => r.node)
  .sort((a, b) => b.ms - a.ms)

const totalMs = rows.reduce((n, r) => n + r.ms, 0)
const idleMs = rows.filter((r) => ['(idle)', '(program)'].includes(r.node.callFrame.functionName)).reduce((n, r) => n + r.ms, 0)
const busyMs = totalMs - idleMs

console.log(`\n  profile window ${WINDOW}ms   busy ${busyMs.toFixed(0)}ms  (${((busyMs / WINDOW) * 100).toFixed(0)}% of one core)   idle ${idleMs.toFixed(0)}ms\n`)
console.log('  ── self time, hottest first')
for (const r of rows.slice(0, 22)) {
  const n = r.node.callFrame.functionName
  if (n === '(idle)' || n === '(program)') continue
  console.log(`     ${r.ms.toFixed(0).padStart(6)}ms  ${((r.ms / busyMs) * 100).toFixed(1).padStart(5)}%  ${label(r.node)}`)
}

// Walk up from the hottest non-idle node to show who calls it.
const parentOf = new Map()
for (const n of profile.nodes) for (const c of n.children || []) parentOf.set(c, n.id)
const hottest = rows.find((r) => !['(idle)', '(program)', '(garbage collector)'].includes(r.node.callFrame.functionName))
if (hottest) {
  console.log('\n  ── call path into the hottest frame')
  const chain = []
  let cur = hottest.node.id
  while (cur != null && chain.length < 18) {
    const n = byId.get(cur)
    if (!n) break
    chain.push(label(n))
    cur = parentOf.get(cur)
  }
  for (const [i, c] of chain.reverse().entries()) console.log(`     ${' '.repeat(i)}${c}`)
}
console.log()

await browser.close()
