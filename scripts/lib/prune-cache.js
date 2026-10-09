// A ceiling for a cache that had none.
//
// The share cards are cached outside `dist/`, one file to a hash of its render
// inputs (`.cache/og`, `.cache/ig`). Nothing ever removed one: 941 MB in 9,453
// files on 2026-10-09, growing by about 0.7 GB a month, on a disk at 83% whose
// filling up the cycle already has to survive (`lib/cycle-run.js` `put`).
//
// A card is read again only for an article the build still emits, and a hit
// does not touch the file. So a file last written longer ago than the build
// can look back belongs to an article that has left the window, or to inputs
// since edited, and nothing will ask for it. If something does (a fresh
// checkout resets the mtimes the window is cut by), the card is rendered again:
// that is what makes this a cache.

import { readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Remove the files in `dir` last written more than `maxAgeMs` ago. Files only,
 * not directories; a file that cannot be read or removed is left and not
 * counted. A directory that is not there holds nothing to remove.
 *
 * @param {string} dir
 * @param {number} maxAgeMs
 * @param {number} [now]
 * @returns {{ removed: number, kept: number }}
 */
export function pruneOlderThan(dir, maxAgeMs, now = Date.now()) {
  let names
  try {
    names = readdirSync(dir)
  } catch {
    return { removed: 0, kept: 0 }
  }
  let removed = 0
  let kept = 0
  for (const name of names) {
    const path = join(dir, name)
    try {
      const st = statSync(path)
      if (!st.isFile()) continue
      if (now - st.mtimeMs > maxAgeMs) {
        rmSync(path)
        removed++
      } else {
        kept++
      }
    } catch {
      /* gone already, or not ours to remove: the next build tries again */
    }
  }
  return { removed, kept }
}
