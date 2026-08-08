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

/** @typedef {Object} EntityCandidate
 *  @property {string} id            An indicator id in the trends-registry catalog.
 *  @property {string} label         How Haiku is asked to tell them apart.
 */

/** @typedef {Object} EntityRule
 *  @property {string} mention       What to match in the article body.
 *  @property {string} indicatorId   Matching id in the trends-registry catalog.
 *  @property {string} kind          Semantic class for the mobile EntitySheet.
 *  @property {boolean} [ambiguous]  If true, only emit when disambiguation agrees.
 *  @property {EntityCandidate[]} [candidates]
 *        The ordered options an ambiguous mention resolves between; the first
 *        is the fallback when Haiku errors out. Present on every `ambiguous`
 *        rule and read by scripts/extract-entities.js — and missing from this
 *        typedef until 2026-08-01, which is what made the rules below fail to
 *        typecheck against their own declared shape.
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
  // Ambiguous — require a Haiku disambiguation pass. The extractor batches
  // each ambiguous match into one Haiku call per cycle, resolves by article
  // context, and writes the winner. Structure: `candidates` is the ordered
  // list of possible indicator ids; first entry is the default fallback if
  // Haiku errors out. `peso` intentionally isn't listed here — MXN is the
  // only peso in the catalog, so bare `peso` resolves deterministically.
  {
    mention: 'rupee',
    indicatorId: 'fx-inr',
    kind: 'currency',
    ambiguous: true,
    candidates: [
      { id: 'fx-inr', label: 'Indian rupee (INR)' },
      { id: 'fx-pkr', label: 'Pakistani rupee (PKR)' },
    ],
  },
  { mention: 'peso', indicatorId: 'fx-mxn', kind: 'currency' }, // MXN is the only peso in catalog
  {
    mention: 'pound',
    indicatorId: 'fx-egp',
    kind: 'currency',
    ambiguous: true,
    candidates: [
      { id: 'fx-egp', label: 'Egyptian pound (EGP)' },
      { id: 'fx-lbp', label: 'Lebanese pound (LBP)' },
    ],
  },

  // ── Crypto ─────────────────────────────────────────────────────────────────
  { mention: 'Bitcoin',        indicatorId: 'btc',        kind: 'crypto' },
  { mention: 'BTC',            indicatorId: 'btc',        kind: 'crypto' },
  { mention: 'Ethereum',       indicatorId: 'eth',        kind: 'crypto' },
  { mention: 'ETH',            indicatorId: 'eth',        kind: 'crypto' },
  { mention: 'Monero',         indicatorId: 'xmr',        kind: 'crypto' },
  { mention: 'XMR',            indicatorId: 'xmr',        kind: 'crypto' },

  // ── Chokepoints ────────────────────────────────────────────────────────────
  //
  // **These resolve to `cp:<id>`, matching `content/.chokepoints.json`, and used
  // to resolve to `portwatch-*` ids that do not exist** (corrected 2026-08-08).
  //
  // The registry was written against `trends-registry.js`, which declares eight
  // portwatch indicators — but that source has not landed a single row in the
  // trends payload for as long as the snapshots go back, because chokepoint
  // series are fetched by `fetch-chokepoints.js` into their own file instead.
  // So every one of these pointed at an id the payload never carried, and
  // `indicatorMap` in `build.js` — which exists precisely so a chip cannot open
  // an empty sheet — silently dropped all of them. Measured at the time of the
  // fix: **305 articles carried a `portwatch-*` id and not one rendered a
  // chip.** The failure was invisible from either end; the frontmatter looked
  // populated and the page looked like an article that simply had no entities.
  //
  // `ENTITY_ID_ALIASES` below remaps the published frontmatter rather than
  // rewriting 305 files, so the corpus stays untouched and the fix is one
  // reversible table.
  { mention: 'Strait of Hormuz',indicatorId: 'cp:hormuz',            kind: 'chokepoint' },
  { mention: 'Hormuz',         indicatorId: 'cp:hormuz',             kind: 'chokepoint' },
  { mention: 'Bab-el-Mandeb',  indicatorId: 'cp:bab-el-mandeb',      kind: 'chokepoint' },
  { mention: 'Bab el-Mandeb',  indicatorId: 'cp:bab-el-mandeb',      kind: 'chokepoint' },
  { mention: 'Suez Canal',     indicatorId: 'cp:suez',               kind: 'chokepoint' },
  { mention: 'Suez',           indicatorId: 'cp:suez',               kind: 'chokepoint' },
  { mention: 'Panama Canal',   indicatorId: 'cp:panama',             kind: 'chokepoint' },
  { mention: 'Strait of Malacca', indicatorId: 'cp:malacca',         kind: 'chokepoint' },
  { mention: 'Malacca Strait', indicatorId: 'cp:malacca',            kind: 'chokepoint' },
  { mention: 'Taiwan Strait',  indicatorId: 'cp:taiwan',             kind: 'chokepoint' },
  { mention: 'Dover Strait',   indicatorId: 'cp:dover',              kind: 'chokepoint' },
  { mention: 'English Channel',indicatorId: 'cp:dover',              kind: 'chokepoint' },
  { mention: 'Strait of Gibraltar', indicatorId: 'cp:gibraltar',     kind: 'chokepoint' },
  { mention: 'Gibraltar Strait', indicatorId: 'cp:gibraltar',        kind: 'chokepoint' },
  { mention: 'Bosporus',       indicatorId: 'cp:bosporus',           kind: 'chokepoint' },
  { mention: 'Bosphorus',      indicatorId: 'cp:bosporus',           kind: 'chokepoint' },
  { mention: 'Kerch Strait',   indicatorId: 'cp:kerch',              kind: 'chokepoint' },
  { mention: 'Cape of Good Hope', indicatorId: 'cp:cape-of-good-hope', kind: 'chokepoint' },
]

/**
 * Published frontmatter ids that have been renamed, old → new.
 *
 * Read wherever an article's `entities[]` is resolved against a catalog. The
 * corpus is append-only in practice — 7,847 files, each one a published record
 * with its own git history — so a rename is a lookup, not a migration. Drop an
 * entry only once no article on disk carries the old id.
 */
export const ENTITY_ID_ALIASES = {
  'portwatch-hormuz-tanker': 'cp:hormuz',
  'portwatch-bab-container': 'cp:bab-el-mandeb',
  'portwatch-suez-total': 'cp:suez',
  'portwatch-panama-total': 'cp:panama',
  'portwatch-malacca-total': 'cp:malacca',
  'portwatch-taiwan-total': 'cp:taiwan',
  'portwatch-dover-total': 'cp:dover',
  'portwatch-gibraltar-total': 'cp:gibraltar',
}

/** Resolve a possibly-renamed indicator id to its current form. */
export const canonicalIndicatorId = (id) => ENTITY_ID_ALIASES[id] ?? id

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

/**
 * Whole-tag matcher for a `topicTags` entry.
 *
 * **Not a bare `includes`, and the reason is on the record.** `build.js` matched
 * exchange `topicTags` by substring until `smi` — the Swiss index — matched
 * "transmission" and hung eight unrelated technology stories off Zurich. Short
 * tickers are exactly what a market catalog is full of. The boundary is on the
 * whole tag rather than on each word, so multi-word tags like `red sea` still
 * match as a phrase.
 *
 * Lives here rather than inline in `build.js` because three call sites now want
 * it — the chokepoint join, the exchange join, and entity extraction — and the
 * bug above is what a second copy costs.
 */
export const tagMatcher = (tag) => {
  const escaped = String(tag).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`)
}

/** True when any of `tags` appears as a whole tag in `haystack`.
 *  `haystack` must already be lowercased — callers build it once per article
 *  and test it against many tag sets. */
export const matchesAnyTag = (tags, haystack) =>
  (tags || []).some((t) => tagMatcher(String(t).toLowerCase()).test(haystack))

/**
 * Scan one article for entity mentions. Returns:
 *   - resolved: entities with concrete indicatorIds ready for frontmatter
 *   - pending:  ambiguous matches awaiting a Haiku disambiguation pass
 *
 * `pending` entries carry `candidates` so the Haiku call has the full choice
 * space per mention. The caller resolves them in one batched call across the
 * whole cycle, then merges back into `resolved`.
 *
 * **`concepts` is scanned alongside the body**, and it is the cleaner of the
 * two signals: the selector emits Wikipedia-backed concept labels, so a story
 * whose subject is the Strait of Hormuz carries it as a concept whether or not
 * the 350-character body ever names it. Body-only matching was leaving
 * article→indicator coverage at 16% of the corpus.
 *
 * Lives in the registry rather than in `extract-entities.js` because
 * `attach-indicators.js` resolves the *same* question one stage earlier, over a
 * selection entry rather than a written article, and two copies of a matcher
 * are two answers to "is this story about oil".
 *
 * @param {string} body                Article body, or any prose to scan.
 * @param {Array<string|{label?: string}>} [concepts]  Concept labels.
 */
export function extractEntities(body, concepts = []) {
  const conceptText = (Array.isArray(concepts) ? concepts : [])
    .map((c) => (c && typeof c === 'object' ? c.label : c))
    .filter((s) => typeof s === 'string')
    .join('\n')
  const haystack = [typeof body === 'string' ? body : '', conceptText].join('\n')
  if (!haystack.trim()) return { resolved: [], pending: [] }

  const resolved = new Map() // key: indicatorId
  const pending = []

  for (const rule of ENTITY_RULES_SORTED) {
    const re = mentionToRegex(rule.mention)
    const match = re.exec(haystack)
    if (!match) continue
    if (rule.ambiguous) {
      // Defer — Haiku resolves with article context in the batch pass.
      pending.push({
        mention: match[0],
        candidates: rule.candidates || [{ id: rule.indicatorId, label: rule.indicatorId }],
        kind: rule.kind,
      })
      continue
    }
    if (!resolved.has(rule.indicatorId)) {
      resolved.set(rule.indicatorId, {
        mention: match[0],
        indicatorId: rule.indicatorId,
        kind: rule.kind,
      })
    }
  }
  return { resolved: [...resolved.values()], pending }
}
