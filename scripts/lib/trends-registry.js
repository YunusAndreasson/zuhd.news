// Registry of the live-data series the site and the app chart. Each entry
// declares its fetch source, its display metadata, and the tags that join it
// to stories: the writer's offer (`lib/indicator-offer.js`) and the desk's
// narration both match on them.
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

import { fetchBisPolicyRates } from './trends-sources/bis.js'
import { fetchFredSeries } from './trends-sources/fred.js'
import { fetchImfCommodityPrices } from './trends-sources/imf.js'
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
  // After FRED, whose rows these were: the snapshot's order is the sources'.
  imf: {
    fetcher: fetchImfCommodityPrices,
    requiredEnv: [],
    mode: 'batched',
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
  bis: {
    fetcher: fetchBisPolicyRates,
    requiredEnv: [],
    mode: 'batched',
  },
  wikipedia: {
    fetcher: fetchWikipediaTrendingConcepts,
    requiredEnv: [],
    mode: 'dynamic',
  },
}

/** @typedef {Object} IndicatorDef
 *  @property {string} id            Stable ID used by editor + logs.
 *  @property {string} label         Display title (TrendBlock.label).
 *  @property {string} [unit]        Axis unit (TrendBlock.unit).
 *  @property {'fred'|'imf'|'oer'|'polymarket'|'portwatch'|'crypto'|'wikipedia'|'bis'} source
 *  @property {string} [seriesId]    Source-specific identifier (FRED series, IMF commodity code, OER currency, BIS country code, etc.)
 *  @property {string} [field]       PortWatch only: which vessel column to read
 *        (`n_container`, `n_tanker`, …). Read by trends-sources/portwatch.js,
 *        which falls back to `n_total` when it is absent or unrecognised — and
 *        undeclared here until 2026-08-01, so the two chokepoint entries that
 *        set it did not match their own type.
 *  @property {'daily'|'monthly'}    cadence
 *  @property {'d'|'w'|'m'|'q'|'a'} [frequency] FRED only: ask the API to
 *    aggregate a higher-frequency series down to this. For a step function like
 *    a policy rate, 731 daily points carry six distinct values — see the
 *    downsample note in `trends-sources/fred.js`. Always the period's last
 *    value: an average of a step function invents levels nobody set.
 *  @property {'lin'|'chg'|'ch1'|'pch'|'pc1'|'pca'|'cch'|'cca'|'log'} [units]
 *    FRED only: a transformation the API applies (`pc1` = per cent change from
 *    a year ago). For a series whose level means nothing to a reader and whose
 *    rate is the whole story — the CPI.
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

  // ── Tier 2: food staples (IMF, monthly) ────────────────────────────────────
  {
    id: 'wheat',
    label: 'Wheat',
    unit: '$/mt',
    source: 'imf',
    seriesId: 'PWHEAMT',
    cadence: 'monthly',
    topicTags: ['wheat', 'grain', 'bread', 'food', 'food security', 'famine', 'el nino', 'drought', 'harvest'],
    defaultHighlight: 'last',
    sourceLabel: 'IMF',
  },
  {
    id: 'rice',
    label: 'Rice',
    unit: '$/mt',
    source: 'imf',
    seriesId: 'PRICENPQ',
    cadence: 'monthly',
    topicTags: ['rice', 'food', 'food security', 'asia food', 'monsoon', 'harvest'],
    defaultHighlight: 'last',
    sourceLabel: 'IMF',
  },

  // ── Policy rates, for the calendar cards that graph them ───────────────────
  //
  // These exist so a rate-decision card can draw the history of the thing being
  // decided. A countdown alone says when; the staircase says from where.
  //
  // `cadence: 'monthly'` for a daily series is deliberate on both counts: it
  // buys the 24-month window (90 days of a policy rate is a flat line — measured,
  // literally zero changes), and it makes the app describe a move as
  // month-on-month, which is the only honest window for a number that changes
  // at meetings. `frequency: 'm'` then samples it end-of-period so the payload
  // carries 25 points rather than 731.
  //
  // Not on the map's instrument rail: that reads explicit catalog lists
  // (`MONEY`, `WORLD`), so a registry row does not appear there until it is
  // named. These are for the app's outlook column.
  {
    id: 'fed-funds',
    label: 'Fed target rate',
    unit: '%',
    source: 'fred',
    seriesId: 'DFEDTARU',
    cadence: 'monthly',
    frequency: 'm',
    topicTags: ['fomc', 'federal reserve', 'fed', 'interest rate', 'interest rates', 'rate cut', 'rate hike', 'powell'],
    countryTags: ['US'],
    defaultHighlight: 'last',
    sourceLabel: 'FRED · Board of Governors',
  },
  {
    id: 'ecb-rate',
    label: 'ECB deposit rate',
    unit: '%',
    source: 'fred',
    seriesId: 'ECBDFR',
    cadence: 'monthly',
    frequency: 'm',
    topicTags: ['ecb', 'european central bank', 'euro', 'eurozone', 'interest rate', 'interest rates', 'lagarde'],
    defaultHighlight: 'last',
    sourceLabel: 'FRED · ECB',
  },
  {
    id: 'us-unemployment',
    label: 'US unemployment',
    unit: '%',
    source: 'fred',
    seriesId: 'UNRATE',
    cadence: 'monthly',
    topicTags: ['jobs report', 'unemployment', 'payrolls', 'labor market', 'nonfarm', 'bls'],
    countryTags: ['US'],
    defaultHighlight: 'last',
    sourceLabel: 'FRED · BLS',
  },
  {
    // The number a CPI release is about, so the release's card in the app can
    // draw the same staircase the FOMC card draws for the policy rate. The
    // tags are US-anchored on purpose: `attach-indicators.js` matches tags
    // alone, and a bare `inflation` would hand a US 2.9% to a story about
    // Turkish or British prices.
    id: 'us-cpi',
    label: 'US inflation (CPI, y/y)',
    unit: '%',
    source: 'fred',
    seriesId: 'CPIAUCSL',
    units: 'pc1',
    cadence: 'monthly',
    topicTags: ['us inflation', 'us cpi', 'cpi report', 'us consumer prices', 'bls'],
    countryTags: ['US'],
    defaultHighlight: 'last',
    sourceLabel: 'FRED · BLS',
  },
  {
    // The euro area's own print, so the app's rates list is not the US alone.
    // The harmonised index, as a year-on-year rate (`pc1`), for the reason
    // `us-cpi` is one. Tags name the euro area, as that one's name the US.
    id: 'ez-cpi',
    label: 'Eurozone inflation (y/y)',
    unit: '%',
    source: 'fred',
    seriesId: 'CP0000EZ19M086NEST',
    units: 'pc1',
    cadence: 'monthly',
    topicTags: ['eurozone inflation', 'euro zone inflation', 'euro area inflation', 'euro-area inflation', 'hicp'],
    countryTags: ['EU'],
    defaultHighlight: 'last',
    sourceLabel: 'FRED · Eurostat',
  },

  // ── What borrowing costs: two more US rates (FRED) ─────────────────────────
  //
  // Added 2026-10-03 with the policy rates below, when the app gave rates a
  // list of their own (they shared one with crypto, and it held five rows).
  {
    id: 'us-2y',
    label: 'US 2y Treasury',
    unit: '%',
    source: 'fred',
    seriesId: 'DGS2',
    cadence: 'daily',
    topicTags: ['2-year treasury', 'two-year treasury', '2-year yield', 'two-year yield', 'yield curve'],
    countryTags: ['US'],
    defaultHighlight: 'last',
    sourceLabel: 'FRED · Board of Governors',
  },
  {
    // Weekly (Freddie Mac's Thursday survey), carried as `daily` the way
    // `us-gas-retail` is: ninety days is thirteen prints, each with its day.
    id: 'us-mortgage',
    label: 'US 30-year mortgage rate',
    unit: '%',
    source: 'fred',
    seriesId: 'MORTGAGE30US',
    cadence: 'daily',
    topicTags: ['us mortgage rate', 'us mortgage rates', 'u.s. mortgage rates', '30-year mortgage', 'freddie mac'],
    countryTags: ['US'],
    defaultHighlight: 'last',
    sourceLabel: 'FRED · Freddie Mac',
  },

  // ── Policy rates beyond the Fed and the ECB (BIS, keyless) ─────────────────
  //
  // Each central bank's own rate, collected daily by the BIS and drawn as the
  // Fed's is: a point a month over two years (`trends-sources/bis.js`). The
  // Bank of England and the Bank of Japan have decision dates in the event
  // catalog, so their cards in the app can now draw the rate being decided.
  //
  // Named for the country, not the bank: `Turkey interest rate` needs no
  // finance to read, and `TCMB one-week repo` does. `sourceLabel` carries the
  // bank. Tags name the bank or the decision and never the country alone —
  // `attach-indicators.js` matches tags alone, and a bare `turkey` would hang
  // a policy rate off every story about Ankara.
  //
  // Not here: India (the BIS daily series ran 72 days behind on 2026-10-03,
  // past the fetcher's staleness bar), and Pakistan, Egypt and Nigeria, which
  // the BIS does not collect.
  {
    id: 'boe-rate',
    label: 'UK interest rate',
    unit: '%',
    source: 'bis',
    seriesId: 'GB',
    cadence: 'monthly',
    topicTags: ['bank of england', 'boe', 'bank rate', 'uk interest rate', 'uk interest rates', 'threadneedle street'],
    countryTags: ['GB'],
    defaultHighlight: 'last',
    sourceLabel: 'BIS · Bank of England',
  },
  {
    id: 'boj-rate',
    label: 'Japan interest rate',
    unit: '%',
    source: 'bis',
    seriesId: 'JP',
    cadence: 'monthly',
    topicTags: ['bank of japan', 'boj', 'japan interest rate', 'japan interest rates', 'ueda'],
    countryTags: ['JP'],
    defaultHighlight: 'last',
    sourceLabel: 'BIS · Bank of Japan',
  },
  {
    id: 'tcmb-rate',
    label: 'Turkey interest rate',
    unit: '%',
    source: 'bis',
    seriesId: 'TR',
    cadence: 'monthly',
    topicTags: ['turkish central bank', 'turkey central bank', "turkey's central bank", 'tcmb', 'turkey interest rate', 'turkish interest rates'],
    countryTags: ['TR'],
    defaultHighlight: 'last',
    sourceLabel: 'BIS · Central Bank of Türkiye',
  },
  {
    // The one-year loan prime rate: what the BIS records as China's policy
    // rate since 2019, and the one Chinese lenders price loans off.
    id: 'pboc-rate',
    label: 'China interest rate',
    unit: '%',
    source: 'bis',
    seriesId: 'CN',
    cadence: 'monthly',
    topicTags: ["people's bank of china", 'pboc', 'loan prime rate', 'china interest rate', 'china interest rates', 'china rate cut'],
    countryTags: ['CN'],
    defaultHighlight: 'last',
    sourceLabel: "BIS · People's Bank of China",
  },
  {
    id: 'cbr-rate',
    label: 'Russia interest rate',
    unit: '%',
    source: 'bis',
    seriesId: 'RU',
    cadence: 'monthly',
    topicTags: ['bank of russia', 'russian central bank', "russia's central bank", 'key rate', 'nabiullina', 'russia interest rate'],
    countryTags: ['RU'],
    defaultHighlight: 'last',
    sourceLabel: 'BIS · Bank of Russia',
  },
  {
    id: 'bcb-rate',
    label: 'Brazil interest rate',
    unit: '%',
    source: 'bis',
    seriesId: 'BR',
    cadence: 'monthly',
    topicTags: ['selic', 'copom', 'brazilian central bank', "brazil's central bank", 'banco central do brasil', 'brazil interest rate'],
    countryTags: ['BR'],
    defaultHighlight: 'last',
    sourceLabel: 'BIS · Central Bank of Brazil',
  },
  {
    id: 'bi-rate',
    label: 'Indonesia interest rate',
    unit: '%',
    source: 'bis',
    seriesId: 'ID',
    cadence: 'monthly',
    topicTags: ['bank indonesia', "indonesia's central bank", 'indonesian central bank', 'bi rate', 'indonesia interest rate'],
    countryTags: ['ID'],
    defaultHighlight: 'last',
    sourceLabel: 'BIS · Bank Indonesia',
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

  // ── Tier 2: industrial metals (IMF) + macro bellwethers (FRED) ─────────────
  {
    id: 'copper',
    label: 'Copper',
    unit: '$/mt',
    source: 'imf',
    seriesId: 'PCOPP',
    cadence: 'monthly',
    topicTags: ['copper', 'metals', 'electrification', 'ev', 'grid', 'wiring', 'chile', 'zambia', 'peru', 'china demand', 'industrial'],
    defaultHighlight: 'last',
    sourceLabel: 'IMF',
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

  // ── The largest other coins (CoinGecko) ────────────────────────────────────
  //
  // Added 2026-10-03, when the app gave crypto a list of its own and it held
  // three rows. With Bitcoin and Ethereum these are the ten largest coins by
  // market value on that day that are not pegged to something else — no
  // dollar stablecoin (their price is the peg, so there is no line to draw)
  // and no tokenised loan book. Monero, above, is eleventh and stays for the
  // coverage it draws. A ranking drifts: re-check it when one of these has
  // plainly left the top of the table, not on a schedule.
  //
  // Tags are the coin's own name and ticker. `crypto` is on Bitcoin and
  // Ethereum already, and eight more coins answering to it would offer the
  // writer ten charts for one story.
  {
    id: 'bnb',
    label: 'BNB',
    unit: '$',
    source: 'crypto',
    seriesId: 'binancecoin',
    cadence: 'daily',
    topicTags: ['bnb', 'binance coin', 'bnb chain', 'binance smart chain'],
    defaultHighlight: 'last',
    sourceLabel: 'CoinGecko',
  },
  {
    id: 'xrp',
    label: 'XRP',
    unit: '$',
    source: 'crypto',
    seriesId: 'ripple',
    cadence: 'daily',
    topicTags: ['xrp', 'ripple', 'xrp ledger'],
    defaultHighlight: 'last',
    sourceLabel: 'CoinGecko',
  },
  {
    id: 'sol',
    label: 'Solana',
    unit: '$',
    source: 'crypto',
    seriesId: 'solana',
    cadence: 'daily',
    topicTags: ['solana'],
    defaultHighlight: 'last',
    sourceLabel: 'CoinGecko',
  },
  {
    id: 'trx',
    label: 'Tron',
    unit: '$',
    source: 'crypto',
    seriesId: 'tron',
    cadence: 'daily',
    topicTags: ['tron network', 'tron blockchain', 'trx', 'justin sun'],
    defaultHighlight: 'last',
    sourceLabel: 'CoinGecko',
  },
  {
    id: 'zec',
    label: 'Zcash',
    unit: '$',
    source: 'crypto',
    seriesId: 'zcash',
    cadence: 'daily',
    topicTags: ['zcash', 'zec'],
    defaultHighlight: 'last',
    sourceLabel: 'CoinGecko',
  },
  {
    id: 'hype',
    label: 'Hyperliquid',
    unit: '$',
    source: 'crypto',
    seriesId: 'hyperliquid',
    cadence: 'daily',
    topicTags: ['hyperliquid'],
    defaultHighlight: 'last',
    sourceLabel: 'CoinGecko',
  },
  {
    id: 'doge',
    label: 'Dogecoin',
    unit: '$',
    source: 'crypto',
    seriesId: 'dogecoin',
    cadence: 'daily',
    topicTags: ['dogecoin', 'doge coin'],
    defaultHighlight: 'last',
    sourceLabel: 'CoinGecko',
  },
  {
    id: 'link',
    label: 'Chainlink',
    unit: '$',
    source: 'crypto',
    seriesId: 'chainlink',
    cadence: 'daily',
    topicTags: ['chainlink'],
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

  // ── Tier 2: European natural gas (IMF) — complements Henry Hub ─────────────
  {
    id: 'natgas-ttf',
    label: 'Natural gas (TTF, Europe)',
    unit: '$/MMBtu',
    source: 'imf',
    seriesId: 'PNGASEU',
    cadence: 'monthly',
    topicTags: ['ttf', 'european gas', 'europe gas', 'natural gas', 'lng', 'nord stream', 'russia gas', 'qatar lng', 'heating', 'energy europe'],
    defaultHighlight: 'last',
    sourceLabel: 'IMF',
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
