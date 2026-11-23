// The story's chart on its article page: the line the map's card draws under
// the title, with the same three figures, printed at build.
//
// The card (`storyChart`, `_map/popup.ts`) fetches `/api/entity/{id}.json` and
// draws `sparkline` over the whole record. This reads the same file, as the
// build has just written it, and draws the same geometry from the same module
// (`shared/chart/spark.ts`): the figures cannot disagree because neither
// surface computes them. Which series is `chartOf`'s rule, restated below
// over the same filtered inputs the story payload gets.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { escHtml } from '../lib/html.js'
import { loadShared } from './shared-ts.js'

const { SPARK_H, SPARK_W, sparkAreaPath, sparkDot, sparkGeometry, sparkLinePoints, sparkMove } =
  await loadShared('chart/spark.ts')

/** A company's and an AI lab's series have no `/api/entity` file (`hasSeriesRecord`). */
const hasSeriesRecord = (id) => !/^(?:co|ai):/.test(id)

/**
 * The series a story's card draws: the one it names (`chart:`), else the
 * first it follows that has a record. Both through `indicatorMap`, as the
 * story payload filters them.
 *
 * @param {Record<string, any>} meta the article's frontmatter
 * @param {Map<string, unknown>} indicatorMap
 * @param {(id: string) => string} canonical `canonicalIndicatorId`
 * @returns {string | null}
 */
export const storyChartId = (meta, indicatorMap, canonical) => {
  const named = typeof meta.chart === 'string' ? canonical(meta.chart.trim()) : ''
  if (named && indicatorMap.has(named) && hasSeriesRecord(named)) return named
  for (const e of Array.isArray(meta.entities) ? meta.entities : []) {
    const id = e?.indicatorId ? canonical(e.indicatorId) : ''
    if (id && indicatorMap.has(id) && hasSeriesRecord(id)) return id
  }
  return null
}

const records = new Map()
const recordOf = (distDir, id) => {
  if (records.has(id)) return records.get(id)
  const path = join(distDir, 'api', 'entity', `${id}.json`)
  let record = null
  try {
    if (existsSync(path)) record = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    record = null
  }
  records.set(id, record)
  return record
}

/**
 * The figure, or `''` where the story has no series or the series has too
 * little to draw: the card drops its block on the same answer.
 *
 * @param {string | null} id
 * @param {string} distDir
 * @returns {string}
 */
export const storyChartHtml = (id, distDir) => {
  if (!id) return ''
  const record = recordOf(distDir, id)
  const values = Array.isArray(record?.values) ? record.values.map((v) => (v == null ? Number.NaN : Number(v))) : []
  const g = values.length ? sparkGeometry({ values, window: values.length }) : null
  if (!g) return ''

  const move = sparkMove(g, record.unit)
  const tone = move.delta > 0 ? ' is-pos' : move.delta < 0 ? ' is-neg' : ''
  const periods = Array.isArray(record.periods) ? record.periods : []
  const dated = periods.filter((_, i) => Number.isFinite(values[i]))
  const dot = sparkDot(g)
  // One chart a page, so one gradient id is unique.
  const spark =
    `<svg class="spark" viewBox="0 0 ${SPARK_W} ${SPARK_H}" preserveAspectRatio="none" aria-hidden="true" focusable="false">` +
    '<defs><linearGradient id="article-spark-fill" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="currentColor" stop-opacity="0.3"/>' +
    '<stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>' +
    `<path class="spark-area" d="${sparkAreaPath(g)}" fill="url(#article-spark-fill)"/>` +
    `<polyline class="spark-line" points="${sparkLinePoints(g)}"/>` +
    (dot ? `<line class="spark-dot" x1="${dot[0]}" y1="${dot[1]}" x2="${dot[0]}" y2="${dot[1]}"/>` : '') +
    '</svg>'

  const source = typeof record.sourceLabel === 'string' && record.sourceLabel ? record.sourceLabel : ''
  return (
    `<figure class="article-chart${tone}">` +
    `<a class="article-chart-link" href="/e/${encodeURIComponent(id)}">` +
    '<span class="article-chart-head">' +
    `<span class="article-chart-label">${escHtml(record.label || id)}</span>` +
    `<span class="article-chart-reading">${escHtml(record.currentFormatted || '')}</span>` +
    `<span class="article-chart-move">${escHtml(move.text)}</span>` +
    '</span>' +
    spark +
    `<span class="article-chart-span"><span>${escHtml(dated[0] ?? '')}</span><span>${escHtml(dated[dated.length - 1] ?? '')}</span></span>` +
    '</a>' +
    (source ? `<figcaption class="article-chart-source">${escHtml(source)}</figcaption>` : '') +
    '</figure>'
  )
}
