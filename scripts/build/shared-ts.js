// Transpile-and-import helper for /shared/**/*.ts modules used by the
// Node-based build pipeline. Mobile handles these via Metro/TS; the web
// build needs a plain Node loader. esbuild does the transform in-memory
// and we write a temp CJS/ESM bundle to /tmp, then dynamic-import it.
//
// Module outputs are cached per-path so a large multi-step build
// (country pages, thread pages, …) shares one transform pass.

import { build } from 'esbuild'
import { join } from 'node:path'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

const ROOT = new URL('../..', import.meta.url).pathname
const SHARED = join(ROOT, 'shared')

const cache = new Map()
const outDir = mkdtempSync(join(tmpdir(), 'zuhd-shared-'))
// Removed on exit: every build, test and island bundle made one of these and
// none was ever deleted — 2,719 directories (~84 MB) in /tmp by 2026-09-25.
// The imported modules are already evaluated by then, so nothing reads them.
process.on('exit', () => rmSync(outDir, { recursive: true, force: true }))

/** Load a TS module from /shared relative to the shared root. */
export const loadShared = async (relPath) => {
  if (cache.has(relPath)) return cache.get(relPath)
  const entry = join(SHARED, relPath)
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    write: false,
    external: ['d3-geo', 'topojson-client'],
    logLevel: 'warning',
  })
  const out = result.outputFiles?.[0]
  if (!out) throw new Error(`loadShared failed: ${relPath}`)
  const outPath = join(outDir, relPath.replace(/[\\/]/g, '_').replace(/\.ts$/, '.mjs'))
  writeFileSync(outPath, out.contents)
  const mod = await import(outPath)
  cache.set(relPath, mod)
  return mod
}
