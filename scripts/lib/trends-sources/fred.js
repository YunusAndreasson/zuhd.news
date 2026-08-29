// FRED (Federal Reserve Economic Data) fetcher.
// Docs: https://fred.stlouisfed.org/docs/api/fred/series_observations.html
// Free, public-domain data. Key registration: https://fred.stlouisfed.org/docs/api/api_key.html

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations'
const FRED_RELEASES_DATES = 'https://api.stlouisfed.org/fred/releases/dates'
const USER_AGENT = 'zuhd-news/1.0 (+https://zuhd.news)'

// High-signal US data releases worth an editorial "what's next" line.
// releases/dates returns ~300 releases; anything not matching is noise here.
const MAJOR_RELEASES = [
  /consumer price index/i,
  /employment situation/i,
  /gross domestic product/i,
  /personal income and outlays/i,
  /advance monthly sales for retail/i,
  /producer price index/i,
  /fomc/i,
  /h\.4\.1/i, // Fed balance sheet
]

/** Format a date as "YYYY-MM-DD" (FRED's expected format). */
function ymd(d) {
  return d.toISOString().slice(0, 10)
}

/** Format a period label from a FRED observation date. Daily series render
 *  "Mar 18"; monthly series render "Mar 2026". */
function formatPeriod(dateStr, cadence) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  if (cadence === 'monthly') return `${month} ${d.getUTCFullYear()}`
  return `${month} ${d.getUTCDate()}`
}

/**
 * Fetch observations for one FRED series.
 *
 * @param {{ id: string, seriesId: string, cadence: 'daily'|'monthly', frequency?: string, aggregation?: string }} indicator
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

  /**
   * Downsample at the source, for a series whose shape is a staircase.
   *
   * A policy rate is a step function: `DFEDTARU` over two years is 731 daily
   * observations carrying **six** distinct values. Shipping all of them costs
   * ~13KB per series in `trends.json` — a payload the homepage downloads on
   * every visit — for a picture that is identical at 25 points. FRED does the
   * aggregation itself, so `frequency: 'm'` with end-of-period sampling gives
   * 25 observations with all six changes intact. Measured: 731 → 25, same
   * range, same step count.
   *
   * End of period, never average: the rate on the last day of the month is a
   * rate that was actually set, and averaging a step function invents levels
   * the committee never voted for.
   */
  if (indicator.frequency) {
    url.searchParams.set('frequency', indicator.frequency)
    url.searchParams.set('aggregation_method', indicator.aggregation ?? 'eop')
  }

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

/**
 * Upcoming major US data releases in the next `days` days — one extra call
 * per trends run. Concrete "what's next" substrate (e.g. "CPI lands Thursday")
 * for editorial surfaces. Fail-soft: returns [] on any error.
 *
 * @param {string} apiKey
 * @param {number} [days=10]
 * @returns {Promise<Array<{ date: string, release: string }>>}
 */
export async function fetchFredReleaseCalendar(apiKey, days = 10) {
  const start = new Date()
  const end = new Date()
  end.setUTCDate(end.getUTCDate() + days)

  const url = new URL(FRED_RELEASES_DATES)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('file_type', 'json')
  url.searchParams.set('realtime_start', ymd(start))
  url.searchParams.set('realtime_end', ymd(end))
  url.searchParams.set('include_release_dates_with_no_data', 'true')
  url.searchParams.set('sort_order', 'asc')

  try {
    // releases/dates is a slow endpoint (~15-20s server-side) — needs a wider
    // timeout than the observation calls. Trends-stage budget is 120s.
    const res = await fetch(url, {
      signal: AbortSignal.timeout(30000),
      headers: { 'User-Agent': USER_AGENT },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const upcoming = (data.release_dates || [])
      .filter((r) => r.date >= ymd(start) && r.date <= ymd(end))
      .filter((r) => MAJOR_RELEASES.some((p) => p.test(r.release_name || '')))
      .map((r) => ({ date: r.date, release: r.release_name }))
    // Dedupe same release+date pairs (FRED emits one row per realtime window)
    const seen = new Set()
    const deduped = upcoming.filter((r) => {
      const k = `${r.date}|${r.release}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    // Daily-cadence releases (with include_release_dates_with_no_data) list
    // every date in the window — that's noise, not a calendar event. A real
    // scheduled release (CPI, payrolls) lands on 1-2 dates.
    const dateCount = {}
    for (const r of deduped) dateCount[r.release] = (dateCount[r.release] || 0) + 1
    return deduped.filter((r) => dateCount[r.release] <= 3)
  } catch (err) {
    console.error(`  ✗ fred:release-calendar: ${err.message}`)
    return []
  }
}
