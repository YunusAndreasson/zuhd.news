import { datelineOf, stripDateline, visibleText } from './article.js'
import { splitBlocks } from './blocks.js'
import { parseFrontmatter, setStarterField } from './frontmatter.js'
import { datedPoints } from './indicator-offer.js'
import { validDay } from './period.js'
import { classificationProblem } from './starter-topics.js'

function sourced(source) {
  try { return ['http:', 'https:'].includes(new URL(source?.url).protocol) } catch { return false }
}

// Semantic review supplies the observation and its source. Reject date-only
// citations, model identifiers and substrings of a different number.
function measuredHook(hook, measurement) {
  if (!measurement || !/\d/.test(measurement) || !/[\p{L}%$£€₹₦¥°]/u.test(measurement)) return false
  const month = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)'
  if (new RegExp(`^(?:${month}\\s+[\\d ,]+|[\\d ]+\\s+${month}(?:\\s+\\d{4})?)$`, 'i').test(measurement) ||
      /^(?:(?:model|version)\s+|[a-z]+[- ]?)\d[.\d]*$/i.test(measurement) && !/^(?:Rs|USD|EUR|N)\d/i.test(measurement)) return false
  const escaped = measurement.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![\\p{L}\\d])${escaped}(?![\\p{L}\\d])`, 'u').test(hook)
}

function hasSubjectChart(meta, catalogue) {
  if (!meta.chart || meta.starterReview.subjectChart !== meta.chart || !meta.entities.some(e => e.indicatorId === meta.chart)) return false
  const series = catalogue.get(meta.chart)
  if (!series || series.stale || typeof series.unit !== 'string' || !series.unit.trim() || !validDay(series.asOf) ||
      Date.parse(series.asOf) > Date.now() || !Array.isArray(series.values) || !Number.isFinite(series.values.at(-1))) return false
  if (series.dates && (!Array.isArray(series.dates) || series.dates.length !== series.values.length ||
      !series.dates.every(validDay))) return false
  if (!series.dates && !Array.isArray(series.periods)) return false
  const points = datedPoints(series)
  return points?.length >= 2 && points.length === series.values.length && points.at(-1).t === Date.parse(series.asOf) &&
    points.every((p, i) => !i || p.t > points[i - 1].t)
}

export function starterDecision(article, catalogue = new Map()) {
  const { meta, body } = article
  const problem = classificationProblem(article)
  if (problem) return { eligible: false, reason: problem }
  const date = meta.date instanceof Date ? meta.date.toISOString() : meta.date
  if (typeof date !== 'string' || !validDay(date.slice(0, 10)) ||
      !/^\d{4}-\d\d-\d\d(?:T\d\d:\d\d:\d\d(?:\.\d+)?Z)?$/.test(date) || !Number.isFinite(Date.parse(date)) ||
      typeof meta.title !== 'string' || !meta.title.trim() || typeof meta.location !== 'string' ||
      !meta.location.trim() || !Number.isFinite(meta.lat) ||
      Math.abs(meta.lat) > 90 || !Number.isFinite(meta.lng) || Math.abs(meta.lng) > 180) return { eligible: false, reason: 'invalid dated or placed report' }
  const prose = visibleText(body)
  if (datelineOf(prose) !== meta.location || !meta.sources.some(sourced)) return { eligible: false, reason: 'missing dateline or source' }
  const hook = stripDateline(splitBlocks(prose)[0], meta.location)
  const { measurement, sourceIndex, domain } = meta.starterReview
  const chart = hasSubjectChart(meta, catalogue)
  if (measuredHook(hook, measurement) && sourced(meta.sources[sourceIndex])) {
    return { eligible: true, evidence: chart ? 'both' : 'measurement', reason: `${domain} · ${measurement}` }
  }
  if (chart) return { evidence: 'chart', eligible: true, reason: `${domain} · dated ${meta.chart} chart` }
  return { eligible: false, reason: 'no verified hook measurement or dated subject chart' }
}

export function classifyRevision(raw, catalogue, article = parseFrontmatter(raw), sparse = false) {
  const { eligible } = starterDecision(article, catalogue)
  if (sparse && !eligible && !Object.hasOwn(article.meta, 'starterEligible')) return raw
  return article.meta.starterEligible === eligible ? raw :
    setStarterField(raw, 'starterEligible', eligible)
}
