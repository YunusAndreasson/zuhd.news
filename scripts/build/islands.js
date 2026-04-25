// Island bundler: compiles public/islands/*.ts into dist/islands/*.js
// using esbuild. _framework.ts is shared code; only named islands become
// entry points. Each entry is an ES module shipped to the browser and
// lazy-loaded by reader.js on first activation.
//
// Called from scripts/build.js. Kept as a small helper so the main SSG
// pipeline can import and invoke it without growing further.

import { build } from 'esbuild'
import { readdirSync, mkdirSync } from 'fs'
import { join } from 'path'

const ROOT = new URL('../..', import.meta.url).pathname
const ISLAND_DIR = join(ROOT, 'public', 'islands')
const OUT_DIR = join(ROOT, 'dist', 'islands')

/** Filenames starting with _ are shared modules, not entry points. */
const isEntry = (f) => /\.ts$/.test(f) && !f.startsWith('_')

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

  return { count: entries.length, entries }
}
