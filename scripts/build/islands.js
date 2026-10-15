// Island bundler: compiles public/islands/*.ts into dist/islands/*.js
// using esbuild. _framework.ts is shared code; only named islands become
// entry points. Each entry is an ES module shipped to the browser and
// lazy-loaded by island-loader.js on first activation.
//
// Called from scripts/build.js. Kept as a small helper so the main SSG
// pipeline can import and invoke it without growing further.

import { build } from 'esbuild'
import { copyFileSync, existsSync } from 'node:fs'
import { readdirSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../lib/paths.js'

const ISLAND_DIR = join(ROOT, 'public', 'islands')
const OUT_DIR = join(ROOT, 'dist', 'islands')

/** Filenames starting with _ are shared modules, not entry points. */
const isEntry = (f) => /\.ts$/.test(f) && !f.startsWith('_')

/**
 * Keeps MapLibre out of the island bundle.
 *
 * Resolving the bare specifier to the copied vendor file keeps the island
 * bundle to its own code, so a content deploy does not invalidate a megabyte of
 * unchanged engine, which `_headers` caches for a day instead.
 */
const externalMapLibre = {
  name: 'external-maplibre',
  setup(build) {
    build.onResolve({ filter: /^maplibre-gl$/ }, () => ({
      path: '/islands/maplibre-gl.mjs',
      external: true,
    }))
  },
}

export const buildIslands = async ({ minify = true, dev = false } = {}) => {
  mkdirSync(OUT_DIR, { recursive: true })
  const entries = readdirSync(ISLAND_DIR).filter(isEntry)
  if (entries.length === 0) return { count: 0, entries: [] }

  await build({
    entryPoints: entries.map((f) => join(ISLAND_DIR, f)),
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'browser',
    outdir: OUT_DIR,
    outExtension: { '.js': '.js' },
    minify,
    sourcemap: dev,
    plugins: [externalMapLibre],
    // esbuild maps JSX via preact's h automatically when we opt in, but
    // we don't write JSX — htm tagged templates are used instead, so we
    // can skip the JSX factory configuration entirely.
    logLevel: 'warning',
    // Alias shared data imports when (future) islands pull from @shared.
    // Resolves both mobile's alias convention and esbuild's module resolver.
    alias: {
      '@shared': join(ROOT, 'shared'),
    },
  })
  copyMapLibreRuntime(ROOT, OUT_DIR)


  return { count: entries.length, entries }
}

// MapLibre ships as two ESM files: the entry and the worker it spawns as a
// sibling (`maplibre-gl-worker.mjs?v=<version>`; since 6.13 the worker is
// self-contained and `maplibre-gl-shared.mjs` an empty, deprecated file). Both
// are copied verbatim next to the island bundle — the entry because the bundler
// treats it as external (see `externalMapLibre`), the worker because the
// bundler never sees it. Miss one and the map stays a silent black rectangle:
// no exception, just a 404 and a canvas that never paints.
export function copyMapLibreRuntime(root, outDir) {
  const dir = join(root, 'node_modules', 'maplibre-gl', 'dist')
  if (!existsSync(dir)) return []
  const copied = []
  for (const f of readdirSync(dir)) {
    if (!/^maplibre-gl(-worker)?\.mjs$/.test(f)) continue
    copyFileSync(join(dir, f), join(outDir, f))
    copied.push(f)
  }
  return copied
}
