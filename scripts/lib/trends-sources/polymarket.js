// Polymarket (Gamma API) fetcher.
// Docs: https://docs.polymarket.com/developers/gamma-markets-api/overview
// No auth, no cost. We fetch the top markets by 24h volume, then a price
// history for each. A category filter trims US sports / crypto odds markets.
//
// This fetcher returns dynamic IndicatorDef-compatible objects (one per top
// market) so the orchestrator can treat them the same as static FRED/OER
// indicators.

const GAMMA_BASE = 'https://gamma-api.polymarket.com'
const CLOB_BASE = 'https://clob.polymarket.com'
const USER_AGENT = 'zuhd-news/1.0 (+https://zuhd.news)'

const TOP_N = 20

// Categories we keep — prioritize ummah-relevant geopolitics/economics.
// Polymarket's category taxonomy is fuzzy; we also inspect the market title.
const KEEP_CATEGORIES = new Set(['geopolitics', 'politics', 'world', 'middle-east', 'economy', 'business', 'war', 'elections'])
const DROP_TITLE_RE = /\b(nfl|nba|mlb|nhl|ncaa|super bowl|world cup|uefa|oscars|grammy|emmy|dogecoin|shiba|pepe|bitcoin price|ethereum price|eth price)\b/i

function formatPeriod(tsSeconds) {
  const d = new Date(tsSeconds * 1000)
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  return `${month} ${d.getUTCDate()}`
}

function ymd(d) {
  return d.toISOString().slice(0, 10)
}

async function fetchTopMarkets(limit) {
  // Gamma's /markets supports order by volume24hr. We over-fetch then filter.
  const url = new URL(`${GAMMA_BASE}/markets`)
  url.searchParams.set('order', 'volume24hr')
  url.searchParams.set('ascending', 'false')
  url.searchParams.set('limit', String(limit * 3))
  url.searchParams.set('active', 'true')
  url.searchParams.set('closed', 'false')

  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: { 'User-Agent': USER_AGENT },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return Array.isArray(data) ? data : (data.data || data.markets || [])
}

async function fetchPriceHistory(clobTokenId) {
  // CLOB rejects startTs/endTs + fidelity combos inconsistently across market
  // ages. The interval-based form is reliable: `1m` = last month, fidelity in
  // minutes (1440 = 1-day buckets). Younger markets return fewer points;
  // caller filters those out.
  const url = new URL(`${CLOB_BASE}/prices-history`)
  url.searchParams.set('market', clobTokenId)
  url.searchParams.set('interval', '1m')
  url.searchParams.set('fidelity', '1440')

  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: { 'User-Agent': USER_AGENT },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return Array.isArray(data?.history) ? data.history : []
}

function sanitizeSlug(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)
}

function parseOutcomeTokens(market) {
  // Gamma returns outcomes as array + clobTokenIds as stringified array. Take
  // the YES token (index 0 by convention for binary markets).
  try {
    const tokens = typeof market.clobTokenIds === 'string' ? JSON.parse(market.clobTokenIds) : market.clobTokenIds
    const outcomes = typeof market.outcomes === 'string' ? JSON.parse(market.outcomes) : market.outcomes
    if (!Array.isArray(tokens) || tokens.length === 0) return null
    const yesIdx = outcomes?.findIndex((o) => /^yes$/i.test(o))
    return { tokenId: tokens[yesIdx >= 0 ? yesIdx : 0], label: outcomes?.[yesIdx >= 0 ? yesIdx : 0] || 'Yes' }
  } catch {
    return null
  }
}

/**
 * Fetch top-N filtered Polymarket markets with daily price history.
 *
 * @returns {Promise<Array<{
 *   id: string,
 *   label: string,
 *   unit: '%',
 *   source: 'polymarket',
 *   seriesId: string,
 *   cadence: 'daily',
 *   topicTags: string[],
 *   defaultHighlight: 'last',
 *   sourceLabel: string,
 *   values: number[],
 *   periods: string[],
 *   asOf: string,
 *   marketUrl: string,
 *   outcomeLabel: string,
 * }> | null>}
 */
export async function fetchPolymarketTop() {
  let markets
  try {
    markets = await fetchTopMarkets(TOP_N)
  } catch (err) {
    console.error(`  ✗ polymarket markets: ${err.message}`)
    return null
  }

  const filtered = markets
    .filter((m) => m.active && !m.closed)
    .filter((m) => {
      const cat = (m.category || m.groupItemCategory || '').toLowerCase()
      const title = m.question || m.title || ''
      if (DROP_TITLE_RE.test(title)) return false
      // Accept if category matches OR title contains ummah-relevant keywords.
      if (cat && KEEP_CATEGORIES.has(cat)) return true
      return /\b(iran|gaza|israel|lebanon|hezbollah|ukraine|russia|putin|trump|election|ceasefire|nuclear|fed|rate cut|opec|yemen|houthi|saudi|pakistan|bangladesh|egypt|sudan|hamas)\b/i.test(title)
    })
    .slice(0, TOP_N)

  console.log(`  · polymarket: ${markets.length} fetched, ${filtered.length} kept after filter`)

  const results = []
  for (const m of filtered) {
    const tokens = parseOutcomeTokens(m)
    if (!tokens) continue

    let history = []
    try {
      history = await fetchPriceHistory(tokens.tokenId)
    } catch (err) {
      console.error(`  ✗ polymarket history ${m.slug}: ${err.message}`)
      continue
    }
    if (history.length < 2) continue

    const values = history.map((h) => Math.round((h.p || 0) * 100))
    const periods = history.map((h) => formatPeriod(h.t))
    const asOf = ymd(new Date((history[history.length - 1].t || 0) * 1000))
    const title = m.question || m.title || 'Untitled market'
    const slug = sanitizeSlug(m.slug || title)

    results.push({
      id: `poly-${slug}`,
      label: title,
      unit: '%',
      source: 'polymarket',
      seriesId: m.slug || tokens.tokenId,
      cadence: 'daily',
      topicTags: ['prediction', 'polymarket', 'odds', ...extractTopicTags(title)],
      defaultHighlight: 'last',
      sourceLabel: 'Polymarket',
      values,
      periods,
      asOf,
      marketUrl: m.slug ? `https://polymarket.com/event/${m.slug}` : '',
      outcomeLabel: tokens.label,
    })
  }
  return results
}

function extractTopicTags(title) {
  const t = title.toLowerCase()
  const tags = []
  const map = {
    iran: ['iran'],
    gaza: ['gaza', 'hamas'],
    israel: ['israel'],
    lebanon: ['lebanon', 'hezbollah'],
    ukraine: ['ukraine', 'russia', 'putin'],
    trump: ['trump'],
    fed: ['fed', 'powell', 'rate'],
    ceasefire: ['ceasefire', 'truce'],
    nuclear: ['nuclear'],
    election: ['election'],
    hormuz: ['hormuz'],
    saudi: ['saudi'],
    yemen: ['yemen', 'houthi'],
  }
  for (const [tag, needles] of Object.entries(map)) {
    if (needles.some((n) => t.includes(n))) tags.push(tag)
  }
  return tags
}
