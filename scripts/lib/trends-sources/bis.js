// Central bank policy rates, from the Bank for International Settlements.
// Docs: https://stats.bis.org/api-doc/v2/ — dataflow WS_CBPOL. Free, keyless.
//
// FRED carries the Fed's and the ECB's rates and nobody else's that is still
// updated: its Bank of England series stopped in 2017 and its Bank of Japan
// one in 2023 (checked 2026-10-03). The BIS collects each central bank's own
// published rate daily, so the rate a decision card is about — the Bank of
// England's, the Bank of Japan's — can be drawn rather than left blank or
// filled with the nearest interbank proxy.
//
// One call covers every country the registry names (`mode: 'batched'`).
// `detail=dataonly` matters: without it every row repeats the series' whole
// compilation note, and two years of seven countries is megabytes of prose.

import { fetchText } from '../http.js'

const BIS_BASE = 'https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0'

/** Months of history, as `fetchFredSeries` keeps for a monthly series. */
const MONTHS = 24

/**
 * How old the newest observation may be. The BIS publishes most countries
 * within a week and a few months late (India's daily series ended 72 days
 * back on 2026-10-03). A rate that old may have been changed since, and a
 * policy rate printed as current when it is not is worse than no row.
 */
const STALE_DAYS = 45

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * A daily policy rate as the staircase the app and the site draw: one point a
 * month, the rate in force at that month's last observation, and the current
 * month as far as it has got.
 *
 * End of period, never an average — averaging a step function invents rates
 * no committee set (`fetchFredSeries` says the same of the Fed's). The
 * current month is kept, incomplete: the reading has to be the rate in force
 * today, and a change made last week belongs on the line.
 *
 * @param {{ date: string, value: number }[]} rows  one country's observations
 * @param {{ now?: Date, months?: number, staleDays?: number }} [opts]
 * @returns {{ values: number[], periods: string[], dates: string[], completed: boolean[], asOf: string } | null}
 *   null when there are fewer than two months, or the newest is stale
 */
export function monthlyFromDaily(rows, { now = new Date(), months = MONTHS, staleDays = STALE_DAYS } = {}) {
  const clean = rows
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(r.value))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  if (clean.length === 0) return null

  const asOf = clean[clean.length - 1].date
  const ageDays = (now.getTime() - Date.parse(`${asOf}T00:00:00Z`)) / 86_400_000
  if (ageDays > staleDays) return null

  /** @type {Map<string, { date: string, value: number }>} */
  const lastOfMonth = new Map()
  for (const r of clean) lastOfMonth.set(r.date.slice(0, 7), r)
  const kept = [...lastOfMonth.values()].slice(-(months + 1))
  if (kept.length < 2) return null

  return {
    values: kept.map((r) => r.value),
    periods: kept.map((r) => `${MONTH_NAMES[Number(r.date.slice(5, 7)) - 1]} ${r.date.slice(0, 4)}`),
    dates: kept.map((r) => r.date),
    completed: kept.map(() => true),
    asOf,
  }
}

/**
 * The service's `detail=dataonly` CSV, by country. Columns are found by name:
 * the order is the service's to change.
 *
 * @param {string} csv
 * @returns {Map<string, { date: string, value: number }[]>}
 */
export function parseBisCsv(csv) {
  /** @type {Map<string, { date: string, value: number }[]>} */
  const byArea = new Map()
  const lines = csv.split(/\r?\n/).filter(Boolean)
  const header = (lines.shift() || '').split(',')
  const area = header.indexOf('REF_AREA')
  const period = header.indexOf('TIME_PERIOD')
  const obs = header.indexOf('OBS_VALUE')
  if (area < 0 || period < 0 || obs < 0) return byArea
  for (const line of lines) {
    const cells = line.split(',')
    // A day with no observation is published as `NaN`, not left out.
    const value = Number(cells[obs])
    if (!Number.isFinite(value)) continue
    const list = byArea.get(cells[area]) ?? []
    list.push({ date: cells[period], value })
    byArea.set(cells[area], list)
  }
  return byArea
}

/**
 * Policy rates for a list of BIS country codes (`GB`, `JP`, `XM` for the euro
 * area), in one request.
 *
 * @param {string[]} areas
 * @returns {Promise<Record<string, NonNullable<ReturnType<typeof monthlyFromDaily>>> | null>}
 */
export async function fetchBisPolicyRates(areas) {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - MONTHS, 1))
  const url = new URL(`${BIS_BASE}/D.${areas.join('+')}`)
  url.searchParams.set('startPeriod', start.toISOString().slice(0, 10))
  url.searchParams.set('format', 'csv')
  url.searchParams.set('detail', 'dataonly')

  try {
    const csv = await fetchText(url, { timeoutMs: 30_000 })
    const byArea = parseBisCsv(csv)
    /** @type {Record<string, NonNullable<ReturnType<typeof monthlyFromDaily>>>} */
    const out = {}
    for (const code of areas) {
      const series = monthlyFromDaily(byArea.get(code) ?? [], { now })
      if (series) out[code] = series
      else console.error(`  ✗ bis:${code}: no current observations`)
    }
    return out
  } catch (err) {
    console.error(`  ✗ bis: ${err.message}`)
    return null
  }
}
