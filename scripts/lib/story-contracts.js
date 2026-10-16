// A story's own contracts: the prediction markets that ask the question a
// story leaves open, found for that story rather than taken from the day's
// busiest twenty.
//
// The chart desk offered every story the same deck of contracts, cut by
// trading volume, and so set a contract under a story only when the deck
// happened to hold its question. Replayed over 2026-10-11..10-16 (330
// articles), adding each story's own search results to its list took the
// desk from 36 charts to 61 under the same prompt, and politics from 7 of 127
// to 22: an Alberta referendum under the premier's plea to remain, a Texas
// Senate race under Musk's money for Paxton, a charge against Ilhan Omar under
// the probe that reached her.
//
// One model call names, for each story of the batch, the open question a
// market might price as a few search words; the market's own search answers
// it; what is kept is a live question, not about to close, with money on it.
// Only the contracts the desk then sets under a story are added to the
// snapshot (`admit-story-contracts.js`). Pure; `find-story-contracts.js` is
// the reading and writing around it.

import { visibleText } from './article.js'
import { marketsFromEvents } from './trends-sources/polymarket.js'

/** The fewest dollars traded on an event for its price to be read as a
 *  forecast. The day's deck is cut from events in the millions. */
export const MIN_EVENT_VOLUME = 10_000

/** A question closing sooner than this is no forecast of what comes next
 *  (`closingSoon` holds the deck to the same). */
export const MIN_DAYS_OPEN = 3

/** The most contracts one story is offered. */
export const PER_STORY = 3

/**
 * @param {{ slug: string, title?: string, body: string }[]} articles
 */
export function queryPrompt(articles) {
  const blocks = articles
    .map((a) => `---\nslug: ${a.slug}\ntitle: ${a.title || ''}\nlead: ${visibleText(a.body).slice(0, 300).replace(/\s+/g, ' ')}`)
    .join('\n')
  return `For each news story below, name the open question it leaves that a prediction market (Polymarket) might be trading: who wins the election it is about, whether the truce or deal it reports holds or is signed, whether a named leader is removed, released or charged, whether a rate or a price crosses a line by a date. Answer with 2 to 4 search words for that question, the names first (e.g. "Imran Khan released", "Russia Ukraine ceasefire", "Brazil election"). When the story leaves no such question (a study, a disaster, a death, a court sentence already passed, a product launch), answer null.

Return ONLY a JSON object keyed by slug: {"<slug>": {"q": "<words>" | null}}.

${blocks}`
}

/**
 * The search words per slug, for the slugs asked about. Anything else in the
 * answer is dropped.
 *
 * @param {unknown} obj  the parsed answer
 * @param {string[]} slugs
 * @returns {Map<string, string>}
 */
export function parseQueries(obj, slugs) {
  /** @type {Map<string, string>} */
  const out = new Map()
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out
  for (const slug of slugs) {
    const q = /** @type {any} */ (obj)[slug]?.q
    if (typeof q === 'string' && q.trim() && q.length <= 80) out.set(slug, q.trim())
  }
  return out
}

/**
 * @typedef {object} Found
 * @property {string} slug     the market's slug
 * @property {string} question
 * @property {number} price    the price of Yes, in per cent
 * @property {string | null} endDate
 */

/**
 * The contracts a search answered with that a story may be offered: in the
 * order the search ranked them, one outcome an event (`marketsFromEvents`,
 * which also drops sport and price ladders and what is decided or closed),
 * with money on it and not about to close.
 *
 * @param {any[]} events  the search's `events`
 * @param {number} now
 * @returns {Found[]}
 */
export function contractsFromSearch(events, now) {
  const funded = (events || []).filter((ev) => ev && !ev.closed && Number(ev.volume) >= MIN_EVENT_VOLUME)
  const { markets } = marketsFromEvents(funded, new Set(), now)
  const out = []
  for (const m of markets) {
    const end = Date.parse(m.endDate ?? '')
    if (Number.isFinite(end) && end < now + MIN_DAYS_OPEN * 86_400_000) continue
    const price = Number(m.lastTradePrice)
    if (!m.slug || !Number.isFinite(price)) continue
    out.push({ slug: m.slug, question: String(m.question || m.slug), price: Math.round(price * 100), endDate: typeof m.endDate === 'string' ? m.endDate : null })
    if (out.length >= PER_STORY) break
  }
  return out
}
