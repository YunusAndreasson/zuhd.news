#!/usr/bin/env node
// compute-metrics.js — deterministic daily metrics for the tuning loop
// Reads today's articles + cycle logs, outputs JSON to stdout
// No LLM calls — pure data extraction. The figures are `lib/metrics.js`.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathOf } from './lib/datasets.js'
import { computeSourcing, cycleRow, dailyMetrics, metricsRow, sourcingRow } from './lib/metrics.js'
import { ROOT } from './lib/paths.js'
import { publishedTimes } from './lib/published-at.js'
import { runStage } from './lib/stage.js'

export function main() {
  const ARTICLES_DIR = pathOf('articles')
  const LOGS_DIR = pathOf('cycleLogs')
  const now = Date.now()
  const today = new Date(now).toISOString().slice(0, 10)
  const yesterday = new Date(now - 86400000).toISOString().slice(0, 10)

  // When each article was published: the author time of the commit that added
  // it, which freshness is measured to. An article's file does not carry it.
  // Both days' articles are committed by now: this runs at the end of the
  // 22:00 cycle, after its publish. Three days of log, because a story filed
  // under yesterday's date may have been published the day before that.
  const publishedAt = publishedTimes(ROOT, 3)

  /** @param {string} datePrefix */
  const readArticles = (datePrefix) => {
    if (!existsSync(ARTICLES_DIR)) return []
    const rows = []
    for (const f of readdirSync(ARTICLES_DIR).filter((n) => n.startsWith(datePrefix) && n.endsWith('.md'))) {
      try {
        rows.push(metricsRow(f, readFileSync(join(ARTICLES_DIR, f), 'utf-8'), publishedAt.get(f.replace(/\.md$/, '')) ?? null))
      } catch { /* an unparseable file is the validator's business */ }
    }
    return rows
  }

  /** @param {string} datePrefix */
  const readLogs = (datePrefix) =>
    existsSync(LOGS_DIR)
      ? readdirSync(LOGS_DIR)
          .filter((f) => f.startsWith(`cycle-${datePrefix}`) && f.endsWith('.log'))
          .sort()
          .map((f) => cycleRow(f, readFileSync(join(LOGS_DIR, f), 'utf-8')))
      : []

  /** @param {string} datePrefix */
  const readSourcing = (datePrefix) => {
    if (!existsSync(ARTICLES_DIR)) return null
    const names = readdirSync(ARTICLES_DIR).filter((f) => f.startsWith(datePrefix))
    const rows = []
    for (const f of names.filter((n) => n.endsWith('.md'))) {
      try {
        rows.push(sourcingRow(f, readFileSync(join(ARTICLES_DIR, f), 'utf-8')))
      } catch { /* an unparseable file is the validator's business */ }
    }
    return computeSourcing(rows, names.filter((f) => f.endsWith('.md.bad')).length)
  }

  const articles = { today: readArticles(today), yesterday: readArticles(yesterday) }
  // Outside a checkout, or with a log that does not reach back, there is no
  // publish time and freshness has nothing to stand on. Said on stderr, which
  // goes to the cycle's log: stdout is the tuner's file.
  if (articles.today.length + articles.yesterday.length > 0 && ![...articles.today, ...articles.yesterday].some((a) => a.publishedAt != null)) {
    console.error('compute-metrics: git names no commit for any of these articles — freshness is left empty')
  }
  const logs = { today: readLogs(today), yesterday: readLogs(yesterday) }
  const sourcing = { today: readSourcing(today), yesterday: readSourcing(yesterday) }

  const metrics = dailyMetrics(
    today,
    { articles: articles.today, sourcing: sourcing.today, logs: logs.today },
    { articles: articles.yesterday, sourcing: sourcing.yesterday, logs: logs.yesterday },
  )
  console.log(JSON.stringify(metrics, null, 2))
  return {
    counts: { articlesToday: articles.today.length, articlesYesterday: articles.yesterday.length, cyclesToday: logs.today.length, cyclesYesterday: logs.yesterday.length },
  }
}

await runStage(import.meta, 'compute-metrics', main)
