// What the NewsAPI fetcher decides, apart from the fetching.
//
// `scripts/fetch-news-api.js` runs on import and spends tokens when it does,
// so nothing in it could be tried without a cycle. What is here is a function
// of an answer the API gave.

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
