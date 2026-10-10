#!/usr/bin/env node
// Writes content/.last-cycle.json from validated articles in the current selection.
// Only includes stories whose article file was actually written (i.e. passed validation).
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { pathOf } from './lib/datasets.js'
import { writeJson } from './lib/json-file.js'
import { lastCycle } from './lib/last-cycle.js'
import { runStage } from './lib/stage.js'

export function main() {
  /** @type {import('./lib/schema.js').SelectionEntry[]} */
  const sel = JSON.parse(readFileSync(pathOf('selection'), 'utf8'))
  const articleDir = pathOf('articles')

  const cycle = lastCycle(sel, (slug) => existsSync(join(articleDir, `${slug}.md`)), new Date().toISOString())

  const path = pathOf('lastCycle')
  writeJson(path, cycle)
  console.log(`Wrote ${basename(path)} with ${cycle.articles.length}/${sel.length} articles (validated)`)
  return { counts: { selected: sel.length, published: cycle.articles.length } }
}

await runStage(import.meta, 'write-last-cycle', main)
