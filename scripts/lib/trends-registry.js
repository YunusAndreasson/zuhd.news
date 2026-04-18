// Registry of live-data indicators the editor can embed as trend blocks in a
// context brief. Each entry declares its fetch source, display metadata, and
// tags the edu-context stage uses to decide when it's relevant to an article.
//
// Keep this file flat and declarative. Per-source fetch logic lives in
// ./trends-sources/*.js and reads the `source` + `seriesId` fields here.

/** @typedef {'oil' | 'macro' | 'food' | 'fx' | 'shipping' | 'prediction' | 'energy'} Tier */

/** @typedef {Object} IndicatorDef
 *  @property {string} id            Stable ID used by editor + logs.
 *  @property {string} label         Display title (TrendBlock.label).
 *  @property {string} [unit]        Axis unit (TrendBlock.unit).
 *  @property {'fred'|'oer'|'polymarket'|'portwatch'} source
 *  @property {string} [seriesId]    Source-specific identifier (FRED series, OER currency, etc.)
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
  {
    id: 'portwatch-hormuz',
    label: 'Hormuz transits',
    unit: 'ships/day',
    source: 'portwatch',
    seriesId: 'hormuz',
    cadence: 'daily',
    topicTags: ['hormuz', 'strait', 'blockade', 'shipping', 'tanker', 'chokepoint', 'gulf shipping', 'iran navy', 'persian gulf'],
    defaultHighlight: 'last',
    sourceLabel: 'IMF PortWatch',
  },
  {
    id: 'portwatch-bab',
    label: 'Bab-el-Mandeb transits',
    unit: 'ships/day',
    source: 'portwatch',
    seriesId: 'bab-el-mandeb',
    cadence: 'daily',
    topicTags: ['red sea', 'bab-el-mandeb', 'houthi', 'yemen shipping', 'suez', 'chokepoint', 'sanaa'],
    defaultHighlight: 'last',
    sourceLabel: 'IMF PortWatch',
  },

  // Polymarket indicators are dynamic — fetchPolymarketTop() produces one
  // IndicatorDef-compatible object per top-20 market (id prefixed
  // `poly-<slug>`) directly in the snapshot, without a registry entry.
]
