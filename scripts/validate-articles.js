#!/usr/bin/env node
// Validates the cycle's new articles before the build. One that may not ship
// is moved to `.bad`, so it is not deployed; one that can be mended is mended
// in place. What is judged, and how leniently, is `lib/validate-article.js`.
import { existsSync, readFileSync, renameSync } from 'node:fs'
import { basename } from 'node:path'
import { batchFiles } from './lib/article-files.js'
import { pathOf } from './lib/datasets.js'
import { readJson, writeText } from './lib/json-file.js'
import { runStage } from './lib/stage.js'
import { latestTrendsPath } from './lib/trends-snapshot.js'
import { createValidator, publishedKeys } from './lib/validate-article.js'

export function main() {
  const now = Date.now()
  const ARTICLES_DIR = pathOf('articles')
  const files = batchFiles()

  // What is already published, for the duplicate gates, without the batch itself.
  const published = publishedKeys(ARTICLES_DIR, now, new Set(files.map((f) => f.name)))

  // What each story was offered to cite, by the slug its article is saved under.
  const offeredBySlug = new Map()
  try {
    for (const story of JSON.parse(readFileSync(pathOf('selection'), 'utf8'))) {
      if (story?.suggestedSlug) offeredBySlug.set(story.suggestedSlug, story.indicators || [])
    }
  } catch { /* no selection: nothing to count citations against */ }
  const knownIds = new Set()
  const trendsPath = latestTrendsPath()
  for (const ind of (trendsPath ? readJson(trendsPath) : null)?.indicators || []) knownIds.add(ind.id)
  for (const c of readJson(pathOf('chokepoints'))?.chokepoints || []) knownIds.add(`cp:${c.id}`)
  for (const m of readJson(pathOf('markets'))?.exchanges || []) knownIds.add(`mkt:${m.id}`)
  for (const c of readJson(pathOf('companies'))?.companies || []) knownIds.add(`co:${c.id}`)

  const validator = createValidator({ published, offeredBySlug, knownIds })
  /** @type {{ slug: string, reason: string }[]} */
  const dropped = []
  /** @type {{ slug: string, reason: string }[]} */
  const flagged = []

  for (const { rel: f, path: full, name } of files) {
    if (!existsSync(full)) continue
    const { bad, text, events, problems } = validator.check(readFileSync(full, 'utf8'), name)
    // Whole or not at all: an article is a record, and nothing writes it again.
    if (text !== null) writeText(full, text)
    for (const event of events) console.log(`${event}: ${f}`)
    if (bad) {
      console.log(`SKIP (${bad}): ${f}`)
      renameSync(full, `${full}.bad`)
      dropped.push({ slug: basename(name, '.md'), reason: bad })
    } else if (problems.length) {
      flagged.push({ slug: basename(name, '.md'), reason: problems.join('; ') })
    }
  }

  const repeats = validator.repeats()
  for (const { files: where, text } of repeats) {
    console.log(`WARN (same block in ${where.length} articles: ${where.join(', ')}): "${text.slice(0, 90)}…"`)
  }

  // A measurement, not a gate: under "the subject decides" a chart may carry a
  // figure the prose leaves out, so `cite` is how often the two meet.
  const { removed, repaired, chartsSet, chartsDropped, chartsCited } = validator.counts
  if (chartsSet) console.log(`Charts: ${chartsSet} set, ${chartsDropped} dropped, ${chartsCited} cite the figure`)

  console.log(`Validated ${files.length} articles, ${removed} removed${repaired ? `, ${repaired} dateline(s) repaired` : ''}`)
  return {
    counts: { listed: files.length, removed, repaired, chartsSet, chartsDropped, chartsCited, repeatedBlocks: repeats.length },
    dropped,
    flagged,
  }
}

await runStage(import.meta, 'validate-articles', main)
