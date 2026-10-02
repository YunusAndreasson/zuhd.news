// The newest daily trends snapshot, `content/trends/YYYY-MM-DD.json`.
//
// Eight copies: the build, the entity pages, four stages and the validator
// each listed the directory and sorted, and one carried a comment explaining
// it was duplicated only because the original lived in the page builder and
// importing that would drag the builder into a pipeline stage. This is the
// original, moved to where a stage can import it.
//
// The newest file rather than today's: today's exists only after that day's
// fetch has run, so a build before the fetch — or on a day it failed — would
// otherwise lose the payload outright.

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './paths.js'

const DAILY = /^\d{4}-\d{2}-\d{2}\.json$/

/**
 * @param {string} [root] repository root — a parameter so tests can point it at a fixture
 * @returns {string | null}
 */
export function latestTrendsPath(root = ROOT) {
  const dir = join(root, 'content', 'trends')
  if (!existsSync(dir)) return null
  const latest = readdirSync(dir).filter((f) => DAILY.test(f)).sort().at(-1)
  return latest ? join(dir, latest) : null
}
