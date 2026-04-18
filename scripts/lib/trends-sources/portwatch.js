// IMF PortWatch fetcher.
// Data portal: https://portwatch.imf.org
// Chokepoint transit data is published via an ArcGIS Feature Service that
// exposes GeoJSON + pagination. No auth, no cost.
//
// Best-effort implementation: if the feature service URL changes or the
// schema drifts, we log and return null rather than failing the whole cycle.
// The orchestrator treats a null return as "skip this indicator this run".

import { CHOKEPOINT_BY_ID, CHOKEPOINT_CATALOG } from '../chokepoint-metadata.js'

const USER_AGENT = 'zuhd-news/1.0 (+https://zuhd.news)'

// IMF PortWatch "Daily Chokepoints Data" feature service (ArcGIS).
// Schema (confirmed 2026-04): date (epoch ms), portname, n_total + per-type counts.
// Found via hub.arcgis.com search; owning org weJ1QsnbMYJlCHdG.
const FEATURE_SERVICE = 'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query'

const VESSEL_FIELDS = ['n_total', 'n_tanker', 'n_container', 'n_dry_bulk', 'n_cargo', 'n_general_cargo', 'n_roro']
const VESSEL_FIELD_SET = new Set(VESSEL_FIELDS)

const HISTORY_DAYS = 60

function formatPeriod(dateStr) {
  const d = new Date(dateStr)
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  return `${month} ${d.getUTCDate()}`
}

function ymd(d) {
  return d.toISOString().slice(0, 10)
}

/**
 * Fetch PortWatch transit counts for a given chokepoint and vessel class.
 *
 * @param {{ id: string, seriesId: string, field?: string }} indicator
 *        `field` selects the vessel-count column (default `n_total`). For
 *        Hormuz the meaningful series is `n_tanker`; for Bab-el-Mandeb it is
 *        `n_container` (the Houthi-blockade story is a container-shipping
 *        story, not a totals story).
 * @returns {Promise<{ values: number[], periods: string[], asOf: string } | null>}
 */
export async function fetchPortWatchChokepoint(indicator) {
  const portName = CHOKEPOINT_BY_ID[indicator.seriesId]?.portname
  if (!portName) {
    console.error(`  ✗ portwatch:${indicator.id}: unknown chokepoint seriesId`)
    return null
  }
  const field = indicator.field && VESSEL_FIELD_SET.has(indicator.field) ? indicator.field : 'n_total'

  const end = new Date()
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - HISTORY_DAYS)

  const url = new URL(FEATURE_SERVICE)
  // Filter server-side on portname only; we window by date client-side after
  // sorting. ArcGIS's timestamp WHERE dialect is finicky across services.
  url.searchParams.set('f', 'json')
  url.searchParams.set('where', `portname='${portName}'`)
  url.searchParams.set('outFields', `date,portname,${field}`)
  url.searchParams.set('orderByFields', 'date DESC')
  url.searchParams.set('resultRecordCount', String(HISTORY_DAYS + 5))

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': USER_AGENT },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const features = data.features || []
    if (features.length === 0) {
      console.error(`  ✗ portwatch:${indicator.id}: no features returned`)
      return null
    }

    // ArcGIS returns date as epoch ms. DESC-sorted; reverse for chart order.
    const rows = features
      .map((f) => ({ ts: f.attributes?.date, calls: f.attributes?.[field] }))
      .filter((r) => r.ts != null && r.calls != null && r.ts >= start.getTime())
      .sort((a, b) => a.ts - b.ts)

    if (rows.length === 0) return null

    const values = rows.map((r) => Number(r.calls))
    const periods = rows.map((r) => formatPeriod(new Date(r.ts).toISOString()))
    const asOf = ymd(new Date(rows[rows.length - 1].ts))

    return { values, periods, asOf }
  } catch (err) {
    console.error(`  ✗ portwatch:${indicator.id}: ${err.message}`)
    return null
  }
}

// ---------------------------------------------------------------------------
// Snapshot fetcher — all catalog chokepoints in one call. Powers the globe's
// ambient chokepoint layer (not the per-article trend-block pipeline).
// ---------------------------------------------------------------------------

const SNAPSHOT_DAYS = 90

function meanOf(values) {
  if (values.length === 0) return 0
  let s = 0
  for (const v of values) s += v
  return s / values.length
}

/**
 * Fetch 90 days of daily transit counts for every chokepoint in the catalog
 * in a single batched ArcGIS query, then roll up into per-chokepoint summary
 * stats + a full `n_total` series for the sparkline.
 *
 * @returns {Promise<Array<{
 *   id: string,
 *   portname: string,
 *   last7Avg: Record<string, number>,
 *   baseline90Avg: Record<string, number>,
 *   delta7vs90: Record<string, number>,
 *   series: { periods: string[], total: number[] },
 *   asOf: string,
 * }> | null>}
 */
export async function fetchAllChokepointsSnapshot() {
  const portnames = CHOKEPOINT_CATALOG.map((c) => c.portname)
  const end = new Date()
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - SNAPSHOT_DAYS)

  // ArcGIS `timestamp 'YYYY-MM-DD HH:mm:ss'` literal — stable across this service.
  const startStamp = start.toISOString().replace('T', ' ').slice(0, 19)
  const portList = portnames.map((n) => `'${n.replace(/'/g, "''")}'`).join(',')
  const where = `portname IN (${portList}) AND date >= timestamp '${startStamp}'`

  const url = new URL(FEATURE_SERVICE)
  url.searchParams.set('f', 'json')
  url.searchParams.set('where', where)
  url.searchParams.set('outFields', ['date', 'portname', ...VESSEL_FIELDS].join(','))
  url.searchParams.set('orderByFields', 'date ASC')
  // 11 chokepoints × 90d = 990 rows; buffer to the service's standardMaxRecordCount.
  url.searchParams.set('resultRecordCount', '2000')

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': USER_AGENT },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const features = data.features || []
    if (features.length === 0) {
      console.error('  ✗ portwatch-snapshot: no features returned')
      return null
    }

    // Group rows by portname, sorted ascending by date (query already asked
    // for that, but re-sort to be defensive against ArcGIS ordering quirks).
    const byPort = new Map()
    for (const f of features) {
      const a = f.attributes || {}
      if (a.date == null || !a.portname) continue
      let rows = byPort.get(a.portname)
      if (!rows) {
        rows = []
        byPort.set(a.portname, rows)
      }
      rows.push(a)
    }

    const out = []
    for (const entry of CHOKEPOINT_CATALOG) {
      const rows = (byPort.get(entry.portname) || []).sort((x, y) => x.date - y.date)
      if (rows.length === 0) {
        console.error(`  ✗ portwatch-snapshot: ${entry.portname}: no rows`)
        continue
      }

      const last7 = rows.slice(-7)
      const base = rows.length <= 7 ? rows : rows.slice(0, -7) // exclude the last-7 window from the baseline

      const last7Avg = {}
      const baselineAvg = {}
      const delta = {}
      for (const field of VESSEL_FIELDS) {
        const l7 = meanOf(last7.map((r) => Number(r[field] ?? 0)))
        const b = meanOf(base.map((r) => Number(r[field] ?? 0)))
        last7Avg[field] = Math.round(l7 * 10) / 10
        baselineAvg[field] = Math.round(b * 10) / 10
        delta[field] = b > 0 ? Math.round(((l7 - b) / b) * 1000) / 1000 : 0
      }

      out.push({
        id: entry.id,
        portname: entry.portname,
        last7Avg,
        baseline90Avg: baselineAvg,
        delta7vs90: delta,
        series: {
          periods: rows.map((r) => formatPeriod(new Date(r.date).toISOString())),
          total: rows.map((r) => Number(r.n_total ?? 0)),
        },
        asOf: ymd(new Date(rows[rows.length - 1].date)),
      })
    }

    return out
  } catch (err) {
    console.error(`  ✗ portwatch-snapshot: ${err.message}`)
    return null
  }
}
