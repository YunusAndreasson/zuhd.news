// AI labs and how capable their models are, from Epoch AI's open data.
//
// Three CSVs, each a direct download under CC BY 4.0 (epoch.ai/data):
//   - eci_scores.csv — every model Epoch has scored on its Capabilities Index:
//     one composite number per model, with a confidence range, the lab and
//     the release date. The index combines dozens of benchmarks; it is one
//     organisation's composite, and is rescaled when Epoch adds a benchmark,
//     so history is read from the file each time and never from our own
//     earlier snapshots.
//   - ai_companies_revenue_reports.csv, ai_companies_funding_rounds.csv —
//     dated press and company reports of revenue and valuation, each with a
//     confidence. Irregular: a lab has a report when someone published one.
//
// What is published is a lab, not a model: its best score at each release
// (the running best, which only rises), the model that holds it, and the
// newest revenue and valuation where Epoch has them. A list of 270 models is
// a leaderboard; ten labs with a line each is how the field has moved.
//
// Pure: the fetcher does the network, this does the arithmetic.

import { csvObjects } from './csv.js'

/** Fewer scored models than this and the file is not the file. It held 270 on
 *  the day this was written. */
export const MIN_MODELS = 100

/** A lab with no model scored in this long is left out: its "best" is a
 *  number from another era printed as though it were current. */
export const AI_LAB_STALE_DAYS = 365

const DAY_MS = 86400_000

const ECI_COLUMNS = ['Model', 'Display name', 'eci', 'eci_ci_low', 'eci_ci_high', 'date', 'Organization']
const REVENUE_COLUMNS = ['Company', 'Date', 'Annualized revenue (USD)', 'Scope', 'Confidence']
const FUNDING_COLUMNS = ['Company', 'Close date', 'Status', 'Valuation (post-money)', 'Confidence']

const isoDay = (v) => (/^\d{4}-\d{2}-\d{2}/.test(v || '') ? v.slice(0, 10) : null)
const round1 = (n) => Math.round(n * 10) / 10
const positive = (v) => {
  const n = Number(v)
  return v !== '' && Number.isFinite(n) && n > 0 ? n : null
}

/**
 * The scored models: a name, the labs it is filed under, a score with its
 * range and a release day. A row missing any of those is not a scored model.
 */
export function scoredModels(rows) {
  const models = []
  for (const row of rows) {
    const score = positive(row.eci)
    const date = isoDay(row.date)
    const name = (row['Display name'] || row.Model || '').trim()
    if (score === null || !date || !name) continue
    models.push({
      name,
      orgs: row.Organization.split(',').map((s) => s.trim()).filter(Boolean),
      score,
      low: positive(row.eci_ci_low),
      high: positive(row.eci_ci_high),
      date,
    })
  }
  // Oldest first; the better model first within a day, so a day's point on
  // the running best is that day's best.
  return models.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.score - a.score))
}

/**
 * A lab's best score at each release that raised it: one point per day, each
 * higher than the last. `models[i]` is the model that set `values[i]`.
 *
 * @param {{ name: string, score: number, date: string }[]} models oldest first
 */
export function labFrontier(models) {
  const periods = []
  const values = []
  const names = []
  let best = -Infinity
  for (const m of models) {
    if (m.score <= best) continue
    best = m.score
    if (periods.at(-1) === m.date) continue
    periods.push(m.date)
    values.push(round1(m.score))
    names.push(m.name)
  }
  return { periods, values, models: names }
}

/**
 * The newest dated report of one figure for a company, or null. A report from
 * before `since` is not one: xAI's newest revenue report was a year old on the
 * day this was written, and beside a valuation from this year it read as the
 * revenue that valuation was paid for.
 *
 * @param {Record<string, string>[]} rows
 * @param {{ company: string, dateKey: string, valueKey: string, since?: string, keep?: (row: Record<string, string>) => boolean }} spec
 */
export function latestReport(rows, { company, dateKey, valueKey, since = '', keep = () => true }) {
  let newest = null
  for (const row of rows) {
    if (row.Company !== company || !keep(row)) continue
    const asOf = isoDay(row[dateKey])
    const usd = positive(row[valueKey])
    if (!asOf || usd === null || asOf < since) continue
    // Two reports on one day: the larger, which is the later round's figure.
    if (!newest || asOf > newest.asOf || (asOf === newest.asOf && usd > newest.usd)) {
      newest = { usd: Math.round(usd), asOf, ...(row.Confidence ? { confidence: row.Confidence } : {}) }
    }
  }
  return newest
}

/**
 * The snapshot the fetcher writes, from the three files' text.
 *
 * Rejected whole when the scores file is not what it was (too few models, a
 * missing column): the caller keeps the previous snapshot. The company files
 * are optional — a lab's money is carried over from `previous` when they are
 * absent or unreadable, because a failed side fetch must not cost a card its
 * figures.
 *
 * @param {{ eci: string, revenue?: string | null, funding?: string | null }} files
 * @param {{ labs: import('./ai-lab-metadata.js').AiLabEntry[], now?: number, previous?: any }} opts
 * @returns {{ snapshot?: any, rejected?: string, notes: string[] }}
 */
export function aiModelsSnapshot({ eci, revenue = null, funding = null }, { labs, now = Date.now(), previous = null }) {
  const notes = []
  let models
  try {
    models = scoredModels(csvObjects(eci, ECI_COLUMNS))
  } catch (err) {
    return { rejected: `scores: ${err?.message || err}`, notes }
  }
  if (models.length < MIN_MODELS) {
    return { rejected: `scores: ${models.length} scored models, expected at least ${MIN_MODELS}`, notes }
  }

  const read = (text, columns, label) => {
    if (typeof text !== 'string') return null
    try {
      return csvObjects(text, columns)
    } catch (err) {
      notes.push(`${label}: ${err?.message || err} — keeping the previous figures`)
      return null
    }
  }
  const revenueRows = read(revenue, REVENUE_COLUMNS, 'revenue')
  const fundingRows = read(funding, FUNDING_COLUMNS, 'funding')
  const before = new Map((previous?.labs || []).map((l) => [l.id, l]))

  const cutoff = new Date(now - AI_LAB_STALE_DAYS * DAY_MS).toISOString().slice(0, 10)
  const built = []
  const skipped = []
  for (const lab of labs) {
    const own = models.filter((m) => m.orgs.some((org) => lab.epochOrgs.includes(org)))
    if (own.length === 0) {
      skipped.push({ id: lab.id, reason: 'no scored model under its name' })
      continue
    }
    const newest = own.at(-1).date
    if (newest < cutoff) {
      skipped.push({ id: lab.id, reason: `newest scored model is from ${newest}` })
      continue
    }
    const series = labFrontier(own)
    if (series.values.length < 2) {
      skipped.push({ id: lab.id, reason: 'one scored release: no line to draw' })
      continue
    }
    const best = own.reduce((a, b) => (b.score > a.score ? b : a))
    const money = (rows, spec, key) => {
      if (!lab.companyName) return null
      if (rows) return latestReport(rows, { company: lab.companyName, since: cutoff, ...spec })
      const kept = before.get(lab.id)?.[key]
      return kept && kept.asOf >= cutoff ? kept : null
    }
    const revenueNow = money(
      revenueRows,
      { dateKey: 'Date', valueKey: 'Annualized revenue (USD)', keep: (r) => r.Scope === 'Full company' },
      'revenue',
    )
    const valuationNow = money(
      fundingRows,
      { dateKey: 'Close date', valueKey: 'Valuation (post-money)', keep: (r) => r.Status === 'Closed' },
      'valuation',
    )
    built.push({
      id: lab.id,
      name: lab.name,
      iso2: lab.iso2,
      blurb: lab.blurb,
      model: best.name,
      score: round1(best.score),
      ...(best.low !== null && best.high !== null ? { low: round1(best.low), high: round1(best.high) } : {}),
      asOf: best.date,
      series,
      ...(revenueNow ? { revenue: revenueNow } : {}),
      ...(valuationNow ? { valuation: valuationNow } : {}),
    })
  }
  if (built.length === 0) return { rejected: 'no lab had a usable line', notes }

  // Highest first; by name between equals, so the order is the data's alone.
  built.sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : 1))
  const top = models.reduce((a, b) => (b.score > a.score ? b : a))
  const holder = labs.find((lab) => top.orgs.some((org) => lab.epochOrgs.includes(org)))
  const stamp = new Date(now).toISOString()
  return {
    snapshot: {
      generated: stamp,
      fetched: stamp,
      source: 'Epoch AI',
      sourceUrl: 'https://epoch.ai/benchmarks',
      license: 'CC BY 4.0',
      models: models.length,
      frontier: { score: round1(top.score), model: top.name, lab: holder?.name ?? top.orgs[0] ?? '' },
      labs: built,
      skipped,
    },
    notes,
  }
}

/**
 * `/api/ai-models.json`: the snapshot without the fetcher's own clock.
 *
 * `fetched` moves every day whether or not Epoch published anything, and the
 * app holds this file by its tag (`apiStamps.hold` in `build.js`): left in, it
 * would send ten unchanged labs to every reader daily. `generated` is the
 * stamp the ledger holds.
 */
export function aiModelsPayload(raw) {
  const { fetched: _fetched, ...payload } = raw
  return payload
}
