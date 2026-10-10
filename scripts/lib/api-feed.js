// What the NewsAPI fetcher decides, apart from the fetching.
//
// `scripts/fetch-news-api.js` runs on import and spends tokens when it does,
// so nothing in it could be tried without a cycle. What is here is a function
// of an answer the API gave.

import { slugify, zuhdCategory } from './utils.js'

/** @param {unknown} v */
const isObject = (v) => Boolean(v) && typeof v === 'object'

// Event Registry names a country in English; the feed carries its code.
/** @type {Record<string, string>} */
const COUNTRY_LOOKUP = {
  'Iran': 'IR', 'China': 'CN', 'Russia': 'RU', 'United States': 'US',
  'United Kingdom': 'GB', 'India': 'IN', 'Pakistan': 'PK', 'Turkey': 'TR',
  'France': 'FR', 'Germany': 'DE', 'Japan': 'JP', 'South Korea': 'KR',
  'Brazil': 'BR', 'Nigeria': 'NG', 'Kenya': 'KE', 'Sudan': 'SD',
  'Egypt': 'EG', 'South Africa': 'ZA', 'Australia': 'AU', 'Canada': 'CA',
  'Indonesia': 'ID', 'Malaysia': 'MY', 'Kazakhstan': 'KZ', 'Israel': 'IL',
  'Qatar': 'QA', 'Saudi Arabia': 'SA', 'United Arab Emirates': 'AE',
  'Mexico': 'MX', 'Argentina': 'AR', 'Colombia': 'CO', 'Italy': 'IT',
  'Spain': 'ES', 'Netherlands': 'NL', 'Sweden': 'SE', 'Norway': 'NO',
  'Denmark': 'DK', 'Finland': 'FI', 'Poland': 'PL', 'Ukraine': 'UA',
  'Romania': 'RO', 'Greece': 'GR', 'Ireland': 'IE', 'Bangladesh': 'BD',
  'Sri Lanka': 'LK', 'Vietnam': 'VN', 'Thailand': 'TH', 'Philippines': 'PH',
  'Singapore': 'SG', 'Myanmar': 'MM', 'Afghanistan': 'AF', 'Iraq': 'IQ',
  'Syria': 'SY', 'Lebanon': 'LB', 'Jordan': 'JO', 'Palestine': 'PS',
  'New Zealand': 'NZ', 'Belgium': 'BE', 'Switzerland': 'CH', 'Austria': 'AT',
  'Portugal': 'PT', 'Czech Republic': 'CZ', 'Hungary': 'HU', 'Bulgaria': 'BG',
  'Serbia': 'RS', 'Croatia': 'HR', 'Hong Kong': 'HK', 'Taiwan': 'TW',
  'Ethiopia': 'ET', 'Ghana': 'GH', 'Tanzania': 'TZ', 'Uganda': 'UG',
  'Algeria': 'DZ', 'Morocco': 'MA', 'Tunisia': 'TN', 'Senegal': 'SN',
  'Georgia': 'GE', 'Armenia': 'AM', 'Azerbaijan': 'AZ', 'Uzbekistan': 'UZ',
  'Belarus': 'BY', 'Cuba': 'CU', 'Peru': 'PE', 'Chile': 'CL', 'Venezuela': 'VE',
}

/**
 * The country code of a location as Event Registry gives one: the location
 * itself when it is a country, else the country it is in. Null for a country
 * the table does not hold, and for no location.
 *
 * The fetcher had this twice, once taking the location (`getCountryFromLoc`)
 * and once taking a source and reading its location (`getCountryCode`).
 *
 * @param {{ type?: string, label?: { eng?: string }, country?: { label?: { eng?: string } } } | null | undefined} location
 * @returns {string | null}
 */
export function countryOf(location) {
  if (!location) return null
  const name = location.type === 'country' ? location.label?.eng : location.country?.label?.eng
  return typeof name === 'string' && Object.hasOwn(COUNTRY_LOOKUP, name) ? COUNTRY_LOOKUP[name] : null
}

/**
 * What an answer holds where something else was expected, for the log: its
 * keys, and its `error` when it carries one (Event Registry answers some
 * failures with a 200 and `{ error }`).
 *
 * @param {unknown} data
 */
export function answerHolds(data) {
  if (!isObject(data)) return `a ${data === null ? 'null' : typeof data}`
  const answer = /** @type {Record<string, unknown>} */ (data)
  const keys = Object.keys(answer)
  const error = typeof answer.error === 'string' ? ` (error: ${JSON.stringify(answer.error.slice(0, 200))})` : ''
  return `${keys.length > 0 ? keys.slice(0, 8).join(', ') : 'no keys'}${error}`
}

/**
 * The list an answer carries at `path`, and what it held when it carries none.
 *
 * An answer with no list read as an answer with an empty one: `data.events?.results
 * || []` was "0 events", and the cycle went on RSS-only with nothing in the
 * log to say the API had answered something else (cycle.md: an empty result
 * after a non-empty response must log what it saw). A list that is there and
 * empty is a quiet query, and has no `saw`.
 *
 * @param {unknown} data the parsed answer
 * @param {string[]} path `['events', 'results']`
 * @returns {{ results: any[], saw?: string }} `results` holds only objects
 */
export function resultsAt(data, path) {
  let node = data
  for (const [i, key] of path.entries()) {
    const next = isObject(node) ? /** @type {Record<string, unknown>} */ (node)[key] : undefined
    if (next === undefined || next === null) return { results: [], saw: `no ${path.slice(0, i + 1).join('.')}; it holds ${answerHolds(node)}` }
    node = next
  }
  if (!Array.isArray(node)) return { results: [], saw: `${path.join('.')} is not a list; it is ${answerHolds(node)}` }
  return { results: node.filter(isObject) }
}

/**
 * `text` with the key taken out. An API's error can quote the request back.
 *
 * @param {string} text
 * @param {string | undefined} secret
 */
export const redact = (text, secret) => (secret ? text.replaceAll(secret, '[key]') : text)

/**
 * Whether an article can be a story of its own: it has a headline. One
 * without threw in the fetcher's `main` (`a.title.toLowerCase()`), after every
 * token was spent and before the feed was written.
 *
 * @param {{ title?: unknown } | null | undefined} article
 */
export const hasHeadline = (article) => typeof article?.title === 'string' && article.title.trim() !== ''

// ── A story, from the articles the API returned ──────────────────────

const MAX_BODY = 10000  // 1M context window allows full article text

/** An article's or an event's categories, as one of the four desks. */
export const mapCategory = (categories) => zuhdCategory(categories || [])

// NewsAPI titles every nature.com article "Nature", so ten *Scientific Reports*
// manuscripts ran in one week under the flagship's name. The article-number
// prefix in the URL names the journal.
/** @type {Record<string, string>} */
const NATURE_JOURNALS = {
  s41586: 'Nature',
  s41467: 'Nature Communications',
  s41598: 'Scientific Reports',
  s41591: 'Nature Medicine',
  s41558: 'Nature Climate Change',
  s41561: 'Nature Geoscience',
  s41559: 'Nature Ecology & Evolution',
  s41562: 'Nature Human Behaviour',
  s41560: 'Nature Energy',
  s41893: 'Nature Sustainability',
  s41587: 'Nature Biotechnology',
}
export function sourceName(a) {
  const m = /nature\.com\/articles\/(s\d{5})-/.exec(a?.url || '')
  return (m && NATURE_JOURNALS[m[1]]) || a?.source?.title || ''
}

export function extractConcepts(articles) {
  const map = new Map()
  for (const a of articles) {
    for (const c of (a.concepts || [])) {
      const label = c.label?.eng
      if (!label) continue
      if (!map.has(label) || (c.score || 0) > (map.get(label).score || 0)) {
        map.set(label, c)
      }
    }
  }
  return [...map.values()]
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 8)
    .map(c => c.uri ? { label: c.label?.eng, uri: c.uri } : c.label?.eng)
    .filter(Boolean)
}

function avg(nums) {
  return nums.length ? +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : null
}

// Article social signal: ER returns either a numeric socialScore or a per-network
// `shares` map depending on API vintage — normalize to one number, null if absent.
export function articleSocialScore(a) {
  if (a.socialScore != null) return a.socialScore
  if (a.shares && typeof a.shares === 'object') {
    const total = Object.values(a.shares).filter(n => typeof n === 'number').reduce((x, y) => x + y, 0)
    return total || null
  }
  return null
}

// Sentiment spread: max - min across sources. >0.5 = divergent framing.
function sentimentSpread(articles) {
  const sentiments = articles.map(a => a.sentiment).filter(s => s != null)
  if (sentiments.length < 2) return null
  return +(Math.max(...sentiments) - Math.min(...sentiments)).toFixed(2)
}

/**
 * One source of a feed story, from the article the API returned.
 *
 * The fetcher spelled this object four times, and the copies had parted. The
 * one for a story of a single article left `sentiment` out, so the commonest
 * kind of pick reached the article with no tone on its source. The one for an
 * event's own article named the outlet by `source.title`, past `sourceName`:
 * the rule that keeps a *Scientific Reports* paper from being called Nature
 * did not reach it.
 *
 * @param {any} a an article
 * @returns {import('./schema.js').FeedSource}
 */
export function toSource(a) {
  return {
    name: sourceName(a),
    url: a.url || '',
    country: countryOf(a.source?.location),
    body: (a.body || '').slice(0, MAX_BODY),
    importanceRank: a.source?.ranking?.importanceRank || null,
    sentiment: typeof a.sentiment === 'number' ? +a.sentiment.toFixed(2) : null,
    image: a.image || null,
  }
}

/**
 * A feed story led by an article: `primary` gives it its link, its time and
 * its outlet, and `panel` (which holds `primary`) its sources.
 *
 * Three stories are built this way and the fetcher wrote each out in full: an
 * event with the articles matched to it, a story about a charted series, and
 * an article standing alone. `extra` is where one departs from the others,
 * key by key; a key it gives takes the place the story already has for it.
 *
 * An event's story is the one with an `eventDate`, and carries that and its
 * score straight after `pubDate`, where the feed file has always had them.
 *
 * @param {any} primary
 * @param {any[]} panel
 * @param {Record<string, unknown>} [extra]
 */
export function storyFrom(primary, panel, extra = {}) {
  const { eventDate, ...over } = extra
  const title = typeof over.title === 'string' ? over.title : primary.title
  const when = primary.dateTimePub || primary.dateTime
  const story = {
    title,
    description: (primary.body || '').slice(0, 300),
    link: primary.url || '',
    pubDate: when,
    category: mapCategory(primary.categories || []),
    source: sourceName(primary),
    suggestedSlug: slugify(title, when),
    eventUri: primary.eventUri || null,
    eventCoverage: null,
    socialScore: articleSocialScore(primary),
    sources: panel.map(toSource),
    concepts: extractConcepts(panel),
    location: primary.location?.label?.eng || null,
    sentiment: avg(panel.map(a => a.sentiment).filter(s => s != null)),
    sentimentDivergence: sentimentSpread(panel),
    origin: 'api',
    ...over,
  }
  if (eventDate === undefined) return story
  const { title: headline, description, link, pubDate, ...rest } = story
  return { title: headline, description, link, pubDate, eventDate, socialScore: story.socialScore, ...rest }
}
