// Screenshot harness for visual work on the homepage map.
//
//   node scripts/shoot.mjs [url] [outdir]
//
// Serves dist/ locally (or hits a URL you pass), then captures the homepage at
// desktop and mobile widths in both colour schemes. Existing purely so visual
// changes can be checked against pixels instead of guessed at.

import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, extname } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const DIST = join(ROOT, 'dist')
const target = process.argv[2] || 'local'
const outDir = process.argv[3] || join(ROOT, '.shots')

// `.mjs`, `.geojson` and `.pbf` are not optional extras: the map island imports
// the vendored MapLibre as `/islands/maplibre-gl.mjs`, and a module served as
// `application/octet-stream` is refused by the browser outright. Without them
// this harness could not load the homepage map *at all* — every shot it took
// showed the page with the thing it exists to photograph missing, and reported
// nothing worse than a console line.
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.geojson': 'application/json',
  '.pbf': 'application/x-protobuf',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.mp3': 'audio/mpeg',
}

async function serveDist() {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(req.url.split('?')[0])
      if (path.endsWith('/')) path += 'index.html'
      let file = join(DIST, path)
      if (!existsSync(file) && existsSync(`${file}.html`)) file += '.html'
      const body = await readFile(file)
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404).end('not found')
    }
  })
  await new Promise((r) => {
    server.listen(0, () => r(undefined))
  })
  const addr = /** @type {import('node:net').AddressInfo} */ (server.address())
  return { server, base: `http://127.0.0.1:${addr.port}` }
}

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
if (local) local.server.close()

for (const s of shots) console.log('shot:', s.out)
console.log('done')
