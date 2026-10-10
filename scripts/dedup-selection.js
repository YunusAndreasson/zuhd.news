#!/usr/bin/env node
// Removes entries from the selection whose article already exists, and entries
// it holds twice. Runs between selector and writer to avoid wasting LLM turns
// on duplicates. The layers are `wouldDedup` and `dedupSelection` in
// `lib/dedup.js`:
//
// 1. Exact slug match — article file already exists
// 2. Same source URL as a published article
// 3. eventUri match — same event already covered by a published article
// 4. Fuzzy slug match — word overlap ≥ 55% against a recently *published* article
// 5. Recap — title-word overlap against recent titles and ledger labels
// 6. Intra-batch fuzzy match — the same, against other stories in *this* selection
import { existsSync, readFileSync } from 'node:fs'
import { pathOf } from './lib/datasets.js'
import { dedupSelection, loadDedupContext } from './lib/dedup.js'
import { writeJson } from './lib/json-file.js'
import { runStage } from './lib/stage.js'

export function main() {
  const SELECTION = pathOf('selection')
  if (!existsSync(SELECTION)) return { skipped: 'no selection' }

  const selection = JSON.parse(readFileSync(SELECTION, 'utf-8'))
  const { kept, removed, floors } = dedupSelection(selection, loadDedupContext())

  for (const r of removed) console.log(`Removed (${r.reason}): ${r.slug} — matches ${r.match}`)
  if (removed.length > 0) {
    writeJson(SELECTION, kept)
    console.log(`Deduped selection: ${selection.length} → ${kept.length} (${removed.length} duplicates removed)`)
  } else {
    console.log(`Dedup check: all ${selection.length} stories are new`)
  }

  // Post-dedup category floor check — warn if dedup broke a minimum
  for (const f of floors) {
    const level = f.allowed ? 'Note: under floor (allowed)' : 'WARNING: post-dedup floor violation'
    console.log(`${level} — ${f.category}: ${f.count} < ${f.min}`)
  }
  return {
    counts: { selected: selection.length, kept: kept.length, removed: removed.length, underFloor: floors.filter((f) => !f.allowed).length },
    dropped: removed.map((r) => ({ slug: r.slug, reason: `${r.reason}: ${r.match}` })),
  }
}

await runStage(import.meta, 'dedup-selection', main)
