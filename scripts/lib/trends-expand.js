// Helpers for the edu-context stage to (1) build the "live indicators" section
// of the prompt from a trends digest, and (2) expand editor-emitted
// `{type:'chart', ref:'<id>'}` blocks into fully-populated `trend` blocks the
// mobile ArticleBlock renderer knows how to draw.
//
// Designed to fail gracefully: if the snapshot/digest files are missing the
// edu-context stage still runs, just without charts.

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

/** Load the most recent trends snapshot. Returns null if missing. */
export function loadTrendsSnapshot(root) {
  const today = new Date().toISOString().slice(0, 10)
  const snapPath = join(root, 'content', 'trends', `${today}.json`)
  if (!existsSync(snapPath)) return null
  try {
    return JSON.parse(readFileSync(snapPath, 'utf8'))
  } catch {
    return null
  }
}

/** Load the editor-facing digest. Returns null if missing. */
export function loadTrendsDigest(path) {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Build the "## Live indicators" section appended to the edu-context prompt.
 * Keep it compact — just id, label, latest value, tags. Claude resolves
 * relevance from tags + entry text.
 *
 * Returns an empty string if the digest is null/empty, so callers can
 * unconditionally concatenate.
 */
export function buildTrendsPromptSection(digest) {
  if (!digest?.indicators?.length) return ''

  const lines = digest.indicators.map((i) => {
    const latest = i.latest != null ? ` — latest ${i.latest}${i.unit ? ' ' + i.unit : ''}` : ''
    const tags = i.topicTags?.length ? ` · tags: ${i.topicTags.slice(0, 6).join(', ')}` : ''
    const countries = i.countryTags?.length ? ` · countries: ${i.countryTags.join(', ')}` : ''
    return `- \`${i.id}\` — ${i.label}${latest}${tags}${countries}`
  })

  return `\n## Live indicators (as of ${digest.asOf})

You may reference any of the following by \`id\` via \`{"type":"chart","ref":"<id>"}\` in an entry's \`blocks\` array. The generator expands the ref into a real chart at save time — do NOT inline values.

${lines.join('\n')}
`
}

/**
 * Expand an editor-emitted chart ref into a populated `trend` block (mobile's
 * ArticleBlock shape). Returns null if the ref is unknown or the indicator
 * has no values.
 *
 * @param {{type:'chart',ref:string}} chartBlock
 * @param {object} snapshot         Full snapshot loaded by loadTrendsSnapshot.
 * @param {{sourceIndex: Map<string,number>, sources: string[]}} sourceCtx
 *        Mutable bookkeeping so we can share one `sources` array across all
 *        blocks in a brief and point each block's `source` to the right index.
 * @returns {object | null}
 */
export function expandChartRef(chartBlock, snapshot, sourceCtx) {
  if (!chartBlock || chartBlock.type !== 'chart' || !chartBlock.ref) return null
  const indicator = snapshot?.indicators?.find((i) => i.id === chartBlock.ref)
  if (!indicator || !Array.isArray(indicator.values) || indicator.values.length < 2) return null

  // Derive a "first/last" annotation pair for Polymarket markets only, since
  // their history often includes a meaningful inflection. For static macro
  // series (Brent, FX) we keep annotations empty — the default highlight +
  // endpoint dots are enough.
  const annotations = []
  if (indicator.source === 'polymarket' && indicator.periods?.length >= 2) {
    annotations.push({ atIndex: 0, label: indicator.periods[0] })
    annotations.push({
      atIndex: indicator.values.length - 1,
      label: `${indicator.values[indicator.values.length - 1]}%`,
    })
  }

  // Append sourceLabel to shared sources[] once; reuse index on subsequent
  // blocks that cite the same source.
  const label = indicator.sourceLabel + (indicator.asOf ? ` · as of ${indicator.asOf}` : '')
  let idx = sourceCtx.sourceIndex.get(label)
  if (idx == null) {
    sourceCtx.sources.push(label)
    idx = sourceCtx.sources.length - 1
    sourceCtx.sourceIndex.set(label, idx)
  }

  return {
    type: 'trend',
    values: indicator.values,
    periods: indicator.periods,
    label: indicator.label,
    unit: indicator.unit,
    highlight: indicator.defaultHighlight || 'last',
    ...(annotations.length ? { annotations } : {}),
    source: idx,
  }
}

/**
 * Apply chart-ref expansion to a Claude-emitted `entries[]` array. Returns
 * `{ timeline, sources, picked }` ready to save into a ContextBrief. `picked`
 * is a list of `{id, heading}` for logging.
 *
 * @param {Array<{heading?: string, body: string, blocks?: Array<{type:string, ref?:string}>}>} entries
 * @param {object | null} snapshot   Loaded by loadTrendsSnapshot. Null → no charts.
 * @param {(msg: string) => void} [warn]   Logger for unknown refs.
 */
export function buildTimelineWithCharts(entries, snapshot, warn = () => {}) {
  const sourceCtx = { sourceIndex: new Map(), sources: [] }
  const picked = []

  const timeline = entries
    .filter((e) => e && typeof e.body === 'string' && e.body.length > 0)
    .map((e) => {
      const out = { ...(e.heading ? { heading: e.heading } : {}), body: e.body }
      if (Array.isArray(e.blocks) && e.blocks.length && snapshot) {
        const expanded = []
        for (const b of e.blocks) {
          if (b?.type === 'chart' && b.ref) {
            const trend = expandChartRef(b, snapshot, sourceCtx)
            if (trend) {
              expanded.push(trend)
              picked.push({ id: b.ref, heading: e.heading || null })
            } else {
              warn(`dropping unknown/empty chart ref '${b.ref}'`)
            }
          }
        }
        if (expanded.length) out.blocks = expanded
      }
      return out
    })

  return { timeline, sources: sourceCtx.sources, picked }
}
