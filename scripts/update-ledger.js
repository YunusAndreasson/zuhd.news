#!/usr/bin/env node
// Post-selector: updates the story ledger deterministically. Replaces the
// LLM-driven ledger update that was previously part of the selector session.
// The rules are `updateLedger` in `lib/ledger.js`.
import { readFileSync } from 'node:fs'
import { pathOf } from './lib/datasets.js'
import { readJson, writeJson } from './lib/json-file.js'
import { updateLedger } from './lib/ledger.js'
import { runStage } from './lib/stage.js'

export function main() {
  const LEDGER_PATH = pathOf('storyLedger')

  // Load existing ledger
  const ledger = readJson(LEDGER_PATH, { version: 1, stories: [] })

  // Load selection
  let selection = []
  try { selection = JSON.parse(readFileSync(pathOf('selection'), 'utf-8')) } catch { return { skipped: 'no selection' } }
  if (!Array.isArray(selection) || selection.length === 0) return { skipped: 'empty selection' }

  const changes = updateLedger(ledger, selection, new Date().toISOString())

  writeJson(LEDGER_PATH, ledger)
  console.log(`Story ledger: ${ledger.stories.length} entries`)
  for (const c of changes) console.log(`  ${c}`)
  return { counts: { picked: selection.length, stories: ledger.stories.length } }
}

await runStage(import.meta, 'update-ledger', main)
