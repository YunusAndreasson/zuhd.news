// Node mirror of mobile/lib/validate.ts parseArticleBlock.
// Runs at generation time so a malformed block from Claude is caught here
// (logged, then dropped) rather than silently disappearing when the app loads
// the brief. Keep this in sync with mobile — the runtime contract is the same.

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStringArray = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string')
const isNumberArray = (v) =>
  Array.isArray(v) && v.every((n) => typeof n === 'number' && Number.isFinite(n))

const isTone = (v) => v === 'favorable' || v === 'unfavorable' || v === 'neutral'

const isCompareSegment = (v) => {
  if (!isObject(v)) return false
  if (typeof v.value !== 'number' || !Number.isFinite(v.value) || v.value < 0) return false
  if (v.tone !== undefined && !isTone(v.tone)) return false
  if (v.label !== undefined && typeof v.label !== 'string') return false
  return true
}

const isCompareRow = (v) => {
  if (!isObject(v)) return false
  if (typeof v.label !== 'string' || typeof v.value !== 'string') return false
  if (v.tone !== undefined && !isTone(v.tone)) return false
  if (v.cc !== undefined && typeof v.cc !== 'string') return false
  if (v.weight !== undefined && (typeof v.weight !== 'number' || !Number.isFinite(v.weight)))
    return false
  if (v.segments !== undefined) {
    if (!Array.isArray(v.segments)) return false
    if (!v.segments.every(isCompareSegment)) return false
  }
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
      // A trend block carries either `values` (single series) or `series`
      // (multi). Series capped at 3 — beyond that it reads as noise on a
      // 360px viewport.
      const hasValues = isNumberArray(v.values) && v.values.length >= 2
      const hasSeries =
        Array.isArray(v.series) &&
        v.series.length > 0 &&
        v.series.every(
          (s) =>
            isObject(s) &&
            typeof s.label === 'string' &&
            isNumberArray(s.values) &&
            s.values.length >= 2,
        )
      if (!hasValues && !hasSeries) {
        return { block: null, reason: 'trend needs `values` (≥2 numbers) or non-empty `series`' }
      }
      if (typeof v.label !== 'string') return { block: null, reason: 'trend.label must be string' }
      const primaryValues = hasSeries
        ? v.series.reduce((longest, s) => (s.values.length > longest.length ? s.values : longest), v.series[0].values)
        : v.values
      const block = { type: 'trend', label: v.label }
      if (hasValues) block.values = v.values
      if (hasSeries) {
        block.series = v.series.slice(0, 3).map((s) => {
          const out = { values: s.values, label: s.label }
          if (
            s.highlight === 'last' ||
            s.highlight === 'first' ||
            s.highlight === 'max' ||
            s.highlight === 'min'
          ) {
            out.highlight = s.highlight
          }
          return out
        })
      }
      if (typeof v.unit === 'string') block.unit = v.unit
      if (isStringArray(v.periods) && v.periods.length === primaryValues.length) {
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
          .map((a) => parseTrendAnnotation(a, primaryValues.length))
          .filter((a) => a != null)
        if (anns.length > 0) block.annotations = anns
      }
      if (v.scale === 'linear' || v.scale === 'log') {
        // Log scale requires strictly positive values across every series and
        // the band — silently downgrade to linear if anything fails.
        if (v.scale === 'log') {
          const allPositive =
            (!hasValues || v.values.every((n) => n > 0)) &&
            (!hasSeries || v.series.every((s) => s.values.every((n) => n > 0)))
          if (allPositive) block.scale = 'log'
        } else {
          block.scale = 'linear'
        }
      }
      if (
        isObject(v.band) &&
        isNumberArray(v.band.low) &&
        isNumberArray(v.band.high) &&
        v.band.low.length === primaryValues.length &&
        v.band.high.length === primaryValues.length
      ) {
        const band = { low: v.band.low, high: v.band.high }
        if (typeof v.band.label === 'string') band.label = v.band.label
        block.band = band
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
      // Site markers — drop quietly if any field is malformed; per-marker
      // dropping isn't worth the complexity.
      if (Array.isArray(v.markers)) {
        const markers = v.markers.filter(
          (m) =>
            isObject(m) &&
            typeof m.lat === 'number' &&
            Number.isFinite(m.lat) &&
            m.lat >= -90 &&
            m.lat <= 90 &&
            typeof m.lng === 'number' &&
            Number.isFinite(m.lng) &&
            m.lng >= -180 &&
            m.lng <= 180 &&
            typeof m.label === 'string' &&
            m.label.length > 0 &&
            m.label.length <= 30,
        )
        if (markers.length > 0) block.markers = markers.slice(0, 8)
      }
      // Choropleth values — codes referenced must be a subset of the highlight set.
      if (Array.isArray(v.values)) {
        const codeSet = new Set(v.codes.map((c) => c.toUpperCase()))
        const values = v.values.filter(
          (entry) =>
            isObject(entry) &&
            typeof entry.cc === 'string' &&
            codeSet.has(entry.cc.toUpperCase()) &&
            typeof entry.value === 'number' &&
            Number.isFinite(entry.value),
        )
        if (values.length >= 2) {
          block.values = values.map((entry) => ({ cc: entry.cc, value: entry.value }))
          if (typeof v.valueLabel === 'string') block.valueLabel = v.valueLabel
        }
      }
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
    case 'quiz': {
      if (typeof v.question !== 'string' || v.question.length === 0) {
        return { block: null, reason: 'quiz.question must be non-empty string' }
      }
      if (!isStringArray(v.options) || v.options.length < 2) {
        return { block: null, reason: 'quiz.options must be ≥2 strings' }
      }
      if (
        typeof v.correct !== 'number' ||
        !Number.isInteger(v.correct) ||
        v.correct < 0 ||
        v.correct >= v.options.length
      ) {
        return { block: null, reason: 'quiz.correct must be integer index into options' }
      }
      const block = {
        type: 'quiz',
        question: v.question,
        options: v.options,
        correct: v.correct,
      }
      if (typeof v.explanation === 'string' && v.explanation.length > 0) {
        block.explanation = v.explanation
      }
      return { block: applySourceRef(block, v) }
    }
    case 'timeline': {
      const isYearLike = (s) =>
        typeof s === 'string' && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(s)
      const events = Array.isArray(v.events)
        ? v.events
            .filter(
              (e) =>
                isObject(e) &&
                isYearLike(e.year) &&
                typeof e.label === 'string' &&
                e.label.length > 0 &&
                e.label.length <= 60,
            )
            .map((e) => {
              const out = { year: e.year, label: e.label }
              if (e.emphasis === 'start' || e.emphasis === 'end' || e.emphasis === 'pivot') {
                out.emphasis = e.emphasis
              }
              return out
            })
            .slice(0, 8)
        : []
      const spans = Array.isArray(v.spans)
        ? v.spans
            .filter(
              (s) =>
                isObject(s) &&
                isYearLike(s.from) &&
                isYearLike(s.to) &&
                typeof s.label === 'string' &&
                s.label.length > 0 &&
                s.label.length <= 60,
            )
            .map((s) => {
              const out = { from: s.from, to: s.to, label: s.label }
              if (isTone(s.tone)) out.tone = s.tone
              return out
            })
            .slice(0, 3)
        : []
      if (events.length === 0 && spans.length === 0) {
        return { block: null, reason: 'timeline needs at least one event or span' }
      }
      const block = { type: 'timeline' }
      if (events.length > 0) block.events = events
      if (spans.length > 0) block.spans = spans
      if (typeof v.label === 'string') block.label = v.label
      return { block: applySourceRef(block, v) }
    }
    case 'rank': {
      if (typeof v.metric !== 'string' || v.metric.length === 0) {
        return { block: null, reason: 'rank.metric must be non-empty string' }
      }
      const hasSubjectCc = typeof v.subjectCc === 'string' && v.subjectCc.length > 0
      const hasSubjectLabel = typeof v.subjectLabel === 'string' && v.subjectLabel.length > 0
      if (!hasSubjectCc && !hasSubjectLabel) {
        return { block: null, reason: 'rank needs subjectCc (country) or subjectLabel (non-country)' }
      }
      if (!Array.isArray(v.peers)) return { block: null, reason: 'rank.peers must be array' }
      const peers = v.peers.filter(
        (p) =>
          isObject(p) &&
          typeof p.value === 'number' &&
          Number.isFinite(p.value) &&
          ((typeof p.cc === 'string' && p.cc.length > 0) ||
            (typeof p.label === 'string' && p.label.length > 0)),
      )
      if (peers.length < 5) return { block: null, reason: 'rank needs ≥5 peers (incl. subject)' }
      const subjectInPeers = peers.some((p) =>
        hasSubjectCc
          ? typeof p.cc === 'string' && p.cc.toUpperCase() === v.subjectCc.toUpperCase()
          : typeof p.label === 'string' && p.label === v.subjectLabel,
      )
      if (!subjectInPeers) {
        return { block: null, reason: 'rank subject not present among peers' }
      }
      const block = {
        type: 'rank',
        metric: v.metric,
        peers: peers.map((p) => {
          const out = { value: p.value }
          if (typeof p.cc === 'string' && p.cc.length > 0) out.cc = p.cc
          if (typeof p.label === 'string' && p.label.length > 0) out.label = p.label
          return out
        }),
      }
      if (hasSubjectCc) block.subjectCc = v.subjectCc
      if (hasSubjectLabel) block.subjectLabel = v.subjectLabel
      if (typeof v.unit === 'string') block.unit = v.unit
      return { block: applySourceRef(block, v) }
    }
    case 'sankey': {
      if (!Array.isArray(v.nodes) || !Array.isArray(v.links)) {
        return { block: null, reason: 'sankey needs nodes[] and links[]' }
      }
      const nodes = v.nodes.filter(
        (n) =>
          isObject(n) &&
          typeof n.id === 'string' &&
          n.id.length > 0 &&
          typeof n.label === 'string' &&
          n.label.length > 0 &&
          n.label.length <= 30,
      )
      if (nodes.length < 2 || nodes.length > 12) {
        return { block: null, reason: 'sankey needs 2–12 valid nodes' }
      }
      const ids = new Set(nodes.map((n) => n.id))
      const links = v.links
        .filter(
          (l) =>
            isObject(l) &&
            typeof l.source === 'string' &&
            typeof l.target === 'string' &&
            l.source !== l.target &&
            ids.has(l.source) &&
            ids.has(l.target) &&
            typeof l.value === 'number' &&
            Number.isFinite(l.value) &&
            l.value > 0,
        )
        .slice(0, 15)
        .map((l) => {
          const out = { source: l.source, target: l.target, value: l.value }
          if (typeof l.label === 'string') out.label = l.label
          return out
        })
      if (links.length === 0) return { block: null, reason: 'sankey has no valid links' }
      const block = { type: 'sankey', nodes: nodes.map((n) => ({ id: n.id, label: n.label })), links }
      if (typeof v.label === 'string') block.label = v.label
      return { block: applySourceRef(block, v) }
    }
    case 'treemap': {
      if (!Array.isArray(v.items)) return { block: null, reason: 'treemap.items must be array' }
      const items = v.items
        .filter(
          (it) =>
            isObject(it) &&
            typeof it.label === 'string' &&
            it.label.length > 0 &&
            it.label.length <= 24 &&
            typeof it.value === 'number' &&
            Number.isFinite(it.value) &&
            it.value > 0,
        )
        .map((it) => {
          const out = { label: it.label, value: it.value }
          if (isTone(it.tone)) out.tone = it.tone
          return out
        })
        .slice(0, 10)
      if (items.length < 2) return { block: null, reason: 'treemap needs ≥2 valid items' }
      const block = { type: 'treemap', items }
      if (typeof v.label === 'string') block.label = v.label
      return { block: applySourceRef(block, v) }
    }
    default:
      return { block: null, reason: `unknown block type '${v.type}'` }
  }
}
