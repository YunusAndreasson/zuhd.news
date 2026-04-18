// FRED (Federal Reserve Economic Data) fetcher.
// Docs: https://fred.stlouisfed.org/docs/api/fred/series_observations.html
// Free, public-domain data. Key registration: https://fred.stlouisfed.org/docs/api/api_key.html

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations'
const USER_AGENT = 'zuhd-news/1.0 (+https://zuhd.news)'

/** Format a date as "YYYY-MM-DD" (FRED's expected format). */
function ymd(d) {
  return d.toISOString().slice(0, 10)
}

/** Format a period label from a FRED observation date. Daily series render
 *  "Mar 18"; monthly series render "Mar 2026". */
function formatPeriod(dateStr, cadence) {
  const d = new Date(dateStr + 'T00:00:00Z')
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  if (cadence === 'monthly') return `${month} ${d.getUTCFullYear()}`
  return `${month} ${d.getUTCDate()}`
}

/**
 * Fetch observations for one FRED series.
 *
 * @param {{ id: string, seriesId: string, cadence: 'daily'|'monthly' }} indicator
 * @param {string} apiKey
 * @returns {Promise<{ values: number[], periods: string[], asOf: string } | null>}
 */
export async function fetchFredSeries(indicator, apiKey) {
  const end = new Date()
  const start = new Date(end)
  if (indicator.cadence === 'monthly') {
    start.setUTCMonth(start.getUTCMonth() - 24) // 24 months for monthly
  } else {
    start.setUTCDate(start.getUTCDate() - 90) // 90 days for daily
  }

  const url = new URL(FRED_BASE)
  url.searchParams.set('series_id', indicator.seriesId)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('file_type', 'json')
  url.searchParams.set('observation_start', ymd(start))
  url.searchParams.set('observation_end', ymd(end))
  url.searchParams.set('sort_order', 'asc')

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': USER_AGENT },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const observations = data.observations || []

    // FRED uses "." for missing values — drop those.
    const clean = observations.filter((o) => o.value !== '.' && o.value != null)
    if (clean.length === 0) {
      console.error(`  ✗ fred:${indicator.id}: no observations`)
      return null
    }

    const values = clean.map((o) => Number(o.value))
    const periods = clean.map((o) => formatPeriod(o.date, indicator.cadence))
    const asOf = clean[clean.length - 1].date

    return { values, periods, asOf }
  } catch (err) {
    console.error(`  ✗ fred:${indicator.id}: ${err.message}`)
    return null
  }
}
