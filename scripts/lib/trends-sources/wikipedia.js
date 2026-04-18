// Wikipedia Pageviews fetcher.
// Docs: https://wikimedia.org/api/rest_v1/#/Pageviews%20data
// Free, public-domain data. No auth, no key. Rate-limited informally — be
// polite with User-Agent + sensible request spacing.
//
// The "narrative attention" signal: when a story breaks, relevant Wiki
// articles spike in daily pageviews. A chart of those spikes under a brief
// entry shows the topic going mainstream — editorial substrate you can't
// get any other way.

const WIKI_BASE = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents'
const USER_AGENT = 'zuhd-news/1.0 (+https://zuhd.news; editorial@zuhd.news)'

function ymd(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

function formatPeriod(stamp) {
  // Wikipedia returns "YYYYMMDD00"; convert to "Mar 18".
  const y = stamp.slice(0, 4)
  const m = stamp.slice(4, 6)
  const d = stamp.slice(6, 8)
  const date = new Date(`${y}-${m}-${d}T00:00:00Z`)
  const month = date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  return `${month} ${date.getUTCDate()}`
}

/**
 * Fetch the last 30 days of daily pageviews for one Wikipedia article.
 *
 * @param {{ id: string, seriesId: string }} indicator
 *        `seriesId` is the Wikipedia article title with underscores
 *        ("Strait_of_Hormuz", "Taliban", "Hezbollah").
 * @returns {Promise<{ values: number[], periods: string[], asOf: string } | null>}
 */
export async function fetchWikipediaPageviews(indicator) {
  const end = new Date()
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 30)

  const title = encodeURIComponent(indicator.seriesId)
  const url = `${WIKI_BASE}/${title}/daily/${ymd(start)}/${ymd(end)}`

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': USER_AGENT, accept: 'application/json' },
    })
    if (!res.ok) {
      // 404 = article not found / no data; not an error, just no series.
      if (res.status === 404) {
        console.error(`  ✗ wikipedia:${indicator.id}: no article '${indicator.seriesId}'`)
        return null
      }
      throw new Error(`HTTP ${res.status}`)
    }
    const data = await res.json()
    const items = Array.isArray(data.items) ? data.items : []
    if (items.length < 5) {
      console.error(`  ✗ wikipedia:${indicator.id}: only ${items.length} days`)
      return null
    }
    const values = items.map((i) => Number(i.views) || 0)
    const periods = items.map((i) => formatPeriod(i.timestamp))
    const asOf = `${items[items.length - 1].timestamp.slice(0, 4)}-${items[items.length - 1].timestamp.slice(4, 6)}-${items[items.length - 1].timestamp.slice(6, 8)}`
    return { values, periods, asOf }
  } catch (err) {
    console.error(`  ✗ wikipedia:${indicator.id}: ${err.message}`)
    return null
  }
}
