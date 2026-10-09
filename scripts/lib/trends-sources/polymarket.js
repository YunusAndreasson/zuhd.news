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
//
// Selection is sticky (2026-09-04). It re-rolled the whole deck by 24h volume
// on every cycle, five times a day, while the desk narrates at 04:00 and
// `--new-only` in between: cycle N's newcomers were narrated after cycle N's
// build and gone by cycle N+1's. Measured on the live payload: 12 of 76
// `analysis.json` paragraphs keyed to markets no longer shipped, the Strait of
// Hormuz market narrated but absent — so the app's strait-odds join matched
// nothing — and a market that entered with no `standing` dropped by the app.
// `orderCandidates` keeps yesterday's markets while they remain eligible and
// fills vacancies by volume; see it for the tiers and the cap. `pickOutcome`
// keeps the same outcome standing for an event, which is where the stickiness
// has to start: an incumbent is a market, and the pick is made per event.

import { randomUUID } from 'node:crypto'
import { runWithConcurrency } from '../concurrency.js'
import { CC_TO_TOPOJSON_NAME } from '../../../shared/countries/iso.ts'
import { claudeArgs, claudeFailure, parseClaudeText, spawnClaude } from '../claude-envelope.js'
import { sha1Hex } from '../hash.js'
import { ZUHD_UA } from '../http.js'
import { modelFor } from '../models.js'

const GAMMA_BASE = 'https://gamma-api.polymarket.com'
const CLOB_BASE = 'https://clob.polymarket.com'

const TOP_N = 20

/**
 * How many of the `TOP_N` slots incumbents may hold. Below `TOP_N`, so a
 * full deck of still-eligible markets can never freeze out a newcomer: the
 * lowest-volume incumbents beyond the cap are ranked last and fall to the
 * cut. The live deck runs 15/20 after the decided/expiry filters, so this
 * rarely bites; it is the guarantee, not the common path.
 */
const INCUMBENT_CAP = TOP_N - 3

/**
 * Subjects the shipping and outlook columns join on. `straitOdds` in the app
 * matches a strait's name inside the question and prints the market's odds
 * on the strait's card, and the writer's indicator attach reads the same
 * rows — so a market about a waterway or the oil price is worth a slot ahead
 * of a plain-volume newcomer. Never ahead of an incumbent: pinning is for
 * getting in, not for staying. Waterway and oil terms only; a `fed` term
 * would put every Fed variant ahead of every other newcomer.
 */
export const PIN_TITLE_RE =
  /\b(strait|hormuz|bab el-mandeb|suez|panama canal|opec|brent|crude oil)\b/i

/**
 * Order the eligible markets for the `TOP_N` cut. Pure, so it has a test.
 *
 * Three tiers — incumbents still present and still eligible, then pinned
 * subjects, then the rest — each by 24h volume, ties in input order. Incumbents
 * beyond `incumbentCap` drop to the very end. The caller slices to `TOP_N`, so
 * a demoted incumbent still fills a slot nothing newer wanted.
 *
 * Zero extra API calls: incumbency is decided from the previous snapshot the
 * orchestrator already has and the top-60 response this cycle already made.
 * An incumbent that has fallen out of the top 60 is simply gone — the log line
 * in `fetchPolymarketTop` says how many, which is the number to watch.
 *
 * @param {Array<{ slug?: string, question?: string, title?: string, volume24hr?: unknown }>} candidates
 * @param {Set<string>} incumbentSlugs
 * @param {RegExp} [pinRe]
 * @param {number} [incumbentCap]
 */
export function orderCandidates(
  candidates,
  incumbentSlugs,
  pinRe = PIN_TITLE_RE,
  incumbentCap = INCUMBENT_CAP,
) {
  const tier = (m) =>
    incumbentSlugs.has(m.slug) ? 0 : pinRe.test(m.question || m.title || '') ? 1 : 2
  const ranked = candidates
    .map((m, i) => ({ m, t: tier(m), v: Number(m.volume24hr) || 0, i }))
    .sort((a, b) => a.t - b.t || b.v - a.v || a.i - b.i)
  const head = []
  const overflow = []
  let kept = 0
  for (const x of ranked) {
    if (x.t === 0 && kept >= incumbentCap) overflow.push(x)
    else {
      if (x.t === 0) kept++
      head.push(x)
    }
  }
  return [...head, ...overflow].map((x) => x.m)
}

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
 * The one outcome that stands for an event, or null when none is live. Pure,
 * so it has a test.
 *
 * An event is a question and its markets are that question's outcomes:
 * "Presidential Election Winner 2028" carries several hundred of them, one
 * per candidate. Flattening them all produced 627 markets from 12 events, and
 * the `slice(TOP_N)` in `fetchPolymarketTop` then cut *inside* the first two
 * events, so widening the filter made the output smaller rather than larger.
 * One per event, chosen before the history calls, costs no call per outcome.
 *
 * **The outcome the deck already carries, while it is live.** The pick was
 * the highest 24h volume alone, made before `orderCandidates` could see who
 * the incumbents were, so the selection was sticky by event and re-rolled
 * inside each one. Of the 292 times an event was in the day's last snapshot
 * on two consecutive days (2026-09-09 to 10-09), 116 changed outcome, and 114
 * of the outcomes replaced were still undecided and inside their date:
 * Brazil's election alternated between Lula and Flávio Bolsonaro almost
 * daily. Each change is a new id, label and line, and the paragraph written
 * for the old one orphaned, which is what the sticky selection exists to
 * stop. 124 ids for 82 events in that month, and 121 of the dispatch's 140
 * contract paragraphs keyed to markets the payload no longer shipped.
 *
 * Otherwise the highest 24h volume. `lastTradePrice` comes free on this
 * payload, so skipping a 2% long-shot to reach the outcome people are
 * actually trading costs nothing, and volume alone would hand a 500-candidate
 * election its noisiest row.
 *
 * **Live is three tests, and `active` and `closed` are not the one for
 * expiry: the API says so.** A market whose deadline has passed keeps
 * `active: true, closed: false` until UMA resolves it, which can take months.
 * Probed live: *"Will Adanech Abiebie be the next Prime Minister of
 * Ethiopia?"* carried `endDate: 2026-06-01`, two months gone, alongside both
 * flags saying it was live, and on the rail *"US x Iran Effective Ceasefire by
 * July 31"* sat at 62% four days after July 31. A probability on a question
 * whose date has passed is not a forecast; it is the last price before
 * everyone stopped caring. The source's own `endDate` is the test, the
 * event's where the market omits one (a nested market does not always carry
 * it), and a market with neither is kept: an open-ended market is a real
 * thing, and dropping one for a missing field would be reading absence as
 * expiry.
 *
 * All three are asked of every outcome here, where they were asked of the
 * pick alone: an event whose most-traded outcome had closed or run past its
 * date was dropped whole, and now falls to its next live one. It is also what
 * lets an incumbent be preferred: one that has expired is not held over a
 * live sibling.
 *
 * @param {{ markets?: any[], endDate?: string | null }} ev
 * @param {Set<string>} [incumbentSlugs] the previous snapshot's market slugs
 * @param {number} [now]
 * @returns {any | null}
 */
export function pickOutcome(ev, incumbentSlugs = new Set(), now = Date.now()) {
  const live = (ev.markets || [])
    .filter((m) => {
      const ltp = Number(m.lastTradePrice)
      return !Number.isFinite(ltp) || (ltp > 0.03 && ltp < 0.97)
    })
    .filter((m) => m.active && !m.closed)
    .filter((m) => {
      const end = Date.parse((m.endDate || ev.endDate) ?? m.endDateIso ?? '')
      return !Number.isFinite(end) || end >= now
    })
    .sort((a, b) => (Number(b.volume24hr) || 0) - (Number(a.volume24hr) || 0))
  return live.find((m) => incumbentSlugs.has(m.slug)) ?? live[0] ?? null
}

/**
 * The response's events as the markets that stand for them: tag-filtered, one
 * outcome each (`pickOutcome`). Pure, so it has a test.
 *
 * Each market is handed back with its parent event stitched into `events[0]`,
 * because that is where the rest of this file already looks for the event slug
 * it dedupes and builds the card URL from.
 *
 * `seen` is every market slug the response held, chosen or not. An incumbent
 * missing from it has left the top of the volume table; one that is in it and
 * not in `markets` was decided, closed, dated out or tagged away, and the log
 * line in `fetchPolymarketTop` tells the two apart.
 *
 * @param {any[]} events
 * @param {Set<string>} [incumbentSlugs]
 * @param {number} [now]
 * @returns {{ markets: any[], seen: Set<string>, droppedByTag: number, droppedNoneLive: number }}
 */
export function marketsFromEvents(events, incumbentSlugs = new Set(), now = Date.now()) {
  let droppedByTag = 0
  let droppedNoneLive = 0
  const markets = []
  /** @type {Set<string>} */
  const seen = new Set()
  for (const ev of events) {
    for (const m of ev.markets || []) if (m?.slug) seen.add(m.slug)

    const tags = (ev.tags || []).map((t) => String(t.slug || t.label || '').toLowerCase())
    if (tags.some((t) => DROP_TAGS.has(t))) {
      droppedByTag++
      continue
    }

    const pick = pickOutcome(ev, incumbentSlugs, now)
    if (!pick) {
      droppedNoneLive++
      continue
    }
    markets.push({
      ...pick,
      // The event's own date where the market omits one, as `pickOutcome` read it.
      endDate: pick.endDate || ev.endDate,
      events: [{ slug: ev.slug, title: ev.title }],
      _eventTags: ev.tags || [],
    })
  }
  return { markets, seen, droppedByTag, droppedNoneLive }
}

/**
 * Top events by 24h volume, as `marketsFromEvents` reads them.
 *
 * Gamma sorts on `order=volume24hr` (camelCase). The public docs spell it
 * `volume_24hr` and that form returns essentially-random results — confirmed
 * against the live API 2026-04. We over-fetch to leave headroom after the tag
 * and decided pruning.
 *
 * @param {number} limit
 * @param {Set<string>} incumbentSlugs
 */
async function fetchTopMarkets(limit, incumbentSlugs) {
  const url = new URL(`${GAMMA_BASE}/events`)
  url.searchParams.set('order', 'volume24hr')
  url.searchParams.set('ascending', 'false')
  url.searchParams.set('limit', String(limit * 3))
  url.searchParams.set('active', 'true')
  url.searchParams.set('closed', 'false')

  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: { 'User-Agent': ZUHD_UA },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const events = Array.isArray(data) ? data : data.data || data.events || []

  const { markets, seen, droppedByTag, droppedNoneLive } = marketsFromEvents(events, incumbentSlugs)
  console.log(
    `  · polymarket: ${events.length} events — ${droppedByTag} dropped by tag, ` +
      `${droppedNoneLive} with no live outcome, ${markets.length} questions kept`,
  )
  return { markets, seen }
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
    headers: { 'User-Agent': ZUHD_UA },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return Array.isArray(data?.history) ? data.history : []
}

function sanitizeSlug(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)
}

/**
 * The id each row of the deck ships under. Pure, so it has a test.
 *
 * `poly-` and the market's slug cut to 48 characters, which is every id on
 * disk. The cut is also where two markets become one. The Fed's "no change"
 * question has a slug per meeting and the month falls after the cut, so the
 * October and December meetings both shipped as
 * `poly-will-there-be-no-change-in-fed-interest-rates-af` in 9 of 41 cycles
 * (2026-10-01 to 10-09), at 83% and 21% on 10-02. Everything downstream keys
 * on the id: one dispatch paragraph for both, one `/api/entity/{id}.json`
 * written twice, and an article's `chart:` free to draw the other meeting.
 *
 * An incumbent keeps the id its row had in the previous snapshot, so no id
 * that is live changes and no paragraph is orphaned. A newcomer takes the cut
 * slug unless a row of this deck holds it, and then a 41-character head and
 * six hex characters of its whole slug's sha1: the same length, and its own
 * from the next cycle on, when it is an incumbent. The incumbents' ids are
 * set aside first, so a newcomer ranked above one cannot take its id. Two
 * incumbents on one id (a snapshot written before this) part the same way,
 * the first in deck order keeping it.
 *
 * @param {{ slug: string, incumbentId?: string | null }[]} deck in deck order
 * @returns {string[]} one id a row, in that order
 */
export function deckIds(deck) {
  const held = (d) => (typeof d.incumbentId === 'string' && d.incumbentId.startsWith('poly-') ? d.incumbentId : null)
  /** @type {Map<string, number>} id → the first row that held it */
  const holder = new Map()
  deck.forEach((d, i) => {
    const id = held(d)
    if (id && !holder.has(id)) holder.set(id, i)
  })
  const taken = new Set(holder.keys())
  return deck.map((d, i) => {
    const kept = held(d)
    if (kept && holder.get(kept) === i) return kept
    const slug = sanitizeSlug(d.slug)
    let id = `poly-${slug}`
    if (taken.has(id)) id = `poly-${slug.slice(0, 41).replace(/-$/, '')}-${sha1Hex(d.slug, 6)}`
    taken.add(id)
    return id
  })
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
export function isUsableShortTitle(raw, short) {
  if (typeof short !== 'string' || short.trim().length === 0) return false
  const s = short.trim()
  // A headline does not start in lower case. This alone catches the class;
  // the copy test below catches the rest of it.
  if (/^[a-z]/.test(s)) return false
  // The failure is the model *copying* the question with "Will" cut off, which
  // leaves the bare infinitive: "Alexandria Ocasio-Cortez win the 2028 US…".
  // So reject when the answer opens with the question's own first three words
  // after "Will". The first version of this rule rejected every answer that
  // did not start with "Will" — including the prompt's own examples ("Kevin
  // Warsh confirmed as Fed Chair?", "Sánchez Palomino wins Peru 2026?") — so
  // nearly every "Will <name> win …" market fell back to the regex and shipped
  // cut mid-phrase ("Will Gavin Newsom win the 2028 Democratic…").
  // Four words, not three: three is the whole of "Marine Le Pen", so a correct
  // "Marine Le Pen wins 2027 French election?" matched and was rejected, and the
  // market shipped the regex cut on every cycle it stayed in the deck. The
  // fourth word is the verb, which is the part a copy leaves bare.
  const words = (t) => t.toLowerCase().replace(/[?…]/g, '').split(/\s+/).filter(Boolean)
  const after = /^Will\s+(?!the\s)(.*)$/i.exec(raw.trim())
  if (after && !/^Will\b/i.test(s)) {
    const q = words(after[1])
    const n = Math.min(4, q.length)
    if (n >= 3 && words(s).slice(0, n).join(' ') === q.slice(0, n).join(' ')) return false
  }
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

// Sonnet since 2026-09-29, though the names here still say Haiku. Measured on
// the same live deck of 12: Sonnet at low effort took 13-15s per chunk against
// Haiku's 26-47s, which is the latency tail the ceiling above keeps being
// resized for, and its labels read more naturally ("Flávio Bolsonaro wins
// Brazil 2026?" against "…wins 2026 Brazil?"). The 27% rejection rate that
// prompted the switch was mostly `isUsableShortTitle`, not the model; see there.
// An empty PM_TITLE_EFFORT drops the flag, which running this on Haiku 4.5 needs.
const TITLE_MODEL = modelFor('polymarketTitles')
const TITLE_EFFORT = process.env.PM_TITLE_EFFORT ?? 'low'

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
export async function shortenTitlesViaHaiku(titles, spawn = spawnClaude) {
  if (titles.length <= HAIKU_CHUNK) return shortenBatchViaHaiku(titles, spawn)
  const chunks = []
  for (let i = 0; i < titles.length; i += HAIKU_CHUNK) chunks.push({ at: i, titles: titles.slice(i, i + HAIKU_CHUNK) })
  // `runWithConcurrency` resolves to nothing — it is a rate limiter, not a
  // `map` — so each chunk writes into its own slot. Order is the contract
  // here: the caller zips the result against `deduped` by index.
  const out = new Array(chunks.length)
  await runWithConcurrency(chunks, HAIKU_CONCURRENCY, async (chunk) => {
    out[chunk.at / HAIKU_CHUNK] = await shortenBatchViaHaiku(chunk.titles, spawn)
  })
  return out.flat()
}

/** The one prompt: shorten each title, and say which countries it is about. */
function titlePrompt(titles) {
  const items = titles.map((t, i) => `${i + 1}. ${t}`).join('\n')
  return `You are shortening prediction-market question titles so they fit as chart headers on a mobile phone.

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
}

/**
 * The model's answer as one label and its country tags a title. Throws when
 * the answer is not the array it was asked for.
 *
 * @param {string} text the envelope's result
 * @param {string[]} titles what was asked, in order
 */
function labelsFromAnswer(text, titles) {
  // Strip possible markdown fence + locate the JSON array
  const cleaned = String(text).replace(/^```(?:json)?\s*|\s*```$/g, '').trim()
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
}

/**
 * One call for one chunk of titles, through the shared argv and child
 * (`claudeArgs`, `spawnClaude`).
 *
 * `spawnClaude` and not a synchronous call: this runs inside
 * `runWithConcurrency`, which overlaps only work that yields. It was
 * `spawnSync` once, three "concurrent" chunks ran one after another, and
 * chunking made the stage slower than the single call it replaced (two
 * chunks, 80.6s, one of them killed).
 *
 * It spelled its own argv until 2026-10-09 and had drifted from the shared
 * one twice, in the ways that cost without failing: no isolation flags (105
 * MCP tools on every call, see `ISOLATION_FLAGS`), and no
 * `--exclude-dynamic-system-prompt-sections`, so the system prompt did not
 * cache from one chunk to the next.
 *
 * @param {string[]} titles
 * @param {typeof spawnClaude} spawn
 */
async function shortenBatchViaHaiku(titles, spawn) {
  if (titles.length === 0) return []
  // Timed, because this ceiling has now been wrong twice — 40s when the deck
  // widened, then 60s once chunking landed — and both times the evidence was a
  // silent regex fallback rather than a number anyone could read. "Timeouts are
  // measured, not guessed" needs the measurement to be in the log.
  const chunkStarted = Date.now()
  const elapsed = () => Math.round((Date.now() - chunkStarted) / 1000)
  const tmpId = randomUUID().slice(0, 8)

  const res = await spawn(claudeArgs(titlePrompt(titles), { model: TITLE_MODEL, effort: TITLE_EFFORT || null }), {
    timeout: HAIKU_TIMEOUT_MS,
    maxBuffer: 256 * 1024,
  })
  if (res.status !== 0) {
    console.error(
      `  ✗ polymarket-haiku ${tmpId}: ${claudeFailure(res, HAIKU_TIMEOUT_MS)} after ${elapsed()}s ` +
        `(${titles.length} titles) — falling back to regex`,
    )
    return fallbackLabels(titles)
  }
  console.error(`  · polymarket-haiku ${tmpId}: ${titles.length} titles in ${elapsed()}s`)

  try {
    return labelsFromAnswer(parseClaudeText(res.stdout).text, titles)
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
/**
 * @param {{ incumbents?: Array<{ id?: string, seriesId?: string, label?: string, countryTags?: string[] }> }} [options]
 *        `incumbents`: the previous snapshot's Polymarket rows. `seriesId` is
 *        the market slug, which is how a row is recognised in this cycle's
 *        response; `label` and `countryTags` are reused so an incumbent never
 *        pays the Haiku call twice, and `id` so that what was narrated under it
 *        stays joined (`deckIds`).
 */
export async function fetchPolymarketTop({ incumbents = [] } = {}) {
  // Before the fetch: which outcome stands for an event depends on who the
  // incumbents are (`pickOutcome`).
  const incumbentBySlug = new Map(
    incumbents.filter((i) => typeof i?.seriesId === 'string' && i.seriesId).map((i) => [i.seriesId, i]),
  )
  const incumbentSlugs = new Set(incumbentBySlug.keys())

  let markets
  let seen
  try {
    ;({ markets, seen } = await fetchTopMarkets(TOP_N, incumbentSlugs))
  } catch (err) {
    console.error(`  ✗ polymarket markets: ${err.message}`)
    return null
  }

  // Whether an outcome is live (undecided, open, inside its date) and the
  // subject filter on the event's tags are both settled in `marketsFromEvents`.
  // What is left here is the second net: a market whose event was tagged
  // loosely. The keyword allow-list this replaced is gone rather than kept as a
  // fallback — it was dropping the Strait of Hormuz for not being on it, and
  // a list that silently decides what the app may cover is worse than no
  // list once something better exists.
  const eligible = markets.filter((m) => !DROP_TITLE_RE.test(m.question || m.title || ''))

  // Incumbents first, then pinned subjects, then volume — see `orderCandidates`.
  const filtered = orderCandidates(eligible, incumbentSlugs).slice(0, TOP_N)

  {
    const isIncumbent = (m) => incumbentSlugs.has(m.slug)
    const keptIncumbents = filtered.filter(isIncumbent).length
    const pinned = filtered.filter(
      (m) => !isIncumbent(m) && PIN_TITLE_RE.test(m.question || m.title || ''),
    ).length
    // Against every outcome the response held, not the ones chosen: an
    // incumbent that lost its event's pick was counted as gone from the top.
    const goneAbsent = [...incumbentSlugs].filter((s) => !seen.has(s)).length
    const goneFiltered = incumbentSlugs.size - keptIncumbents - goneAbsent
    console.log(
      `  · polymarket: ${markets.length} considered, ${eligible.length} eligible, ${filtered.length} kept — ` +
        `${keptIncumbents}/${incumbentSlugs.size} incumbents kept, ${pinned} pinned, ` +
        `${filtered.length - keptIncumbents - pinned} new; ` +
        `${goneAbsent} incumbent(s) gone from the top ${TOP_N * 3}, ${goneFiltered} filtered out`,
    )
  }

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
    const eventSlug = m.events?.[0]?.slug || null
    const eventUrl = eventSlug ? `https://polymarket.com/event/${eventSlug}` : ''

    // Shortened label is filled in by a batched Haiku call after the loop so
    // we spend one Claude call on all kept markets rather than one each.
    results.push({
      // Given once the deck is settled (`deckIds`): an id depends on the rows
      // beside it.
      id: '',
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
      // The question's own deadline, so a consumer can tell a forecast from a
      // question about to close: the writer's offer skips a contract in its
      // last days (lib/indicator-offer.js). Null for an open-ended market.
      endDate: m.endDate ?? m.endDateIso ?? null,
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
      // Internal — the previous snapshot's row for this market, so its label
      // and country tags can be reused below instead of re-bought from Haiku,
      // and its id kept.
      _incumbent: incumbentBySlug.get(m.slug) ?? null,
      // Internal — what the id is cut from.
      _slug: m.slug || rawTitle,
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

  const ids = deckIds(deduped.map((r) => ({ slug: r._slug, incumbentId: r._incumbent?.id })))
  for (let i = 0; i < deduped.length; i++) deduped[i].id = ids[i]
  const parted = ids.filter((id, i) => id !== `poly-${sanitizeSlug(deduped[i]._slug)}`)
  if (parted.length > 0) {
    console.log(`  · polymarket: ${parted.length} id(s) parted from a twin alike for 48 characters: ${parted.join(', ')}`)
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
  // **Only newcomers go to the model.** The call has no cache, so before
  // selection was sticky every row paid for it on every cycle — ~4 chunks of
  // 22-33s each. An incumbent keeps the label and country tags it was given
  // when it entered; a steady cycle now runs zero chunks.
  // An incumbent whose label is a regex truncation ("…") is relabelled rather
  // than kept: the sticky label made one failed shortening permanent for as
  // long as the market stayed in the deck.
  const truncated = (r) => typeof r._incumbent?.label === 'string' && r._incumbent.label.endsWith('…')
  const held = deduped.filter((r) => r._incumbent && !truncated(r))
  const fresh = deduped.filter((r) => !r._incumbent || truncated(r))
  for (const r of held) {
    if (typeof r._incumbent.label === 'string' && r._incumbent.label) r.label = r._incumbent.label
    r.countryTags = [
      ...new Set([...(r.countryTags || []), ...(r._incumbent.countryTags || [])]),
    ]
  }
  if (held.length > 0) {
    console.log(`  · polymarket: ${held.length} label(s) reused from the previous snapshot`)
  }
  if (fresh.length > 0) {
    const enriched = await shortenTitlesViaHaiku(fresh.map((r) => r.rawTitle))
    let tagged = 0
    let rejected = 0
    for (let i = 0; i < fresh.length; i++) {
      // A title already inside the header budget keeps its own words: the model
      // is here for the countries, and re-writing a label that did not need it
      // is a change nobody asked for and nobody can review.
      if (fresh[i].rawTitle.length > 42) {
        const proposed = enriched[i].label
        if (isUsableShortTitle(fresh[i].rawTitle, proposed)) {
          fresh[i].label = proposed
        } else {
          rejected++
          console.log(`  · polymarket: rejected short title ${JSON.stringify(proposed)} for ${JSON.stringify(fresh[i].rawTitle)}`)
          fresh[i].label = shortenTitleRegex(fresh[i].rawTitle)
        }
      }
      // Union, not replacement. The tags are the floor and the model is the
      // bonus: tag slugs cannot tell that a market on the FOMC is about the US,
      // and the model cannot be relied on to answer inside its timeout.
      fresh[i].countryTags = [
        ...new Set([...(fresh[i].countryTags || []), ...enriched[i].countryTags]),
      ]
      if (fresh[i].countryTags.length) tagged++
    }
    console.log(`  · polymarket: ${tagged}/${fresh.length} new questions tagged with a country`)
    if (rejected > 0) {
      console.log(`  · polymarket: ${rejected} shortened title(s) rejected, kept the regex form`)
    }
  }
  for (const r of deduped) {
    delete r.rawTitle
    delete r._eventTags
    delete r._incumbent
    delete r._slug
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
