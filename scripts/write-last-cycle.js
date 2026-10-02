#!/usr/bin/env node
// Writes content/.last-cycle.json from validated articles in the current selection.
// Only includes stories whose article file was actually written (i.e. passed validation).
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { writeJson } from './lib/json-file.js'

const sel = JSON.parse(readFileSync('/tmp/zuhd-selection.json', 'utf8'))
const articleDir = 'content/articles'

const published = sel.filter(s => existsSync(join(articleDir, `${s.suggestedSlug}.md`)))

const cycle = {
  timestamp: new Date().toISOString(),
  articles: published.map(s => ({ slug: s.suggestedSlug, title: s.title, category: s.category, source: s.source })),
  categories: [...new Set(published.map(s => s.category))],
  sources: [...new Set(published.map(s => s.source))],
}

writeJson('content/.last-cycle.json', cycle)
console.log(`Wrote .last-cycle.json with ${published.length}/${sel.length} articles (validated)`)
