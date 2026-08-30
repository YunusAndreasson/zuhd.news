// Polymarket (Gamma API) fetcher.
// Docs: https://docs.polymarket.com/developers/gamma-markets-api/overview
// No auth, no cost. We fetch the top *events* by 24h volume, drop the ones
// whose tags say they are sport or a price ladder, then pull a price history
// for each surviving market.
//
// It read `/markets` until 2026-08-29, and filtered on `m.category` against an
// eight-entry allow-list. **That field is `undefined` on every row the endpoint
// returns** — probed live: 60 markets, 0 with a category — so the allow-list had
// never matched anything and the entire filter was the keyword regex below,
// applied to a pool that is roughly four-fifths football, baseball and esports.
// Measured: 60 fetched, 3 distinct events kept, which is why the app's outlook
// column was two cards deep.
//
// `/events` is the same data one level up and it carries the taxonomy
// `category` was supposed to be — `sports`, `esports`, `games`, `politics`,
// `geopolitics`, `economic-policy` — with the markets nested inside, their
// `clobTokenIds` intact. So the filter became a short list of tags we drop
// rather than a long list of words we hope to see, and the event-level dedupe
// below stopped being an inference. Same probe after: 60 events, 18 kept,
// including the Strait of Hormuz and Bab el-Mandeb markets — questions about
// the exact waterways the shipping column already charts, which the keyword
// list had been dropping because "hormuz" was not one of its words.
//
// This fetcher returns dynamic IndicatorDef-compatible objects (one per top
// market) so the orchestrator can treat them the same as static FRED/OER
// indicators.

import { runWithConcurrency } from '../concurrency.js'
import { CC_TO_TOPOJSON_NAME } from '../../../shared/countries/iso.ts'

const GAMMA_BASE = 'https://gamma-api.polymarket.com'
const CLOB_BASE = 'https://clob.polymarket.com'
const USER_AGENT = 'zuhd-news/1.0 (+https://zuhd.news)'

const TOP_N = 20

// Minimum daily points to chart usefully — a 2-point line is just a slope.
const MIN_HISTORY_POINTS = 5

// "Decided" filter: a market whose tail sits within ±DECIDED_BAND of an
// extreme is informationally dead — the chart is a flat line. We check the
// last DECIDED_TAIL_FRACTION of points.
const DECIDED_BAND = 3   // percentage points
const DECIDED_TAIL_FRACTION = 1 / 3

/**
 * The tags that disqualify an event, each for its own reason. Editorial, and
 * kept short on purpose — this is a drop list, so anything not named here is
 * admitted, and the cost of a missing entry is one odd card rather than a
 * whole subject going dark. That asymmetry is the entire argument for
 * inverting the old allow-list.
 *
 *   sports/esports/games  — four-fifths of the volume-ranked pool, and none of
 *                           it is news. This is the one doing the real work.
 *   pop-culture           — the "how many times will X tweet" ladders.
 *   hit-price/multi-strikes — a price-target ladder on bitcoin, ether or WTI.
 *                           We publish those three as actual price series; a
 *                           market on where one lands by Friday is a worse
 *                           reading of a thing we already chart properly.
 */
const DROP_TAGS = new Set([
  'sports',
  'esports',
  'games',
  'pop-culture',
  'hit-price',
  'multi-strikes',
])

/** A second net under the tags, for a market whose event was tagged loosely.
 *  Kept from the pre-`/events` filter, where it was the only thing working. */
const DROP_TITLE_RE = /\b(nfl|nba|mlb|nhl|ncaa|super bowl|world cup|uefa|oscars|grammy|emmy|dogecoin|shiba|pepe|bitcoin price|ethereum price|eth price)\b/i

function formatPeriod(tsSeconds) {
  const d = new Date(tsSeconds * 1000)
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  return `${month} ${d.getUTCDate()}`
}

function ymd(d) {
  return d.toISOString().slice(0, 10)
}

/**
 * Top events by 24h volume, tag-filtered, flattened back to markets.
 *
 * Gamma sorts on `order=volume24hr` (camelCase). The public docs spell it
 * `volume_24hr` and that form returns essentially-random results — confirmed
 * against the live API 2026-04. We over-fetch to leave headroom after the tag
 * and decided pruning below.
 *
 * Each market is handed back with its parent event stitched into `events[0]`,
 * because that is where the rest of this file already looks for the event slug
 * it dedupes and builds the card URL from. Nothing downstream had to change.
 */
async function fetchTopMarkets(limit) {
  const url = new URL(`${GAMMA_BASE}/events`)
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
  const events = Array.isArray(data) ? data : data.data || data.events || []

  let droppedByTag = 0
  let droppedAllDecided = 0
  const markets = []
  for (const ev of events) {
    const tags = (ev.tags || []).map((t) => String(t.slug || t.label || '').toLowerCase())
    if (tags.some((t) => DROP_TAGS.has(t))) {
      droppedByTag++
      continue
    }

    /**
     * One market per event, chosen here rather than after the history calls.
     *
     * An event is a question and its markets are that question's outcomes —
     * "Presidential Election Winner 2028" carries several hundred of them, one
     * per candidate. Flattening them all produced 627 markets from 12 events,
     * and the `slice(TOP_N)` below then cut *inside* the first two events, so
     * widening the filter made the output smaller rather than larger. The
     * dedupe further down already wanted exactly one per event; doing it here
     * means it costs no price-history calls instead of one per outcome.
     *
     * Highest 24h volume that is not already decided. `lastTradePrice` comes
     * free on this payload, so skipping a 2% long-shot to reach the outcome
     * people are actually trading costs nothing — and picking purely by volume
     * would hand a 500-candidate election its noisiest row.
     */
    const live = (ev.markets || [])
      .filter((m) => {
        const ltp = Number(m.lastTradePrice)
        return !Number.isFinite(ltp) || (ltp > 0.03 && ltp < 0.97)
      })
      .sort((a, b) => (Number(b.volume24hr) || 0) - (Number(a.volume24hr) || 0))
    if (!live.length) {
      droppedAllDecided++
      continue
    }
    markets.push({
      ...live[0],
      // The event's own dates where the market omits them. An event that has
      // ended is the expiry case the `endDate` filter downstream exists for,
      // and a nested market does not always carry one.
      endDate: live[0].endDate || ev.endDate,
      events: [{ slug: ev.slug, title: ev.title }],
      _eventTags: ev.tags || [],
    })
  }
  console.log(
    `  · polymarket: ${events.length} events — ${droppedByTag} dropped by tag, ` +
      `${droppedAllDecided} with every outcome decided, ${markets.length} questions kept`,
  )
  return markets
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

/** Regex fallback — used only if Haiku fails. Strip "Will" prefix,
 *  collapse "U.S." → "US", ellipsis-truncate. Loses nuance on edge cases,
 *  which is why Haiku is the primary path. */
function shortenTitleRegex(raw) {
  if (!raw || typeof raw !== 'string') return 'Untitled market'
  // 52, not the original 42. The app gives each contract a whole card with a
  // two-line title, and the extra ten characters are what stop a question
  // being cut off mid-clause there. The web's odds rail trims further on its
  // own (`oddsShort` in `_map/markets.ts`), so the narrow surface is unaffected.
  const TARGET = 52
  const s = raw.trim()
    // The article is required, and that is the whole fix. Stripping a bare
    // "Will " turned "Will there be no change in Fed interest rates?" into
    // "there be no change in Fed interest rates" — which is not English, and
    // was shipping as a card title. "Will the US invade Iran?" → "US invade
    // Iran?" still reads as a headline, so that case keeps its shortening.
    .replace(/^Will\s+the\s+/i, '')
    .replace(/^the\s+U\.?S\.?\s+/i, 'US ')
    .replace(/\bU\.S\./g, 'US')
    .replace(/\s+/g, ' ')
  if (s.length <= TARGET) return s
  const cut = s.slice(0, TARGET - 1)
  const lastSpace = cut.lastIndexOf(' ')
  const head = lastSpace > TARGET - 15 ? cut.slice(0, lastSpace) : cut
  return `${head.replace(/[?.!,;:]+$/, '')}…`
}

/**
 * Is the model's shortened title still a title?
 *
 * The app gives every contract a whole card and prints this label as the
 * headline, so a label that is not English is a broken screen. Two of the
 * three live markets were shipping one:
 *
 *   "Will there be no change in Fed interest rates…?"
 *      → "there be no change in Fed interest rates…"
 *   "Will Alexandria Ocasio-Cortez win the 2028 US presidential election?"
 *      → "Alexandria Ocasio-Cortez win the 2028 US…"
 *
 * Both are the same mistake: the model dropped the fronted auxiliary and left
 * a subject with a bare infinitive. `shortenTitleRegex` already knows the rule
 * — a leading "Will" survives unless it is followed by "the", because "Will
 * the US invade Iran?" → "US invade Iran?" still reads as a headline and
 * "Will there be…" → "there be…" does not. This applies the same rule to the
 * model's answer, and falls back to the regex shortener when it fails.
 *
 * Cheap and worth it: the model is not asked again, the fallback is the code
 * path that already existed for a failed Haiku call, and the failure mode this
 * replaces was silent.
 */
function isUsableShortTitle(raw, short) {
  if (typeof short !== 'string' || short.trim().length === 0) return false
  const s = short.trim()
  // A headline does not start in lower case. This alone catches the class;
  // the auxiliary test below catches the rest of it.
  if (/^[a-z]/.test(s)) return false
  // "Will X …" keeps its "Will" — anything else has dropped the verb the
  // question was built around.
  if (/^Will\s+(?!the\s)/i.test(raw.trim()) && !/^Will\b/i.test(s)) return false
  return true
}

/** Batch-shorten Polymarket titles via Haiku. One call, all titles, ~2s.
 *  Returns an array aligned to the input. On any failure (CLI error,
 *  parse error, wrong length) falls back to the regex shortener per-item
 *  so the pipeline never blocks on this.
 *
 *  @param {string[]} titles  Raw market questions.
 *  @returns {Promise<string[]>}
 */
/**
 * The shape every path out of the shortener returns, so a caller never has to
 * ask which one it got. The regex fallback cannot infer a country, and an empty
 * list is the truthful answer rather than a missing one.
 */
function fallbackLabels(titles) {
  return titles.map((t) => ({ label: shortenTitleRegex(t), countryTags: [] }))
}

/**
 * Keep only codes the map can actually resolve.
 *
 * A model asked for ISO-2 will occasionally answer `UK`, `EU`, `PS-GZ` or a
 * country's name in full, and an unresolvable tag is worse than no tag: it
 * looks like coverage and silently matches nothing. `CC_TO_TOPOJSON_NAME` is
 * the same table the map draws its countries from, so a code that survives this
 * is a code something on the page can key on.
 */
/**
 * ISO-2 codes from an event's own tag slugs.
 *
 * Gamma tags an event with its subjects — `iran`, `france`, `brazil`,
 * `united-states` sit alongside `politics` and `oil` — so the countries a
 * question is about are in the payload before any model sees it. 23 of the 34
 * slugs observed on a live pull resolve straight off `CC_TO_TOPOJSON_NAME`, and
 * every non-country slug resolves to nothing, which is the failure mode we
 * want: an unresolvable tag matches no country rather than inventing one.
 *
 * This exists because the model call it backstops is slow and was being killed
 * on its timeout every run, taking every question's country tags with it. Tags
 * cannot see that a Fed market is about the US — its slugs are `fomc`,
 * `fed-rates`, `jerome-powell` — so the two are unioned rather than swapped:
 * this is the floor that survives a timeout, not a replacement.
 */
const TAG_SLUG_TO_CC = (() => {
  const slug = (x) => x.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const m = new Map()
  for (const [cc, name] of Object.entries(CC_TO_TOPOJSON_NAME)) m.set(slug(name), cc)
  // Genuine divergences between Polymarket's slug and Natural Earth's name
  // only — no identity entries, for the reason the trends payload's own
  // country-tag record gives: an alias that restates the name is dead weight
  // that reads as coverage.
  m.set('united-states', 'US')
  m.set('usa', 'US')
  m.set('uk', 'GB')
  m.set('britain', 'GB')
  m.set('uae', 'AE')
  m.set('south-korea', 'KR')
  m.set('north-korea', 'KP')
  return m
})()

function countriesFromEventTags(tags) {
  const out = []
  for (const raw of tags || []) {
    const cc = TAG_SLUG_TO_CC.get(String(raw.slug || raw.label || '').toLowerCase())
    if (cc && !out.includes(cc)) out.push(cc)
  }
  return out
}

function validCodes(list) {
  if (!Array.isArray(list)) return []
  const out = []
  for (const raw of list) {
    if (typeof raw !== 'string') continue
    const cc = raw.trim().toUpperCase()
    if (CC_TO_TOPOJSON_NAME[cc] && !out.includes(cc)) out.push(cc)
  }
  return out
}

/** How many titles one Haiku call is asked for. Measured: a chunk of 4 lands in
 *  25-35s, the whole 10-title batch took 98s — the call scales worse than
 *  linearly in batch size, and the trends stage has 120s for six sources. */
const HAIKU_CHUNK = 4

/** How many of those run at once. Three chunks in flight covers a full deck in
 *  roughly one chunk's wall-clock; more would put four `claude` processes on a
 *  box that is also running the rest of the cycle. */
const HAIKU_CONCURRENCY = 4

// One chunk's ceiling. Measured, and it has been wrong twice: 40s held while a
// batch was 3 titles and died the moment the tag filter widened the deck; 60s
// held after chunking and then began SIGTERMing on 38% of cycles (Aug 22-30),
// costing every question its country tags to the regex fallback each time.
//
// Measured again 2026-08-30 with the ceiling lifted so nothing was killed:
// chunks of 4 titles took 22s, 33s and 33s, total 34.2s, 10/10 tagged. So the
// typical run is nowhere near 60s and the failures are a latency *tail*, not
// the norm — which is why raising the ceiling costs nothing on a normal cycle
// and only buys back the tail.
//
// 100s is sized against the stage, not picked round. `runWithConcurrency` runs
// HAIKU_CONCURRENCY chunks at a time, so wall time is (waves x ceiling), and
// the concurrency above is 4 so that an observed deck (10-14 questions, i.e.
// 3-4 chunks of HAIKU_CHUNK) is a SINGLE wave. Worst case is then one ceiling,
// not two: ~40s for the other five sources + 100s here = 140s inside the
// `timeout 180` that run-cycle.sh gives the stage. Two waves at this ceiling
// would exceed that budget, which is the thing to re-check if HAIKU_CHUNK,
// HAIKU_CONCURRENCY or the deck size moves.
//
// Overrun is not a publish risk: TRENDS_EXIT is logged and never acted on, so
// a blown stage costs that cycle's trends data and nothing else.
// Override with PM_HAIKU_TIMEOUT_MS.
const HAIKU_TIMEOUT_MS = Number(process.env.PM_HAIKU_TIMEOUT_MS) || 100_000

/**
 * Shorten and country-tag every title, in parallel chunks.
 *
 * One call for the whole batch was right when the deck was three questions.
 * Widening the tag filter took it to ten and the single call went from
 * comfortably inside its timeout to 98s — over the budget of the entire stage,
 * and killed at 40s every run, which silently cost every question its country
 * tags. Chunking trades one long call for three short concurrent ones and puts
 * the wall-clock back where it was.
 *
 * A chunk that fails degrades on its own: `shortenBatchViaHaiku` already falls
 * back to the regex form for the titles it was given, so one bad chunk costs
 * four labels rather than the deck's.
 */
async function shortenTitlesViaHaiku(titles) {
  if (titles.length <= HAIKU_CHUNK) return shortenBatchViaHaiku(titles)
  const chunks = []
  for (let i = 0; i < titles.length; i += HAIKU_CHUNK) chunks.push({ at: i, titles: titles.slice(i, i + HAIKU_CHUNK) })
  // `runWithConcurrency` resolves to nothing — it is a rate limiter, not a
  // `map` — so each chunk writes into its own slot. Order is the contract
  // here: the caller zips the result against `deduped` by index.
  const out = new Array(chunks.length)
  await runWithConcurrency(chunks, HAIKU_CONCURRENCY, async (chunk) => {
    out[chunk.at / HAIKU_CHUNK] = await shortenBatchViaHaiku(chunk.titles)
  })
  return out.flat()
}

async function shortenBatchViaHaiku(titles) {
  if (titles.length === 0) return []
  // Timed, because this ceiling has now been wrong twice — 40s when the deck
  // widened, then 60s once chunking landed — and both times the evidence was a
  // silent regex fallback rather than a number anyone could read. "Timeouts are
  // measured, not guessed" needs the measurement to be in the log.
  const chunkStarted = Date.now()
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { randomUUID } = await import('node:crypto')
  const run = promisify(execFile)

  const items = titles.map((t, i) => `${i + 1}. ${t}`).join('\n')
  const prompt = `You are shortening prediction-market question titles so they fit as chart headers on a mobile phone.

Constraints per title:
- ≤42 characters
- Preserve the question mark if the original is a yes/no
- Preserve the date horizon ("by 2027", "in 2026") if present — it is the market's whole point
- Drop only filler ("Will the ...", "U.S." → "US", passive voice)
- Keep proper names and countries intact
- Output must be natural, not abbreviated to gibberish

Examples:
  "Will the U.S. invade Iran before 2027?"              → "US invade Iran by 2027?"
  "Will Kevin Warsh be confirmed as Fed Chair?"         → "Kevin Warsh confirmed as Fed Chair?"
  "Will Roberto Sánchez Palomino win the 2026 Peruvian presidential election?" → "Sánchez Palomino wins Peru 2026?"

Titles to shorten:
${items}

Also identify which countries each question is *about* — the states whose
conduct or territory the market turns on, not every place mentioned in passing.
Use ISO 3166-1 alpha-2 codes. A question about the Fed is about US; a question
about an Israel-Iran ceasefire is about IL and IR; a question about Bitcoin is
about no country at all. Return an empty array when none applies — that is the
common case and guessing is worse than leaving it empty.

Return ONLY a JSON array, same order and same length as the input, of objects:
  [{"title": "US invade Iran by 2027?", "countries": ["US","IR"]}, ...]
No commentary, no markdown fences.`

  const env = { ...process.env }
  delete env.CLAUDECODE
  const tmpId = randomUUID().slice(0, 8)
  /**
   * `execFile`, not `spawnSync`.
   *
   * This was `spawnSync` inside a `runWithConcurrency(_, 3, …)`, which is three
   * chunks of nothing: `spawnSync` blocks the event loop until the child exits,
   * so the "concurrent" chunks ran strictly one after another and chunking made
   * the stage *slower* than the single call it replaced. Measured before: two
   * chunks, 80.6s, one of them SIGTERM-killed. The limiter can only limit work
   * that yields.
   */
  let res
  try {
    res = await run('claude', [
      '--model', 'claude-haiku-4-5-20251001',
      '--no-session-persistence',
      '--max-turns', '1',
      '--output-format', 'json',
      '-p', prompt,
    // 60s against a measured 25-35s for a chunk of this size. It was 40s for a
    // whole batch, which held while the batch was 3 titles and stopped holding
    // the moment the tag filter widened the deck: measured at 10 titles the one
    // call took **98s**, SIGTERM at 40s every run, so every question lost its
    // country tags to the regex fallback. Chunking is what fixed it — see
    // `shortenTitlesViaHaiku` — and this ceiling now covers one chunk with
    // room, inside a 120s stage that has five other sources to fetch.
    ], { encoding: 'utf-8', timeout: HAIKU_TIMEOUT_MS, maxBuffer: 256 * 1024, env })
  } catch (err) {
    console.error(
      `  ✗ polymarket-haiku ${tmpId}: ${err.code ?? err.message} after ${Math.round((Date.now() - chunkStarted) / 1000)}s ` +
      `(ceiling ${Math.round(HAIKU_TIMEOUT_MS / 1000)}s, ${titles.length} titles) — falling back to regex`,
    )
    return fallbackLabels(titles)
  }
  console.error(`  · polymarket-haiku ${tmpId}: ${titles.length} titles in ${Math.round((Date.now() - chunkStarted) / 1000)}s`)

  try {
    // Claude envelope: outer JSON wrapping result text
    const envelope = JSON.parse(res.stdout)
    const raw = envelope.result ?? envelope.text ?? res.stdout
    // Strip possible markdown fence + locate the JSON array
    const cleaned = String(raw).replace(/^```(?:json)?\s*|\s*```$/g, '').trim()
    const start = cleaned.indexOf('[')
    const end = cleaned.lastIndexOf(']')
    if (start === -1 || end === -1) throw new Error('no JSON array in output')
    const arr = JSON.parse(cleaned.slice(start, end + 1))
    if (!Array.isArray(arr) || arr.length !== titles.length) {
      throw new Error(`expected ${titles.length} titles, got ${arr?.length}`)
    }
    return arr.map((row, i) => {
      // Tolerant of the older bare-string shape, because the model occasionally
      // answers the question it was asked last week rather than this one.
      const label = typeof row === 'string' ? row : row?.title
      return {
        label: typeof label === 'string' && label.length > 0 ? label : shortenTitleRegex(titles[i]),
        countryTags: validCodes(row?.countries),
      }
    })
  } catch (err) {
    console.error(`  ✗ polymarket-haiku ${tmpId}: ${err.message} — falling back to regex`)
    return fallbackLabels(titles)
  }
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
    /**
     * **`active` and `closed` do not track expiry, and the API says so.**
     *
     * A market whose deadline has passed keeps `active: true, closed: false`
     * until UMA resolves it, which can take months. Probed live: *"Will Adanech
     * Abiebie be the next Prime Minister of Ethiopia?"* carried
     * `endDate: 2026-06-01` — two months gone — alongside both flags saying it
     * was live, and on the rail *"US x Iran Effective Ceasefire by July 31"* sat
     * at 62% four days after July 31. A probability on a question whose date has
     * passed is not a forecast; it is the last price before everyone stopped
     * caring, and printing it beside live markets makes the block untrustworthy
     * in a way a reader cannot check.
     *
     * The source's own `endDate` is the test, so nothing has to be inferred from
     * the question text. Markets with no end date are kept: an open-ended market
     * is a real thing, and dropping one for a missing field would be reading
     * absence as expiry.
     */
    .filter((m) => {
      const end = Date.parse(m.endDate ?? m.endDateIso ?? '')
      return !Number.isFinite(end) || end >= Date.now()
    })
    // The subject filter is the event tags, applied in `fetchTopMarkets`. What
    // is left here is the second net: a market whose event was tagged loosely.
    // The keyword allow-list this replaced is gone rather than kept as a
    // fallback — it was dropping the Strait of Hormuz for not being on it, and
    // a list that silently decides what the app may cover is worse than no
    // list once something better exists.
    .filter((m) => !DROP_TITLE_RE.test(m.question || m.title || ''))
    .slice(0, TOP_N)

  console.log(`  · polymarket: ${markets.length} considered, ${filtered.length} kept after filter`)

  const results = []
  for (const m of filtered) {
    // Decided markets pre-filter: lastTradePrice pinned to an extreme means the
    // chart is a flat line — skip BEFORE paying for the CLOB history call.
    // isDecidedSeries() below still catches tail-decided markets this misses.
    const ltp = Number(m.lastTradePrice)
    if (Number.isFinite(ltp) && (ltp >= 0.97 || ltp <= 0.03)) continue

    const tokens = parseOutcomeTokens(m)
    if (!tokens) continue

    let history = []
    try {
      history = await fetchPriceHistory(tokens.tokenId)
    } catch (err) {
      console.error(`  ✗ polymarket history ${m.slug}: ${err.message}`)
      continue
    }
    if (history.length < MIN_HISTORY_POINTS) continue

    const values = history.map((h) => Math.round((h.p || 0) * 100))
    if (isDecidedSeries(values)) continue

    const periods = history.map((h) => formatPeriod(h.t))
    const asOf = ymd(new Date((history[history.length - 1].t || 0) * 1000))
    const rawTitle = m.question || m.title || 'Untitled market'
    const slug = sanitizeSlug(m.slug || rawTitle)
    const eventSlug = m.events?.[0]?.slug || null
    const eventUrl = eventSlug ? `https://polymarket.com/event/${eventSlug}` : ''

    // Shortened label is filled in by a batched Haiku call after the loop so
    // we spend one Claude call on all kept markets rather than one each.
    results.push({
      id: `poly-${slug}`,
      label: rawTitle,
      rawTitle,
      unit: '%',
      source: 'polymarket',
      seriesId: m.slug || tokens.tokenId,
      cadence: 'daily',
      topicTags: ['prediction', 'polymarket', 'odds', ...extractTopicTags(rawTitle)],
      defaultHighlight: 'last',
      sourceLabel: 'Polymarket',
      values,
      periods,
      asOf,
      marketUrl: eventUrl,
      outcomeLabel: tokens.label,
      // 24h movement in percentage points, straight from the list response
      // (zero extra calls) — lets consumers rank "biggest movers".
      change24h: Number.isFinite(Number(m.oneDayPriceChange)) ? Math.round(Number(m.oneDayPriceChange) * 100) : null,
      // The countries the source itself says this question is about. Set here
      // rather than after the model call, so a killed call costs a long header
      // and never a country tag.
      countryTags: countriesFromEventTags(m._eventTags),
      // Internal — used for event-level dedupe below, not persisted.
      _eventSlug: eventSlug,
      _volume24hr: Number(m.volume24hr) || 0,
    })
  }

  // Dedupe by event: many "neg-risk" markets (e.g. Fed +25/no change/-25/-50)
  // share one event. Keep the highest-volume outcome per event so the editor
  // sees one chart per real-world question rather than four near-duplicates.
  const dedupedByEvent = new Map()
  const standalone = []
  for (const r of results) {
    if (!r._eventSlug) {
      standalone.push(r)
      continue
    }
    const existing = dedupedByEvent.get(r._eventSlug)
    if (!existing || r._volume24hr > existing._volume24hr) {
      dedupedByEvent.set(r._eventSlug, r)
    }
  }
  const deduped = [...standalone, ...dedupedByEvent.values()]
  for (const r of deduped) {
    delete r._eventSlug
    delete r._volume24hr
  }

  if (deduped.length < results.length) {
    console.log(`  · polymarket: deduped ${results.length} → ${deduped.length} (one per event)`)
  }

  // Batch-shorten titles via Haiku in one call. Kept after dedup to avoid
  // spending tokens on labels we'd drop anyway. Titles already within the
  // 42-char header budget skip the call — smaller batches finish inside the
  // 40s spawn timeout that used to SIGTERM full batches (exit 143), and a
  // cycle where every title fits skips the Haiku call entirely.
  // **Every deduped row now, not only the long ones.** The call also returns the
  // countries each question is about, and that is worth having for a title that
  // already fits — skipping those left the shortest, most quotable markets as
  // the only untagged ones. It is the same single call and the same batch size
  // order of magnitude, so the token cost is unchanged in kind.
  if (deduped.length > 0) {
    const enriched = await shortenTitlesViaHaiku(deduped.map((r) => r.rawTitle))
    let tagged = 0
    let rejected = 0
    for (let i = 0; i < deduped.length; i++) {
      // A title already inside the header budget keeps its own words: the model
      // is here for the countries, and re-writing a label that did not need it
      // is a change nobody asked for and nobody can review.
      if (deduped[i].rawTitle.length > 42) {
        const proposed = enriched[i].label
        if (isUsableShortTitle(deduped[i].rawTitle, proposed)) {
          deduped[i].label = proposed
        } else {
          rejected++
          deduped[i].label = shortenTitleRegex(deduped[i].rawTitle)
        }
      }
      // Union, not replacement. The tags are the floor and the model is the
      // bonus: tag slugs cannot tell that a market on the FOMC is about the US,
      // and the model cannot be relied on to answer inside its timeout.
      deduped[i].countryTags = [
        ...new Set([...(deduped[i].countryTags || []), ...enriched[i].countryTags]),
      ]
      if (deduped[i].countryTags.length) tagged++
    }
    console.log(`  · polymarket: ${tagged}/${deduped.length} questions tagged with a country`)
    if (rejected > 0) {
      console.log(`  · polymarket: ${rejected} shortened title(s) rejected, kept the regex form`)
    }
  }
  for (const r of deduped) {
    delete r.rawTitle
    delete r._eventTags
  }

  return deduped
}

/** A series is "decided" if its tail (last DECIDED_TAIL_FRACTION of points)
 *  sits within DECIDED_BAND of 0 or 100 — the chart would be a flat line. */
function isDecidedSeries(values) {
  if (values.length < MIN_HISTORY_POINTS) return false
  const tailLen = Math.max(2, Math.ceil(values.length * DECIDED_TAIL_FRACTION))
  const tail = values.slice(-tailLen)
  const allLow = tail.every((v) => v <= DECIDED_BAND)
  const allHigh = tail.every((v) => v >= 100 - DECIDED_BAND)
  return allLow || allHigh
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
