// Bundling an island so a test can import it.
//
// Seven suites did this by hand — `map-geo`, `map-island`, `map-feed`,
// `map-sheet`, `app-prompt`, `disclosure`, `chart` — and each carried the same
// `mkdtempSync` + `process.on('exit', rm)` pair and the same seven-key esbuild
// call. The one key that matters is the last:
//
//   alias: { '@shared': ROOT/shared }
//
// which has to match what `scripts/build/islands.js` gives the real bundler. A
// suite whose alias had drifted would be the one place `@shared` resolved
// differently from the shipped bundle, which is the opposite of what these
// tests are for. One copy is how that stays true.
//
// Not a `.test.js` file, so `node --test scripts/lib/*.test.js` does not run
// it; it is reachable from every suite that does.

import { build } from 'esbuild'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = new URL('../..', import.meta.url).pathname

/**
 * A scratch directory that removes itself when the process ends.
 *
 * @param {string} label appears in the path, so a leaked directory says which
 *        suite leaked it.
 */
export const scratchDir = (label) => {
  const dir = mkdtempSync(join(tmpdir(), `zuhd-${label}-`))
  process.on('exit', () => rmSync(dir, { recursive: true, force: true }))
  return dir
}

/**
 * Bundle one island source to ESM and return the path to import.
 *
 * `platform: 'neutral'` because these are browser modules and nothing here may
 * quietly resolve a Node built-in. `logLevel: 'silent'` because a failure
 * throws, and a throw inside a suite reads better than a warning beside it.
 *
 * @param {string} dir     a `scratchDir`
 * @param {string} entry   repo-relative source, e.g. `public/islands/_dom.ts`
 * @param {string} outName file name inside `dir`
 * @param {Record<string, string>} [alias] extra aliases, merged over `@shared`
 *        — `map-island.test.js` points `maplibre-gl` at a GPU-free stub this
 *        way. Never override `@shared` itself: that one has to stay what the
 *        real bundler uses.
 */
export const bundleIsland = async (dir, entry, outName, alias) => {
  const outfile = join(dir, outName)
  await build({
    entryPoints: [join(ROOT, entry)],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    logLevel: 'silent',
    alias: { ...alias, '@shared': join(ROOT, 'shared') },
  })
  return outfile
}

/**
 * The same, for a set of modules a suite wants under one import.
 *
 * `sources` are repo-relative paths; each is `export *`-ed from a generated
 * entry point. Pass a `{ path, names }` object instead where a star export
 * would collide — `_map/markets.ts` re-exports payload types that `_map/types.ts`
 * also carries, and an ambiguous star export resolves to silence rather than to
 * an error, so the collision would present as a missing export much later.
 *
 * @param {string} dir
 * @param {Array<string | { path: string, names: string[] }>} sources
 * @param {string} outName
 */
export const bundleIslands = async (dir, sources, outName) => {
  const entry = join(dir, `${outName.replace(/\.mjs$/, '')}.entry.ts`)
  writeFileSync(
    entry,
    sources
      .map((s) =>
        typeof s === 'string'
          ? `export * from '${join(ROOT, s)}'`
          : `export { ${s.names.join(', ')} } from '${join(ROOT, s.path)}'`,
      )
      .join('\n'),
  )
  const outfile = join(dir, outName)
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    logLevel: 'silent',
    alias: { '@shared': join(ROOT, 'shared') },
  })
  return outfile
}
