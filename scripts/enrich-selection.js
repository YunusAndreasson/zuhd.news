#!/usr/bin/env node
// Post-selector: merges full article bodies from the feed back into the
// selection. The selector reads a slim feed (no bodies) to reduce token count;
// this script restores the bodies so the writer has full source text, and
// drops the picks that still have none worth writing from.
//
// The steps are `lib/enrich.js`; the matching itself is
// `lib/selection-match.js`.
import { readFileSync } from 'node:fs'
import { pathOf } from './lib/datasets.js'
import { attachSources, dropUnwritable, fillThinSources, readablePicks, thinSourcesOf } from './lib/enrich.js'
import { fetchSourceText } from './lib/fetch-source-text.js'
import { writeJson } from './lib/json-file.js'
import { runStage } from './lib/stage.js'

export async function main() {
  const feed = JSON.parse(readFileSync(pathOf('feed'), 'utf-8'))
  // The selector's file is held to its shape here, by the first stage to read
  // it: a pick no later stage could read is taken out, and said.
  const { picks: selection, problems, dropped: unreadable, flagged } = readablePicks(JSON.parse(readFileSync(pathOf('selection'), 'utf-8')))
  for (const problem of problems) console.error(`  ⚠ selection: ${problem}`)
  for (const { slug, reason } of unreadable) console.log(`Dropped selection entry ${slug}: ${reason}`)

  const { enriched, layers, missing, notes } = attachSources(selection, feed)
  for (const note of notes) console.error(note)

  const thinSources = thinSourcesOf(selection)
  let filled = 0
  if (thinSources.length > 0) {
    filled = await fillThinSources(thinSources, fetchSourceText)
    console.log(`Thin sources: fetched full text for ${filled}/${thinSources.length}`)
  }

  // A pick with no sources by now goes without a line of its own: the summary counts it.
  const sourceless = selection.filter((e) => !Array.isArray(e.sources) || e.sources.length === 0)
  const { kept, dropped } = dropUnwritable(selection)
  for (const { entry, why } of dropped) console.log(`Dropped "${entry.title}": ${why}`)
  const lost = selection.length - kept.length

  writeJson(pathOf('selection'), kept)
  const layerSummary = Object.entries(layers).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${v}`).join(' ')
  console.log(`Enriched ${enriched}/${selection.length} stories [${layerSummary}]` +
    (missing.length ? ` (${missing.length} not found: ${missing.join(', ')})` : ''))
  if (lost > 0) {
    console.log(`Dropped ${lost} sourceless entr${lost === 1 ? 'y' : 'ies'} — the writer is never handed a story with no source text`)
  }

  /** @param {any} entry */
  const nameOf = (entry) => entry.suggestedSlug || entry.title
  const unmatched = new Set(missing)
  return {
    counts: { selected: selection.length + unreadable.length, enriched, kept: kept.length, thinSources: thinSources.length, thinFilled: filled },
    dropped: [
      ...unreadable,
      ...sourceless.map((entry) => ({ slug: nameOf(entry), reason: unmatched.has(nameOf(entry)) ? 'no story in the feed matched it' : 'the story it matched has no sources' })),
      ...dropped.map(({ entry, why }) => ({ slug: nameOf(entry), reason: why })),
    ],
    ...(flagged.length > 0 ? { flagged } : {}),
  }
}

await runStage(import.meta, 'enrich-selection', main)
