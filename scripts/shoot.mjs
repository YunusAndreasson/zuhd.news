// Screenshot harness for visual work on the homepage map.
//
//   node scripts/shoot.mjs [url] [outdir]
//
// Serves dist/ locally (or hits a URL you pass), then captures the homepage at
// desktop and mobile widths in both colour schemes. Existing purely so visual
// changes can be checked against pixels instead of guessed at.

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { serveDist } from './lib/serve-dist.js'

const ROOT = new URL('..', import.meta.url).pathname
const target = process.argv[2] || 'local'
const outDir = process.argv[3] || join(ROOT, '.shots')

const VIEWS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1280, height: 720 },
  { name: 'mobile', width: 390, height: 844 },
]

const local = target === 'local' ? await serveDist() : null
const base = local ? local.base : target
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch()
const shots = []

for (const scheme of /** @type {('light'|'dark')[]} */ (['light', 'dark'])) {
  for (const v of VIEWS) {
    if (scheme === 'dark' && v.name === 'laptop') continue
    const ctx = await browser.newContext({
      viewport: { width: v.width, height: v.height },
      deviceScaleFactor: 2,
      colorScheme: scheme,
    })
    const page = await ctx.newPage()
    const errors = []
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    page.on('pageerror', (e) => errors.push(String(e)))

    await page.goto(`${base}/`, { waitUntil: 'load' })
    // Give the map a beat to fetch its data and paint a few frames.
    await page.waitForTimeout(4500)

    const out = join(outDir, `${scheme}-${v.name}.png`)
    await page.screenshot({ path: out })
    shots.push({ out, scheme, view: v.name, errors })
    if (errors.length) console.log(`  ! ${scheme}/${v.name} console errors:`, errors.slice(0, 4))

    await ctx.close()
  }
}

await browser.close()
if (local) local.close()

for (const s of shots) console.log('shot:', s.out)
console.log('done')
