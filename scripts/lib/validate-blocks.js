// Node mirror of mobile/lib/validate.ts parseArticleBlock.
// Runs at generation time so a malformed block from Claude is caught here
// (logged, then dropped) rather than silently disappearing when the app loads
// the brief. Keep this in sync with mobile — the runtime contract is the same.
//
// Missing on purpose: `quiz`. The mobile validator doesn't parse it either, so
// emitting one would be dropped on load. Matching that gap here means the
// generator doesn't save blocks the app would then silently discard.

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStringArray = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string')
const isNumberArray = (v) =>
  Array.isArray(v) && v.every((n) => typeof n === 'number' && Number.isFinite(n))

const isTone = (v) => v === 'favorable' || v === 'unfavorable' || v === 'neutral'

const isCompareRow = (v) => {
  if (!isObject(v)) return false
  if (typeof v.label !== 'string' || typeof v.value !== 'string') return false
  if (v.tone !== undefined && !isTone(v.tone)) return false
  if (v.cc !== undefined && typeof v.cc !== 'string') return false
  if (v.weight !== undefined && (typeof v.weight !== 'number' || !Number.isFinite(v.weight)))
    return false
  return true
}

const isActor = (v) => {
  if (!isObject(v)) return false
  if (typeof v.name !== 'string' || typeof v.role !== 'string') return false
  if (v.years !== undefined && typeof v.years !== 'string') return false
  if (v.cc !== undefined && typeof v.cc !== 'string') return false
  return true
}

const parseTrendAnnotation = (v, valuesLength) => {
  if (!isObject(v)) return null
  if (typeof v.atIndex !== 'number' || !Number.isInteger(v.atIndex)) return null
  if (v.atIndex < 0 || v.atIndex >= valuesLength) return null
  if (typeof v.label !== 'string' || v.label.length === 0) return null
  return { atIndex: v.atIndex, label: v.label }
}

function applySourceRef(block, v) {
  if (typeof v.source === 'number' && Number.isInteger(v.source) && v.source >= 0) {
    block.source = v.source
  }
  return block
}

/**
 * Validate a single block shape. Returns the cleaned block, or `{ block: null,
 * reason }` if malformed. The reason string is for generator-side logging — it
 * never reaches the app. Unknown types also return a reason so typos surface.
 *
 * @param {unknown} v
 * @returns {{ block: object | null, reason?: string }}
 */
export function parseArticleBlock(v) {
  if (!isObject(v) || typeof v.type !== 'string') {
    return { block: null, reason: 'not an object with a string `type`' }
  }
  switch (v.type) {
    case 'prose': {
      if (typeof v.text !== 'string') return { block: null, reason: 'prose.text must be string' }
      return { block: applySourceRef({ type: 'prose', text: v.text }, v) }
    }
    case 'compare': {
      if (!Array.isArray(v.rows)) return { block: null, reason: 'compare.rows must be array' }
      const rows = v.rows.filter(isCompareRow)
      if (rows.length === 0) return { block: null, reason: 'compare has no valid rows' }
      const block = { type: 'compare', rows }
      if (typeof v.label === 'string' && v.label.trim().length > 0) block.label = v.label
      return { block: applySourceRef(block, v) }
    }
    case 'trend': {
      if (!isNumberArray(v.values) || v.values.length < 2) {
        return { block: null, reason: 'trend.values must be ≥2 numbers' }
      }
      if (typeof v.label !== 'string') return { block: null, reason: 'trend.label must be string' }
      const block = { type: 'trend', values: v.values, label: v.label }
      if (typeof v.unit === 'string') block.unit = v.unit
      if (isStringArray(v.periods) && v.periods.length === v.values.length) {
        block.periods = v.periods
      }
      if (
        v.highlight === 'last' ||
        v.highlight === 'first' ||
        v.highlight === 'max' ||
        v.highlight === 'min'
      ) {
        block.highlight = v.highlight
      }
      if (Array.isArray(v.annotations)) {
        const anns = v.annotations
          .map((a) => parseTrendAnnotation(a, v.values.length))
          .filter((a) => a != null)
        if (anns.length > 0) block.annotations = anns
      }
      if (typeof v.link === 'string' && /^https?:\/\//.test(v.link)) {
        block.link = v.link
      }
      return { block: applySourceRef(block, v) }
    }
    case 'locations': {
      if (!isStringArray(v.codes) || v.codes.length === 0) {
        return { block: null, reason: 'locations.codes must be non-empty string array' }
      }
      const block = { type: 'locations', codes: v.codes }
      if (typeof v.label === 'string') block.label = v.label
      if (typeof v.caption === 'string') block.caption = v.caption
      return { block: applySourceRef(block, v) }
    }
    case 'quote': {
      if (typeof v.text !== 'string' || v.text.length === 0) {
        return { block: null, reason: 'quote.text must be non-empty string' }
      }
      const block = { type: 'quote', text: v.text }
      if (typeof v.speaker === 'string') block.speaker = v.speaker
      if (typeof v.year === 'string') block.year = v.year
      return { block: applySourceRef(block, v) }
    }
    case 'actors': {
      if (!Array.isArray(v.people)) return { block: null, reason: 'actors.people must be array' }
      const people = v.people.filter(isActor)
      if (people.length === 0) return { block: null, reason: 'actors has no valid people' }
      const block = { type: 'actors', people }
      if (typeof v.label === 'string') block.label = v.label
      return { block: applySourceRef(block, v) }
    }
    default:
      return { block: null, reason: `unknown block type '${v.type}'` }
  }
}
