// Helpers for the edu-context stage to (1) build the "live indicators" section
// of the prompt from a trends digest, and (2) expand editor-emitted
// `{type:'chart', ref:'<id>'}` blocks into fully-populated `trend` blocks the
// mobile ArticleBlock renderer knows how to draw.
//
// Designed to fail gracefully: if the snapshot/digest files are missing the
// edu-context stage still runs, just without charts.

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { parseArticleBlock } from './validate-blocks.js'

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

  // Annotate Polymarket endpoints with their probabilities so the reader sees
  // the move (e.g. "12% → 47%") at a glance. Both labels are values — mixing
  // a date label with a percent label looked inconsistent. For static macro
  // series (Brent, FX) we keep annotations empty — the default highlight dot
  // and the x-axis period anchors are enough.
  const annotations = []
  if (indicator.source === 'polymarket' && indicator.values.length >= 2) {
    const lastIdx = indicator.values.length - 1
    annotations.push({ atIndex: 0, label: `${indicator.values[0]}%` })
    annotations.push({ atIndex: lastIdx, label: `${indicator.values[lastIdx]}%` })
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
    ...(indicator.marketUrl ? { link: indicator.marketUrl } : {}),
    source: idx,
  }
}

/**
 * Transform a Claude-emitted `entries[]` array into a timeline ready to save
 * into a ContextBrief. Two passes over each entry's `blocks`:
 *   1. `{type:'chart', ref}` → expanded to a populated `trend` block via the
 *      live-indicators snapshot (server-authored data, no fabrication risk).
 *   2. Any other type → validated against the mobile block schema (mirror of
 *      `mobile/lib/validate.ts parseArticleBlock`) and passed through as-is.
 *      Malformed blocks are dropped with a warn.
 *
 * @param {Array<{heading?: string, body: string, blocks?: unknown[]}>} entries
 * @param {object | null} snapshot   Loaded by loadTrendsSnapshot. Null → skip
 *                                   chart expansion; literal blocks still pass.
 * @param {(msg: string) => void} [warn]   Logger for drops.
 * @returns {{
 *   timeline: object[],
 *   sources: string[],
 *   picked: {id: string, heading: string | null}[],
 *   literals: {type: string, heading: string | null}[],
 *   dropped: {type: string, heading: string | null, reason: string, ref?: string}[]
 * }}
 */
export function buildTimelineWithCharts(entries, snapshot, warn = () => {}) {
  const sourceCtx = { sourceIndex: new Map(), sources: [] }
  const picked = []
  const literals = []
  const dropped = []

  const timeline = entries
    .filter((e) => e && typeof e.body === 'string' && e.body.length > 0)
    .map((e) => {
      const heading = e.heading || null
      const out = { ...(e.heading ? { heading: e.heading } : {}), body: e.body }
      if (!Array.isArray(e.blocks) || e.blocks.length === 0) return out

      const expanded = []
      for (const b of e.blocks) {
        if (!b || typeof b !== 'object') {
          const reason = 'not an object'
          dropped.push({ type: 'unknown', heading, reason })
          warn(`dropping non-object block under '${e.heading || 'entry'}'`)
          continue
        }
        if (b.type === 'chart') {
          if (!snapshot) {
            const reason = 'no trends snapshot loaded'
            dropped.push({ type: 'chart', heading, reason, ref: b.ref })
            warn(`dropping chart ref '${b.ref}' — ${reason}`)
            continue
          }
          const trend = expandChartRef(b, snapshot, sourceCtx)
          if (trend) {
            expanded.push(trend)
            picked.push({ id: b.ref, heading })
          } else {
            const reason = 'unknown or empty chart ref'
            dropped.push({ type: 'chart', heading, reason, ref: b.ref })
            warn(`dropping unknown/empty chart ref '${b.ref}'`)
          }
          continue
        }
        const { block, reason } = parseArticleBlock(b)
        if (block) {
          expanded.push(block)
          literals.push({ type: block.type, heading })
        } else {
          dropped.push({ type: b.type || 'unknown', heading, reason: reason || 'unknown' })
          warn(`dropping malformed ${b.type || 'unknown'} block under '${e.heading || 'entry'}': ${reason}`)
        }
      }
      if (expanded.length) out.blocks = expanded
      return out
    })

  return { timeline, sources: sourceCtx.sources, picked, literals, dropped }
}
