// Registry of live-data indicators the editor can embed as trend blocks in a
// context brief. Each entry declares its fetch source, display metadata, and
// tags the edu-context stage uses to decide when it's relevant to an article.
//
// Keep this file flat and declarative. Per-source fetch logic lives in
// ./trends-sources/*.js and reads the `source` + `seriesId` fields here.
//
// Adding a new source:
//   1. Drop scripts/lib/trends-sources/<name>.js exporting either
//      `fetch<Name>(indicator, ...args)` returning {values, periods, asOf}
//      OR `fetch<Name>Top(...)` returning a list of fully-formed snapshot
//      entries (the dynamic shape — Polymarket-style).
//   2. Add an entry to SOURCES below.
//   3. Add registry entries here (skip step 3 for dynamic sources).
// The fetch-trends.js orchestrator iterates SOURCES — no new code needed.

import { fetchFredSeries } from './trends-sources/fred.js'
import { fetchOerRates } from './trends-sources/oer.js'
import { fetchPolymarketTop } from './trends-sources/polymarket.js'
import { fetchPortWatchChokepoint } from './trends-sources/portwatch.js'
import { fetchCoinGeckoSeries } from './trends-sources/crypto.js'
import { fetchWikipediaTrendingConcepts } from './trends-sources/wikipedia.js'

/** @typedef {Object} SourceDef
 *  @property {Function} fetcher
 *  @property {string[]} requiredEnv  Env var names this source needs (skip with warning if missing).
 *  @property {'perIndicator'|'batched'|'dynamic'} mode
 *      - perIndicator: orchestrator calls fetcher(indicator) once per matching registry row.
 *      - batched:      one call covers all matching rows (orchestrator passes seriesIds + cache path).
 *      - dynamic:      no registry rows; fetcher returns full snapshot entries directly.
 */

/** @type {Record<string, SourceDef>} */
export const SOURCES = {
  fred: {
    fetcher: fetchFredSeries,
    requiredEnv: ['FRED_API_KEY'],
    mode: 'perIndicator',
  },
  oer: {
    fetcher: fetchOerRates,
    requiredEnv: ['OER_APP_ID'],
    mode: 'batched',
  },
  portwatch: {
    fetcher: fetchPortWatchChokepoint,
    requiredEnv: [],
    mode: 'perIndicator',
  },
  polymarket: {
    fetcher: fetchPolymarketTop,
    requiredEnv: [],
    mode: 'dynamic',
  },
  crypto: {
    fetcher: fetchCoinGeckoSeries,
    requiredEnv: [],
    mode: 'perIndicator',
  },
  wikipedia: {
    fetcher: fetchWikipediaTrendingConcepts,
    requiredEnv: [],
    mode: 'dynamic',
  },
}

/** @typedef {'oil' | 'macro' | 'food' | 'fx' | 'shipping' | 'prediction' | 'energy'} Tier */

/** @typedef {Object} IndicatorDef
 *  @property {string} id            Stable ID used by editor + logs.
 *  @property {string} label         Display title (TrendBlock.label).
 *  @property {string} [unit]        Axis unit (TrendBlock.unit).
 *  @property {'fred'|'oer'|'polymarket'|'portwatch'|'crypto'|'wikipedia'} source
 *  @property {string} [seriesId]    Source-specific identifier (FRED series, OER currency, etc.)
 *  @property {string} [field]       PortWatch only: which vessel column to read
 *        (`n_container`, `n_tanker`, …). Read by trends-sources/portwatch.js,
 *        which falls back to `n_total` when it is absent or unrecognised — and
 *        undeclared here until 2026-08-01, so the two chokepoint entries that
 *        set it did not match their own type.
 *  @property {'daily'|'monthly'}    cadence
 *  @property {string[]} topicTags   Lowercased tags matched against article concepts/title/body.
 *  @property {string[]} [countryTags] ISO-2 codes matched against article.location/sources.
 *  @property {'last'|'first'|'max'|'min'} [defaultHighlight]
 *  @property {string} sourceLabel   Short citation shown under the chart.
 */

/** @type {IndicatorDef[]} */
export const INDICATORS = [
  // ── Tier 1: oil + macro commodities (FRED, public domain) ──────────────────
  {
    id: 'brent',
    label: 'Brent crude',
    unit: '$/bbl',
    source: 'fred',
    seriesId: 'DCOILBRENTEU',
    cadence: 'daily',
    topicTags: ['oil', 'crude', 'opec', 'iran', 'russia', 'hormuz', 'gulf', 'energy', 'fuel', 'refinery', 'sanctions', 'pemex', 'aramco', 'shipping', 'fertilizer'],
    defaultHighlight: 'last',
    sourceLabel: 'FRED · EIA',
  },
  {
    id: 'wti',
    label: 'WTI crude',
    unit: '$/bbl',
    source: 'fred',
    seriesId: 'DCOILWTICO',
    cadence: 'daily',
    topicTags: ['oil', 'crude', 'us oil', 'pemex', 'shale', 'wti'],
    defaultHighlight: 'last',
    sourceLabel: 'FRED · EIA',
  },
  // Gold/silver deliberately omitted: FRED's LBMA fixing series were retired
  // (2017) and no free daily replacement is currently wired. Revisit with
  // metals-api, Stooq, or GoldAPI.io when a gold-focused story warrants it.
  {
    id: 'natgas-hh',
    label: 'Natural gas (Henry Hub)',
    unit: '$/MMBtu',
    source: 'fred',
    seriesId: 'DHHNGSP',
    cadence: 'daily',
    topicTags: ['natural gas', 'gas', 'lng', 'pipeline', 'energy', 'heating', 'europe gas', 'asia lng'],
    defaultHighlight: 'last',
    sourceLabel: 'FRED · EIA',
  },

  // ── Tier 2: food staples (FRED, monthly) ───────────────────────────────────
  {
    id: 'wheat',
    label: 'Wheat',
    unit: '$/mt',
    source: 'fred',
    seriesId: 'PWHEAMTUSDM',
    cadence: 'monthly',
    topicTags: ['wheat', 'grain', 'bread', 'food', 'food security', 'famine', 'el nino', 'drought', 'harvest'],
    defaultHighlight: 'last',
    sourceLabel: 'FRED · IMF',
  },
  {
    id: 'rice',
    label: 'Rice',
    unit: '$/mt',
    source: 'fred',
    seriesId: 'PRICENPQUSDM',
    cadence: 'monthly',
    topicTags: ['rice', 'food', 'food security', 'asia food', 'monsoon', 'harvest'],
    defaultHighlight: 'last',
    sourceLabel: 'FRED · IMF',
  },

  // ── Tier 1: ummah currency basket (OER) ────────────────────────────────────
  {
    id: 'fx-pkr',
    label: 'Pakistani rupee',
    unit: 'PKR / USD',
    source: 'oer',
    seriesId: 'PKR',
    cadence: 'daily',
    topicTags: ['pakistan', 'rupee', 'imf', 'sbp', 'karachi', 'islamabad', 'remittance'],
    countryTags: ['PK'],
    defaultHighlight: 'last',
    sourceLabel: 'Open Exchange Rates',
  },
  {
    id: 'fx-ngn',
    label: 'Nigerian naira',
    unit: 'NGN / USD',
    source: 'oer',
    seriesId: 'NGN',
    cadence: 'daily',
    topicTags: ['nigeria', 'naira', 'tinubu', 'cbn', 'abuja', 'lagos'],
    countryTags: ['NG'],
    defaultHighlight: 'last',
    sourceLabel: 'Open Exchange Rates',
  },
  {
    id: 'fx-egp',
    label: 'Egyptian pound',
    unit: 'EGP / USD',
    source: 'oer',
    seriesId: 'EGP',
    cadence: 'daily',
    topicTags: ['egypt', 'pound', 'sisi', 'cairo', 'suez'],
    countryTags: ['EG'],
    defaultHighlight: 'last',
    sourceLabel: 'Open Exchange Rates',
  },
  {
    id: 'fx-try',
    label: 'Turkish lira',
    unit: 'TRY / USD',
    source: 'oer',
    seriesId: 'TRY',
    cadence: 'daily',
    topicTags: ['turkey', 'lira', 'erdogan', 'ankara', 'istanbul', 'tcmb'],
    countryTags: ['TR'],
    defaultHighlight: 'last',
    sourceLabel: 'Open Exchange Rates',
  },
  {
    id: 'fx-bdt',
    label: 'Bangladesh taka',
    unit: 'BDT / USD',
    source: 'oer',
    seriesId: 'BDT',
    cadence: 'daily',
    topicTags: ['bangladesh', 'taka', 'dhaka', 'bnp', 'yunus'],
    countryTags: ['BD'],
    defaultHighlight: 'last',
    sourceLabel: 'Open Exchange Rates',
  },
  {
    id: 'fx-idr',
    label: 'Indonesian rupiah',
    unit: 'IDR / USD',
    source: 'oer',
    seriesId: 'IDR',
    cadence: 'daily',
    topicTags: ['indonesia', 'rupiah', 'prabowo', 'jakarta'],
    countryTags: ['ID'],
    defaultHighlight: 'last',
    sourceLabel: 'Open Exchange Rates',
  },
  {
    id: 'fx-lbp',
    label: 'Lebanese pound',
    unit: 'LBP / USD',
    source: 'oer',
    seriesId: 'LBP',
    cadence: 'daily',
    topicTags: ['lebanon', 'beirut', 'hezbollah', 'pound'],
    countryTags: ['LB'],
    defaultHighlight: 'last',
    sourceLabel: 'Open Exchange Rates',
  },

  // ── Tier 2: shipping chokepoints (IMF PortWatch) ───────────────────────────
  // Per-chokepoint vessel class is the meaningful series, not the total: the
  // Hormuz story is tankers (oil flow), the Bab-el-Mandeb / Red Sea story is
  // containers (Houthi targeting of commercial shipping).
  {
    id: 'portwatch-hormuz-tanker',
    label: 'Hormuz tanker transits',
    unit: 'ships/day',
    source: 'portwatch',
    seriesId: 'hormuz',
    field: 'n_tanker',
    cadence: 'daily',
    topicTags: ['hormuz', 'strait', 'blockade', 'shipping', 'tanker', 'chokepoint', 'gulf shipping', 'iran navy', 'persian gulf', 'oil flow'],
    defaultHighlight: 'last',
    sourceLabel: 'IMF PortWatch',
  },
  {
    id: 'portwatch-bab-container',
    label: 'Bab-el-Mandeb containers',
    unit: 'ships/day',
    source: 'portwatch',
    seriesId: 'bab-el-mandeb',
    field: 'n_container',
    cadence: 'daily',
    topicTags: ['red sea', 'bab-el-mandeb', 'houthi', 'yemen shipping', 'suez', 'chokepoint', 'sanaa', 'container', 'maersk', 'commercial shipping'],
    defaultHighlight: 'last',
    sourceLabel: 'IMF PortWatch',
  },

  // Polymarket indicators are dynamic — fetchPolymarketTop() produces one
  // IndicatorDef-compatible object per top-20 market (id prefixed
  // `poly-<slug>`) directly in the snapshot, without a registry entry.

  // ── Tier 2: industrial metals + macro bellwethers (FRED) ───────────────────
  {
    id: 'copper',
    label: 'Copper',
    unit: '$/mt',
    source: 'fred',
    seriesId: 'PCOPPUSDM',
    cadence: 'monthly',
    topicTags: ['copper', 'metals', 'electrification', 'ev', 'grid', 'wiring', 'chile', 'zambia', 'peru', 'china demand', 'industrial'],
    defaultHighlight: 'last',
    sourceLabel: 'FRED · IMF',
  },
  {
    id: 'us-10y',
    label: 'US 10y Treasury',
    unit: '%',
    source: 'fred',
    seriesId: 'DGS10',
    cadence: 'daily',
    topicTags: ['treasury', 'yield', 'fed', 'bond', 'capital flow', 'emerging markets', 'em debt', 'dollar', 'rate hike', 'interest rates'],
    defaultHighlight: 'last',
    sourceLabel: 'FRED · Board of Governors',
  },
  {
    id: 'vix',
    label: 'VIX',
    unit: 'index',
    source: 'fred',
    seriesId: 'VIXCLS',
    cadence: 'daily',
    topicTags: ['vix', 'volatility', 'market stress', 'risk off', 'fear gauge', 'panic', 'crisis', 'equities'],
    defaultHighlight: 'last',
    sourceLabel: 'FRED · CBOE',
  },
  {
    id: 'sp500',
    label: 'S&P 500',
    unit: 'index',
    source: 'fred',
    seriesId: 'SP500',
    cadence: 'daily',
    topicTags: ['sp500', 's&p', 'equities', 'stocks', 'wall street', 'us stocks', 'market', 'bull', 'bear'],
    defaultHighlight: 'last',
    sourceLabel: 'FRED · S&P',
  },
  {
    id: 'nasdaq100',
    label: 'NASDAQ-100',
    unit: 'index',
    source: 'fred',
    seriesId: 'NASDAQ100',
    cadence: 'daily',
    topicTags: ['nasdaq', 'tech stocks', 'big tech', 'ai capex', 'hyperscaler', 'meta', 'alphabet', 'google', 'microsoft', 'nvidia', 'amazon', 'apple'],
    defaultHighlight: 'last',
    sourceLabel: 'FRED · NASDAQ',
  },
  {
    id: 'us-gas-retail',
    label: 'US gasoline (retail)',
    unit: '$/gal',
    source: 'fred',
    seriesId: 'GASREGW',
    cadence: 'daily',
    topicTags: ['gasoline', 'gas price', 'pump price', 'fuel', 'jet fuel', 'diesel', 'motor fuel', 'refinery', 'consumer prices'],
    defaultHighlight: 'last',
    sourceLabel: 'FRED · EIA',
  },

  // ── Tier 3: crypto (CoinGecko, no key) ─────────────────────────────────────
  {
    id: 'btc',
    label: 'Bitcoin',
    unit: '$',
    source: 'crypto',
    seriesId: 'bitcoin',
    cadence: 'daily',
    topicTags: ['bitcoin', 'btc', 'crypto', 'blockchain', 'mining', 'satoshi', 'quantum bitcoin', 'on-chain', 'coinbase', 'kraken', 'spot etf', 'halving'],
    defaultHighlight: 'last',
    sourceLabel: 'CoinGecko',
  },
  {
    id: 'eth',
    label: 'Ethereum',
    unit: '$',
    source: 'crypto',
    seriesId: 'ethereum',
    cadence: 'daily',
    topicTags: ['ethereum', 'eth', 'crypto', 'smart contracts', 'l2', 'rollup', 'mev', 'defi', 'eth etf', 'vitalik', 'merge', 'proof of stake'],
    defaultHighlight: 'last',
    sourceLabel: 'CoinGecko',
  },
  {
    id: 'paxg',
    label: 'Gold (PAX Gold)',
    unit: '$/oz',
    source: 'crypto',
    seriesId: 'pax-gold',
    cadence: 'daily',
    topicTags: ['gold', 'bullion', 'reserves', 'lbma', 'safe haven', 'central bank reserves', 'islamic finance', 'waqf', 'dinar', 'inflation hedge'],
    defaultHighlight: 'last',
    sourceLabel: 'CoinGecko · PAXG (gold-backed)',
  },
  {
    id: 'xag',
    label: 'Silver (Kinesis)',
    unit: '$/oz',
    source: 'crypto',
    // Same trick as PAXG above: the metal itself has no free daily series we
    // can reach, but a fully-backed token tracking it does. KAG is one troy
    // ounce of allocated silver — checked against PAXG on the same day, the
    // gold/silver ratio comes out at 71.5, which is where it should be. If that
    // ratio ever goes somewhere absurd, this symbol has stopped tracking the
    // metal and should be dropped rather than quietly reported.
    seriesId: 'kinesis-silver',
    cadence: 'daily',
    topicTags: ['silver', 'bullion', 'precious metals', 'safe haven', 'industrial metals', 'solar', 'reserves', 'inflation hedge'],
    defaultHighlight: 'last',
    sourceLabel: 'CoinGecko · KAG (silver-backed)',
  },
  {
    id: 'xmr',
    label: 'Monero',
    unit: '$',
    source: 'crypto',
    seriesId: 'monero',
    cadence: 'daily',
    topicTags: ['monero', 'xmr', 'privacy coin', 'ransomware', 'darknet', 'sanctions evasion', 'ddos payment', 'anonymity', 'delisting'],
    defaultHighlight: 'last',
    sourceLabel: 'CoinGecko',
  },

  // ── Tier 2: additional PortWatch chokepoints (coverage for non-Gulf shifts) ─
  {
    id: 'portwatch-suez-total',
    label: 'Suez Canal transits',
    unit: 'ships/day',
    source: 'portwatch',
    seriesId: 'suez',
    cadence: 'daily',
    topicTags: ['suez', 'egypt', 'canal', 'red sea diversion', 'cape rerouting', 'trade route', 'chokepoint', 'houthi', 'shipping', 'transit revenue'],
    defaultHighlight: 'last',
    sourceLabel: 'IMF PortWatch',
  },
  {
    id: 'portwatch-panama-total',
    label: 'Panama Canal transits',
    unit: 'ships/day',
    source: 'portwatch',
    seriesId: 'panama',
    cadence: 'daily',
    topicTags: ['panama', 'canal', 'drought', 'gatun lake', 'americas trade', 'chokepoint', 'shipping', 'climate disruption', 'transit slot auction'],
    defaultHighlight: 'last',
    sourceLabel: 'IMF PortWatch',
  },
  {
    id: 'portwatch-malacca-total',
    label: 'Malacca Strait transits',
    unit: 'ships/day',
    source: 'portwatch',
    seriesId: 'malacca',
    cadence: 'daily',
    topicTags: ['malacca', 'strait', 'east asia trade', 'china imports', 'chokepoint', 'shipping', 'indonesia', 'singapore', 'malaysia', 'piracy'],
    defaultHighlight: 'last',
    sourceLabel: 'IMF PortWatch',
  },
  {
    id: 'portwatch-taiwan-total',
    label: 'Taiwan Strait transits',
    unit: 'ships/day',
    source: 'portwatch',
    seriesId: 'taiwan',
    cadence: 'daily',
    topicTags: ['taiwan', 'strait', 'china', 'pla navy', 'pla', 'semiconductor', 'tsmc', 'chokepoint', 'shipping', 'blockade', 'cross-strait'],
    defaultHighlight: 'last',
    sourceLabel: 'IMF PortWatch',
  },
  {
    id: 'portwatch-dover-total',
    label: 'Dover Strait transits',
    unit: 'ships/day',
    source: 'portwatch',
    seriesId: 'dover',
    cadence: 'daily',
    topicTags: ['dover', 'english channel', 'uk', 'france', 'europe shipping', 'chokepoint', 'migrant crossing', 'small boats'],
    defaultHighlight: 'last',
    sourceLabel: 'IMF PortWatch',
  },
  {
    id: 'portwatch-gibraltar-total',
    label: 'Gibraltar Strait transits',
    unit: 'ships/day',
    source: 'portwatch',
    seriesId: 'gibraltar',
    cadence: 'daily',
    topicTags: ['gibraltar', 'strait', 'mediterranean', 'morocco', 'spain', 'europe shipping', 'chokepoint', 'migrant crossing'],
    defaultHighlight: 'last',
    sourceLabel: 'IMF PortWatch',
  },

  // ── Tier 2: European natural gas (FRED) — complements Henry Hub ────────────
  {
    id: 'natgas-ttf',
    label: 'Natural gas (TTF, Europe)',
    unit: '$/MMBtu',
    source: 'fred',
    seriesId: 'PNGASEUUSDM',
    cadence: 'monthly',
    topicTags: ['ttf', 'european gas', 'europe gas', 'natural gas', 'lng', 'nord stream', 'russia gas', 'qatar lng', 'heating', 'energy europe'],
    defaultHighlight: 'last',
    sourceLabel: 'FRED · IMF',
  },

  // ── Tier 3: geographic FX fill (OER) — catalog hardening vs news-pivot ─────
  // Non-Ummah pairs for when coverage shifts to LatAm, East Asia, Europe, or
  // Russia/Africa beyond Nigeria/Egypt. Same fetcher; one OER call covers them.
  {
    id: 'fx-cny',
    label: 'Chinese yuan',
    unit: 'CNY / USD',
    source: 'oer',
    seriesId: 'CNY',
    cadence: 'daily',
    topicTags: ['china', 'yuan', 'renminbi', 'rmb', 'pboc', 'beijing', 'belt and road', 'taiwan', 'property crisis'],
    countryTags: ['CN'],
    defaultHighlight: 'last',
    sourceLabel: 'Open Exchange Rates',
  },
  {
    id: 'fx-inr',
    label: 'Indian rupee',
    unit: 'INR / USD',
    source: 'oer',
    seriesId: 'INR',
    cadence: 'daily',
    topicTags: ['india', 'rupee', 'rbi', 'modi', 'delhi', 'mumbai', 'bjp', 'hindu nationalism', 'kashmir'],
    countryTags: ['IN'],
    defaultHighlight: 'last',
    sourceLabel: 'Open Exchange Rates',
  },
  {
    id: 'fx-brl',
    label: 'Brazilian real',
    unit: 'BRL / USD',
    source: 'oer',
    seriesId: 'BRL',
    cadence: 'daily',
    topicTags: ['brazil', 'real', 'bcb', 'lula', 'brasilia', 'sao paulo', 'amazon deforestation', 'bolsonaro'],
    countryTags: ['BR'],
    defaultHighlight: 'last',
    sourceLabel: 'Open Exchange Rates',
  },
  {
    id: 'fx-mxn',
    label: 'Mexican peso',
    unit: 'MXN / USD',
    source: 'oer',
    seriesId: 'MXN',
    cadence: 'daily',
    topicTags: ['mexico', 'peso', 'banxico', 'amlo', 'sheinbaum', 'pemex', 'cartel', 'nearshoring', 'border'],
    countryTags: ['MX'],
    defaultHighlight: 'last',
    sourceLabel: 'Open Exchange Rates',
  },
  {
    id: 'fx-eur',
    label: 'Euro',
    unit: 'EUR / USD',
    source: 'oer',
    seriesId: 'EUR',
    cadence: 'daily',
    topicTags: ['euro', 'ecb', 'eurozone', 'brussels', 'frankfurt', 'germany', 'france', 'italy', 'spain', 'eu', 'european central bank'],
    countryTags: ['EU', 'DE', 'FR', 'IT', 'ES'],
    defaultHighlight: 'last',
    sourceLabel: 'Open Exchange Rates',
  },
  {
    id: 'fx-jpy',
    label: 'Japanese yen',
    unit: 'JPY / USD',
    source: 'oer',
    seriesId: 'JPY',
    cadence: 'daily',
    topicTags: ['japan', 'yen', 'boj', 'tokyo', 'carry trade', 'intervention', 'ldp', 'ishiba'],
    countryTags: ['JP'],
    defaultHighlight: 'last',
    sourceLabel: 'Open Exchange Rates',
  },
  {
    id: 'fx-rub',
    label: 'Russian ruble',
    unit: 'RUB / USD',
    source: 'oer',
    seriesId: 'RUB',
    cadence: 'daily',
    topicTags: ['russia', 'ruble', 'cbr', 'moscow', 'sanctions', 'putin', 'ukraine war', 'war economy', 'oil revenue'],
    countryTags: ['RU'],
    defaultHighlight: 'last',
    sourceLabel: 'Open Exchange Rates',
  },
  {
    id: 'fx-zar',
    label: 'South African rand',
    unit: 'ZAR / USD',
    source: 'oer',
    seriesId: 'ZAR',
    cadence: 'daily',
    topicTags: ['south africa', 'rand', 'sarb', 'pretoria', 'anc', 'mining', 'platinum', 'brics'],
    countryTags: ['ZA'],
    defaultHighlight: 'last',
    sourceLabel: 'Open Exchange Rates',
  },

  // Wikipedia indicators are produced dynamically by
  // fetchWikipediaTrendingConcepts() from the top concepts of recent
  // published articles — no static rows here. Adding more is done by
  // writing articles about new topics; the source auto-adapts.
]

// Normalize at load: editor matching is case- and whitespace-sensitive, and
// the dynamic Polymarket source emits its own tags downstream. Catching
// stray uppercase / trailing whitespace here keeps a single typo from
// silently dropping an indicator out of every relevance match.
for (const i of INDICATORS) {
  i.topicTags = i.topicTags.map((t) => t.trim().toLowerCase())
  if (i.countryTags) i.countryTags = i.countryTags.map((c) => c.trim().toUpperCase())
}
