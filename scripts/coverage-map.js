#!/usr/bin/env node
// Outputs a compact topic-grouped coverage map of articles published in the last 24 hours.
// Uses frontmatter date (not mtime — git ops change mtime, breaking the window).
// Its stdout goes into the selector's prompt, and nothing else may be printed there.
import { join } from 'node:path'
import { tryReadArticle } from './lib/article.js'
import { articleFilesSince } from './lib/article-files.js'
import { coverageLines } from './lib/coverage-map.js'
import { pathOf } from './lib/datasets.js'
import { runStage } from './lib/stage.js'

export function main() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  const dir = pathOf('articles')

  /** @type {string[]} */
  let slugs = []
  try {
    // The names that could fall in the window, then the date each one states:
    // this read every article ever published to keep a day of them.
    slugs = articleFilesSince(dir, cutoff)
      .filter((f) => {
        const { article } = tryReadArticle(join(dir, f))
        const date = article?.meta.date ? new Date(article.meta.date).getTime() : 0
        return date >= cutoff
      })
      .map((f) => f.slice(11, -3)) // strip YYYY-MM-DD- prefix and .md suffix
  } catch {}
  if (!slugs.length) return { skipped: 'nothing published in the last day' }

  process.stdout.write(`${coverageLines(slugs).join('\n')}\n`)
  return { counts: { articles: slugs.length } }
}

await runStage(import.meta, 'coverage-map', main)
