// Primary commodity prices, from the IMF's own data service.
// Docs: https://data.imf.org/en/Resource-Pages/IMF-API — dataflow IMF.RES:PCPS
// (the Primary Commodity Price System). Free, keyless.
//
// These four were read from FRED, which republishes the IMF's series under
// its own ids (`PWHEAMTUSDM` is the IMF's `PWHEAMT`). FRED's copy stopped: on
// 2026-10-10 its newest month was July, last updated 2026-08-17, while the
// IMF had published August and September. The months both hold are the same
// numbers to the last digit, apart from the ones the IMF has since revised
// (rice, June and July 2026), so the series a chart was drawn from continues.
//
// One call covers every commodity the registry names (`mode: 'batched'`). The
// service answers in SDMX-ML whatever `accept` asks for, so the reading is by
// attribute name over the two elements that matter.

import { fetchText } from '../http.js'
import { isoDay, monthLabel } from '../period.js'

const IMF_BASE = 'https://api.imf.org/external/sdmx/2.1/data/IMF.RES,PCPS'

/** Months of history, as `fetchFredSeries` keeps for a monthly series. */
const MONTHS = 24

/** @param {string} attrs an element's attributes @param {string} name */
const attr = (attrs, name) => new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1]

/**
 * The service's SDMX-ML, by commodity: each monthly series priced in dollars,
 * oldest month first. A month is dated its first day, as FRED dated it.
 *
 * @param {string} xml
 * @returns {Map<string, { date: string, value: number }[]>}
 */
export function parseImfPrices(xml) {
  /** @type {Map<string, { date: string, value: number }[]>} */
  const byIndicator = new Map()
  for (const series of xml.matchAll(/<Series\b([^>]*)>([\s\S]*?)<\/Series>/g)) {
    const id = attr(series[1], 'INDICATOR')
    if (!id || attr(series[1], 'DATA_TRANSFORMATION') !== 'USD' || attr(series[1], 'FREQUENCY') !== 'M') continue
    const rows = []
    for (const obs of series[2].matchAll(/<Obs\b([^>]*)\/>/g)) {
      const month = /^(\d{4})-M(\d{2})$/.exec(attr(obs[1], 'TIME_PERIOD') ?? '')
      // A month with no price is left out or published empty; `Number('')` is 0.
      const raw = attr(obs[1], 'OBS_VALUE')
      const value = raw ? Number(raw) : Number.NaN
      if (!month || !Number.isFinite(value)) continue
      rows.push({ date: `${month[1]}-${month[2]}-01`, value })
    }
    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    if (rows.length > 0) byIndicator.set(id, rows)
  }
  return byIndicator
}

/**
 * Monthly prices for a list of PCPS commodity codes (`PWHEAMT`, `PCOPP`), in
 * one request.
 *
 * Null when the call failed, or answered with no series at all: a 200 that
 * holds none is the service's shape having changed, and the rows stand on the
 * previous snapshot's while the log says what came back.
 *
 * @param {string[]} codes
 * @returns {Promise<Record<string, { values: number[], periods: string[], dates: string[], completed: boolean[], asOf: string }> | null>}
 */
export async function fetchImfCommodityPrices(codes) {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - MONTHS, 1))
  // World (`G001`), each commodity, in US dollars, monthly.
  const url = new URL(`${IMF_BASE}/G001.${codes.join('+')}.USD.M`)
  url.searchParams.set('startPeriod', isoDay(start).slice(0, 7))

  try {
    const xml = await fetchText(url, { timeoutMs: 30_000 })
    const byIndicator = parseImfPrices(xml)
    if (byIndicator.size === 0) {
      console.error(`  ✗ imf: no series in ${xml.length} bytes, beginning ${JSON.stringify(xml.slice(0, 160))}`)
      return null
    }
    /** @type {Record<string, { values: number[], periods: string[], dates: string[], completed: boolean[], asOf: string }>} */
    const out = {}
    for (const code of codes) {
      const rows = byIndicator.get(code)
      if (!rows) {
        console.error(`  ✗ imf:${code}: not in the answer`)
        continue
      }
      out[code] = {
        values: rows.map((r) => r.value),
        periods: rows.map((r) => monthLabel(Date.parse(`${r.date}T00:00:00Z`))),
        dates: rows.map((r) => r.date),
        completed: rows.map(() => true),
        asOf: rows[rows.length - 1].date,
      }
    }
    return out
  } catch (err) {
    console.error(`  ✗ imf: ${/** @type {Error} */ (err).message}`)
    return null
  }
}
