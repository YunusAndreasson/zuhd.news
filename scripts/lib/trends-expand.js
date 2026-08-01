// Helpers for the edu-context stage to (1) build the "live indicators" section
// of the prompt from a trends digest, and (2) expand editor-emitted
// `{type:'chart', ref:'<id>'}` blocks into fully-populated `trend` blocks the
// mobile ArticleBlock renderer knows how to draw.
//
// Designed to fail gracefully: if the snapshot/digest files are missing the
// edu-context stage still runs, just without charts.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
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
 * The published snapshot shape, taken from the type the site actually
 * publishes rather than restated here. `{object}` — which these three
 * parameters carried until 2026-08-01 — is TypeScript's *non-primitive with no
 * known properties*, not "a JSON object": every `snapshot.indicators` read
 * against it was an error, and before anything typechecked this file it simply
 * meant the annotation documented nothing.
 * @typedef {import('../../shared/types.ts').TrendsSnapshot} TrendsSnapshot
 */

/**
 * Build the "## Live indicators" section appended to the edu-context prompt.
 * Keep it compact — just id, label, latest value, tags. Claude resolves
 * relevance from tags + entry text.
 *
 * Returns an empty string if the digest is null/empty, so callers can
 * unconditionally concatenate.
 */
const TRENDS_OFFER_CAP = 25

// Editor only picks ~5% of offered indicators (~2.6/cycle from ~54 offered).
// Cap to the freshest TRENDS_OFFER_CAP so the prompt stays tight without
// changing pick volume. Sort by `asOf` desc; missing/older entries fall last.
export function selectOfferedIndicators(digest) {
  if (!digest?.indicators?.length) return []
  const ranked = [...digest.indicators].sort((a, b) => {
    const aAt = a.asOf || ''
    const bAt = b.asOf || ''
    return bAt.localeCompare(aAt)
  })
  return ranked.slice(0, TRENDS_OFFER_CAP)
}

export function buildTrendsPromptSection(digest) {
  if (!digest?.indicators?.length) return ''

  const offered = selectOfferedIndicators(digest)

  const lines = offered.map((i) => {
    const latest = i.latest != null ? ` — latest ${i.latest}${i.unit ? ` ${i.unit}` : ''}` : ''
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
 * Append a source label to the shared sources[] once and return its index.
 * Idempotent across calls — the brief ends up with one citation per distinct
 * source even when many blocks point to it.
 */
function rememberSource(label, sourceCtx) {
  let idx = sourceCtx.sourceIndex.get(label)
  if (idx == null) {
    sourceCtx.sources.push(label)
    idx = sourceCtx.sources.length - 1
    sourceCtx.sourceIndex.set(label, idx)
  }
  return idx
}

function indicatorSourceLabel(indicator) {
  return indicator.sourceLabel + (indicator.asOf ? ` · as of ${indicator.asOf}` : '')
}

/**
 * Expand an editor-emitted chart ref into a populated `trend` block (mobile's
 * ArticleBlock shape). Returns null if the ref is unknown or the indicator
 * has no values.
 *
 * @param {{type:'chart',ref:string}} chartBlock
 * @param {TrendsSnapshot} snapshot Full snapshot loaded by loadTrendsSnapshot.
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

  const idx = rememberSource(indicatorSourceLabel(indicator), sourceCtx)

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
 * Expand a multi-chart ref (`{type:'multi-chart', refs:['brent','wti'], label?}`)
 * into a single `trend` block carrying a `series` array. Each series mirrors
 * one indicator. The block uses the FIRST indicator's `periods` and `unit` —
 * series with mismatched periods get truncated to the common length. The
 * generator's responsibility is to pick refs whose periods align (e.g. two
 * daily commodities); refs with disjoint periods will silently render as
 * truncated series. Returns null if fewer than 2 valid indicators resolve.
 *
 * @param {{type:'multi-chart',refs:string[],label?:string}} block
 * @param {TrendsSnapshot} snapshot
 * @param {{sourceIndex: Map<string,number>, sources: string[]}} sourceCtx
 * @returns {object | null}
 */
export function expandMultiChartRef(block, snapshot, sourceCtx) {
  if (!block || block.type !== 'multi-chart' || !Array.isArray(block.refs)) return null
  const indicators = block.refs
    .map((ref) => snapshot?.indicators?.find((i) => i.id === ref))
    .filter((i) => i && Array.isArray(i.values) && i.values.length >= 2)
  if (indicators.length < 2) return null

  // Common length = the shortest of the resolved series' values arrays.
  // Each series gets right-trimmed to that length (so the most recent N
  // points align across series — typical use is "last 60 days of two
  // commodities").
  const commonLen = Math.min(...indicators.map((i) => i.values.length))
  const periods = indicators[0].periods?.slice(-commonLen)
  const unit = indicators[0].unit
  const series = indicators.map((i) => ({
    values: i.values.slice(-commonLen),
    label: i.label,
    highlight: i.defaultHighlight || 'last',
  }))
  // Source index — append every distinct source label once, but the trend
  // block carries only the first source on its `source` field; the on-canvas
  // stamp covers the most prominent series and the brief's sources[] still
  // lists all of them for the reader who taps through.
  const firstIdx = rememberSource(indicatorSourceLabel(indicators[0]), sourceCtx)
  for (let i = 1; i < indicators.length; i++) {
    rememberSource(indicatorSourceLabel(indicators[i]), sourceCtx)
  }

  const label = block.label || indicators.map((i) => i.label).join(' vs ')
  const out = {
    type: 'trend',
    series,
    label,
    source: firstIdx,
  }
  if (unit) out.unit = unit
  if (periods && periods.length === commonLen) out.periods = periods
  return out
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
 * @param {TrendsSnapshot | null} snapshot   Loaded by loadTrendsSnapshot. Null → skip
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
      for (const raw of e.blocks) {
        if (!raw || typeof raw !== 'object') {
          const reason = 'not an object'
          dropped.push({ type: 'unknown', heading, reason })
          warn(`dropping non-object block under '${e.heading || 'entry'}'`)
          continue
        }
        // `typeof x === 'object'` narrows to TypeScript's `object`, which is
        // "non-primitive" and carries no properties at all — so every `b.type`
        // below reads as an error against it. The block is arbitrary parsed
        // JSON and this says so.
        const b = /** @type {Record<string, any>} */ (raw)
        if (b.type === 'chart') {
          if (!snapshot) {
            const reason = 'no trends snapshot loaded'
            dropped.push({ type: 'chart', heading, reason, ref: b.ref })
            warn(`dropping chart ref '${b.ref}' — ${reason}`)
            continue
          }
          const trend = expandChartRef(/** @type {{type:'chart',ref:string}} */ (b), snapshot, sourceCtx)
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
        if (b.type === 'multi-chart') {
          if (!snapshot) {
            const reason = 'no trends snapshot loaded'
            dropped.push({ type: 'multi-chart', heading, reason })
            warn(`dropping multi-chart refs ${JSON.stringify(b.refs)} — ${reason}`)
            continue
          }
          const trend = expandMultiChartRef(/** @type {{type:'multi-chart',refs:string[],label?:string}} */ (b), snapshot, sourceCtx)
          if (trend) {
            expanded.push(trend)
            picked.push({ id: (b.refs || []).join('+'), heading })
          } else {
            const reason = 'fewer than 2 valid refs resolved'
            dropped.push({ type: 'multi-chart', heading, reason })
            warn(`dropping multi-chart refs ${JSON.stringify(b.refs)} — ${reason}`)
          }
          continue
        }
        const { block, reason } = parseArticleBlock(b)
        // parseArticleBlock declares `object|null`, which has no properties.
        const lit = /** @type {Record<string, any>|null} */ (block)
        if (block) {
          expanded.push(block)
          literals.push({ type: lit?.type, heading })
        } else {
          dropped.push({ type: b.type || 'unknown', heading, reason: reason || 'unknown' })
          warn(`dropping malformed ${b.type || 'unknown'} block under '${e.heading || 'entry'}': ${reason}`)
        }
      }
      if (expanded.length) /** @type {Record<string, any>} */ (out).blocks = expanded
      return out
    })

  return { timeline, sources: sourceCtx.sources, picked, literals, dropped }
}
