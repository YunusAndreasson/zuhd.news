#!/usr/bin/env node
// Post-writer: fills missing frontmatter fields from the selection JSON.
// Concepts, eventCoverage, and empty sources are copied mechanically —
// no reason to spend LLM tokens on data the pipeline already has. What is
// filled, and how it is escaped, is `scaffoldArticle` in `lib/scaffold.js`.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathOf } from './lib/datasets.js'
import { scaffoldArticle } from './lib/scaffold.js'
import { runStage } from './lib/stage.js'

export function main() {
  const SELECTION_PATH = pathOf('selection')
  const NEW_ARTICLES_PATH = pathOf('newArticles')

  if (!existsSync(SELECTION_PATH) || !existsSync(NEW_ARTICLES_PATH)) {
    console.log('Scaffold: no selection or article list — skipping')
    return { skipped: 'no selection or article list' }
  }

  const selection = JSON.parse(readFileSync(SELECTION_PATH, 'utf-8'))
  const files = readFileSync(NEW_ARTICLES_PATH, 'utf-8').trim().split('\n').filter(Boolean)

  const selectionBySlug = new Map()
  for (const story of selection) {
    if (story.suggestedSlug) selectionBySlug.set(story.suggestedSlug, story)
  }

  let filled = 0

  for (const f of files) {
    const full = resolve(f)
    if (!existsSync(full)) continue
    const story = selectionBySlug.get(full.replace(/.*\//, '').replace(/\.md$/, ''))
    if (!story) continue
    const next = scaffoldArticle(readFileSync(full, 'utf-8'), story)
    if (next !== null) {
      writeFileSync(full, next)
      filled++
    }
  }

  console.log(`Scaffold: filled missing fields in ${filled}/${files.length} articles`)
  return { counts: { listed: files.length, filled } }
}

await runStage(import.meta, 'scaffold-articles', main)
