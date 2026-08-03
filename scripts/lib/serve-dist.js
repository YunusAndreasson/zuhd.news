// A local static server for `dist/`, for the instruments that need a real
// browser pointed at the real built site.
//
// Two copies of this existed the moment `css-usage.mjs` was written —
// `shoot.mjs` had the original — and the MIME table below is exactly the kind
// that drifts silently: a missing entry does not throw, it serves the file as
// `application/octet-stream`, the browser refuses it, and the instrument goes on
// reporting confidently about a page with the thing it was measuring missing.
// `shoot.mjs`'s own comment says as much, which is the argument for one copy.

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, extname } from 'node:path'

/**
 * Not optional extras, any of them.
 *
 * The map island imports the vendored MapLibre as `/islands/maplibre-gl.mjs`,
 * and a module served as `application/octet-stream` is refused by the browser
 * outright — without `.mjs` here the harness cannot load the homepage map *at
 * all*, and every shot it takes shows the page with the map missing while
 * reporting nothing worse than a console line. `.geojson` and `.pbf` are the
 * basemap's, for the same reason.
 */
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

/**
 * Serve a built `dist/` on an ephemeral port.
 *
 * @param {object} [opts]
 * @param {string} [opts.dist] Directory to serve. Defaults to `<repo>/dist`.
 * @param {(html: string) => string} [opts.transformHtml]
 *   Rewrites every HTML response before it is sent. `css-usage.mjs` uses it to
 *   put the *unminified* stylesheet back on the page, so the byte offsets the
 *   coverage API reports are offsets into the file a human edits. Left out, the
 *   page is served exactly as built — which is what a screenshot wants.
 * @returns {Promise<{ server: import('node:http').Server, base: string, close: () => void }>}
 */
export async function serveDist(opts = {}) {
  const dist = opts.dist ?? join(new URL('../..', import.meta.url).pathname, 'dist')
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent((req.url ?? '/').split('?')[0])
      if (path.endsWith('/')) path += 'index.html'
      let file = join(dist, path)
      if (!existsSync(file) && existsSync(`${file}.html`)) file += '.html'
      const raw = await readFile(file)
      const body =
        opts.transformHtml && extname(file) === '.html'
          ? opts.transformHtml(raw.toString('utf8'))
          : raw
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
  return { server, base: `http://127.0.0.1:${addr.port}`, close: () => server.close() }
}
