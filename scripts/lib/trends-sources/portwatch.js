// IMF PortWatch fetcher.
// Data portal: https://portwatch.imf.org
// Chokepoint transit data is published via an ArcGIS Feature Service that
// exposes GeoJSON + pagination. No auth, no cost.
//
// Best-effort implementation: if the feature service URL changes or the
// schema drifts, we log and return null rather than failing the whole cycle.
// The orchestrator treats a null return as "skip this indicator this run".

const USER_AGENT = 'zuhd-news/1.0 (+https://zuhd.news)'

// IMF PortWatch "Daily Chokepoints Data" feature service (ArcGIS).
// Schema (confirmed 2026-04): date (epoch ms), portname, n_total + per-type counts.
// Found via hub.arcgis.com search; owning org weJ1QsnbMYJlCHdG.
const FEATURE_SERVICE = 'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query'

// portname is the only server-side filter. The vessel-class field (`field`)
// chooses which subset of transits gets surfaced as the indicator's series —
// this is the difference between "Hormuz tanker traffic" (the actual story
// for an oil chokepoint) and undifferentiated total transits.
const CHOKEPOINT_MAP = {
  hormuz: 'Strait of Hormuz',
  'bab-el-mandeb': 'Bab el-Mandeb Strait',
  suez: 'Suez Canal',
  panama: 'Panama Canal',
  malacca: 'Malacca Strait',
  taiwan: 'Taiwan Strait',
  dover: 'Dover Strait',
  gibraltar: 'Gibraltar Strait',
}

const VESSEL_FIELDS = new Set(['n_total', 'n_tanker', 'n_container', 'n_dry_bulk', 'n_cargo', 'n_general_cargo', 'n_roro'])

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
 * @param {{ id: string, seriesId: keyof typeof CHOKEPOINT_MAP, field?: string }} indicator
 *        `field` selects the vessel-count column (default `n_total`). For
 *        Hormuz the meaningful series is `n_tanker`; for Bab-el-Mandeb it is
 *        `n_container` (the Houthi-blockade story is a container-shipping
 *        story, not a totals story).
 * @returns {Promise<{ values: number[], periods: string[], asOf: string } | null>}
 */
export async function fetchPortWatchChokepoint(indicator) {
  const portName = CHOKEPOINT_MAP[indicator.seriesId]
  if (!portName) {
    console.error(`  ✗ portwatch:${indicator.id}: unknown chokepoint seriesId`)
    return null
  }
  const field = indicator.field && VESSEL_FIELDS.has(indicator.field) ? indicator.field : 'n_total'

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
