#!/usr/bin/env node
// Deterministic editorial-quality scan over the last 7 days of articles.
// Outputs:
//   the `qualityMetrics` file — the current snapshot
//   the `qualityTrend` file   — appended snapshot history (dashboard + git)
//
// Every metric maps to a rule in write-prompt.md or check-prompt.md, and is
// in `lib/quality-metrics.js`.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { articleFilesSince } from './lib/article-files.js'
import { pathOf } from './lib/datasets.js'
import { readJson, writeJson } from './lib/json-file.js'
import { WINDOW_DAYS, qualityRow, qualitySnapshot, qualitySummary, withSnapshot } from './lib/quality-metrics.js'
import { runStage } from './lib/stage.js'

export function main() {
  const ARTICLES_DIR = pathOf('articles')
  const TREND_PATH = pathOf('qualityTrend')
  const now = Date.now()
  const cutoff = now - WINDOW_DAYS * 86400_000

  // ── Load articles in window ─────────────────────────────────
  // The files that could be dated in it, by name (`articleFilesSince`);
  // `qualityRow` then goes by the date. This read and parsed every article
  // there is, 11,219 of them, to keep a week.
  const articles = []
  for (const f of articleFilesSince(ARTICLES_DIR, cutoff)) {
    try {
      const row = qualityRow(f, readFileSync(join(ARTICLES_DIR, f), 'utf-8'), cutoff)
      if (row) articles.push(row)
    } catch { /* an unparseable file is the validator's business */ }
  }
  if (articles.length === 0) {
    console.error('measure-quality: no articles in window — writing empty snapshot')
  }

  const snapshot = qualitySnapshot(articles, now)
  writeJson(pathOf('qualityMetrics'), snapshot)

  // ── Append to trend (replace same-week snapshot for idempotent reruns) ──
  writeJson(TREND_PATH, withSnapshot(readJson(TREND_PATH, []), snapshot))

  // ── Summary to stdout ─────────────────────────────────────
  for (const line of qualitySummary(snapshot)) console.log(line)
  return { counts: { articles: articles.length } }
}

await runStage(import.meta, 'measure-quality', main)
