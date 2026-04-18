// Static entity → indicator-id resolver.
//
// Maps known rich nouns (commodities, currencies, chokepoints, crypto,
// indices) to ids in the trends-registry catalog. Deterministic lookup,
// zero token cost — the moment a resolver match is unambiguous, we use it.
// Ambiguous mentions (rupee → PKR or INR? peso → MXN or ARS?) fall through
// to a Haiku disambiguation pass that uses article context.
//
// Adding new entries: drop a row below. Match is case-insensitive, whole-
// word, applied to article body text. `mention` strings with spaces match
// literal space-separated sequences ("Strait of Hormuz" matches verbatim).
// Shorter aliases listed before their longer forms is fine — extractor
// dedupes by resolved id per article.

/** @typedef {Object} EntityRule
 *  @property {string} mention       What to match in the article body.
 *  @property {string} indicatorId   Matching id in the trends-registry catalog.
 *  @property {string} kind          Semantic class for the mobile EntitySheet.
 *  @property {boolean} [ambiguous]  If true, only emit when disambiguation agrees.
 */

/** @type {EntityRule[]} */
export const ENTITY_RULES = [
  // ── Commodities ────────────────────────────────────────────────────────────
  { mention: 'gold',           indicatorId: 'paxg',       kind: 'commodity' },
  { mention: 'bullion',        indicatorId: 'paxg',       kind: 'commodity' },
  { mention: 'Brent crude',    indicatorId: 'brent',      kind: 'commodity' },
  { mention: 'Brent',          indicatorId: 'brent',      kind: 'commodity' },
  { mention: 'WTI crude',      indicatorId: 'wti',        kind: 'commodity' },
  { mention: 'WTI',            indicatorId: 'wti',        kind: 'commodity' },
  // Bare "oil" and "crude" default to Brent — our beat is overwhelmingly
  // petroleum; occasional non-oil uses ("olive oil") will over-match, which
  // is acceptable noise for v1. Haiku-disambiguation can refine later.
  { mention: 'crude oil',      indicatorId: 'brent',      kind: 'commodity' },
  { mention: 'oil',            indicatorId: 'brent',      kind: 'commodity' },
  { mention: 'crude',          indicatorId: 'brent',      kind: 'commodity' },
  { mention: 'natural gas',    indicatorId: 'natgas-hh',  kind: 'commodity' },
  { mention: 'Henry Hub',      indicatorId: 'natgas-hh',  kind: 'commodity' },
  { mention: 'TTF',            indicatorId: 'natgas-ttf', kind: 'commodity' },
  { mention: 'wheat',          indicatorId: 'wheat',      kind: 'commodity' },
  { mention: 'rice',           indicatorId: 'rice',       kind: 'commodity' },
  { mention: 'copper',         indicatorId: 'copper',     kind: 'commodity' },

  // ── Indices / macro ────────────────────────────────────────────────────────
  { mention: 'S&P 500',        indicatorId: 'sp500',      kind: 'index' },
  { mention: 'Nasdaq',         indicatorId: 'nasdaq100',  kind: 'index' },
  { mention: 'NASDAQ',         indicatorId: 'nasdaq100',  kind: 'index' },
  { mention: 'VIX',            indicatorId: 'vix',        kind: 'index' },
  { mention: '10-year yield',  indicatorId: 'us-10y',     kind: 'index' },
  { mention: '10-year Treasury', indicatorId: 'us-10y',   kind: 'index' },

  // ── Currencies — unambiguous by name ───────────────────────────────────────
  { mention: 'yen',            indicatorId: 'fx-jpy',     kind: 'currency' },
  { mention: 'lira',           indicatorId: 'fx-try',     kind: 'currency' },
  { mention: 'rupiah',         indicatorId: 'fx-idr',     kind: 'currency' },
  { mention: 'naira',          indicatorId: 'fx-ngn',     kind: 'currency' },
  { mention: 'taka',           indicatorId: 'fx-bdt',     kind: 'currency' },
  { mention: 'yuan',           indicatorId: 'fx-cny',     kind: 'currency' },
  { mention: 'renminbi',       indicatorId: 'fx-cny',     kind: 'currency' },
  { mention: 'ruble',          indicatorId: 'fx-rub',     kind: 'currency' },
  { mention: 'rand',           indicatorId: 'fx-zar',     kind: 'currency' },
  { mention: 'euro',           indicatorId: 'fx-eur',     kind: 'currency' },
  // Ambiguous ones — require disambiguation (rupee PK vs IN; peso MX vs AR; pound EG vs LB).
  // Extractor skips these for now; Haiku pass will resolve them later.
  { mention: 'rupee',          indicatorId: 'fx-inr',     kind: 'currency', ambiguous: true },
  { mention: 'peso',           indicatorId: 'fx-mxn',     kind: 'currency', ambiguous: true },
  { mention: 'pound',          indicatorId: 'fx-egp',     kind: 'currency', ambiguous: true },

  // ── Crypto ─────────────────────────────────────────────────────────────────
  { mention: 'Bitcoin',        indicatorId: 'btc',        kind: 'crypto' },
  { mention: 'BTC',            indicatorId: 'btc',        kind: 'crypto' },
  { mention: 'Ethereum',       indicatorId: 'eth',        kind: 'crypto' },
  { mention: 'ETH',            indicatorId: 'eth',        kind: 'crypto' },
  { mention: 'Monero',         indicatorId: 'xmr',        kind: 'crypto' },
  { mention: 'XMR',            indicatorId: 'xmr',        kind: 'crypto' },

  // ── Chokepoints ────────────────────────────────────────────────────────────
  { mention: 'Strait of Hormuz',indicatorId: 'portwatch-hormuz-tanker', kind: 'chokepoint' },
  { mention: 'Hormuz',         indicatorId: 'portwatch-hormuz-tanker', kind: 'chokepoint' },
  { mention: 'Bab-el-Mandeb',  indicatorId: 'portwatch-bab-container', kind: 'chokepoint' },
  { mention: 'Bab el-Mandeb',  indicatorId: 'portwatch-bab-container', kind: 'chokepoint' },
  { mention: 'Suez Canal',     indicatorId: 'portwatch-suez-total',    kind: 'chokepoint' },
  { mention: 'Suez',           indicatorId: 'portwatch-suez-total',    kind: 'chokepoint' },
  { mention: 'Panama Canal',   indicatorId: 'portwatch-panama-total',  kind: 'chokepoint' },
  { mention: 'Strait of Malacca', indicatorId: 'portwatch-malacca-total', kind: 'chokepoint' },
  { mention: 'Malacca Strait', indicatorId: 'portwatch-malacca-total', kind: 'chokepoint' },
  { mention: 'Taiwan Strait',  indicatorId: 'portwatch-taiwan-total',  kind: 'chokepoint' },
  { mention: 'Dover Strait',   indicatorId: 'portwatch-dover-total',   kind: 'chokepoint' },
  { mention: 'English Channel',indicatorId: 'portwatch-dover-total',   kind: 'chokepoint' },
  { mention: 'Strait of Gibraltar', indicatorId: 'portwatch-gibraltar-total', kind: 'chokepoint' },
  { mention: 'Gibraltar Strait', indicatorId: 'portwatch-gibraltar-total', kind: 'chokepoint' },
]

/** Sort rules longest-first so "Strait of Hormuz" beats "Hormuz" when both
 *  appear overlapping; the extractor takes the earliest non-overlapping match
 *  by position. */
export const ENTITY_RULES_SORTED = [...ENTITY_RULES].sort(
  (a, b) => b.mention.length - a.mention.length,
)

/** Regex-safe pattern for one mention — whole-word where possible. "Bitcoin"
 *  shouldn't match "Bitcoins" (plural). Handle punctuation and ampersands. */
export function mentionToRegex(mention) {
  const escaped = mention.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Word-boundary both sides; allow optional 's' for plural nouns at the end
  // so "rupees" / "tankers" still match — but block "Hormuzian" (letters).
  return new RegExp(`\\b${escaped}(?:s)?\\b`, 'gi')
}
