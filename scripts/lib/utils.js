// Shared utilities for the news pipeline

const SLUG_MAX = 60

// Letters NFKD leaves whole, because the stroke is part of the letter and not
// a mark on it: Støre, Wałęsa, Kılıçdaroğlu, Straße.
/** @type {Record<string, string>} */
const STROKED = { ø: 'o', ł: 'l', ı: 'i', đ: 'd', ð: 'd', þ: 'th', ß: 'ss', æ: 'ae', œ: 'oe' }

/**
 * A headline in the letters a slug can hold: lower case, each letter without
 * its marks.
 *
 * @param {string} text
 */
const plainLetters = (text) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[øłıđðþßæœ]/g, (c) => STROKED[c])

/**
 * The slug a feed story is offered under: its date, and its headline's words
 * up to sixty characters.
 *
 * Since 2026-10-05 the selector keeps this slug and it is the article's
 * address (about four in five of a day's articles: 43/62, 51/59, 49/59,
 * 44/53), so what was a working name is now what a reader sees.
 *
 * - The headline is cut at a word. It was cut at the sixtieth character, and
 *   the site has `…-uk-military-base-after-breac` and `…-given-40-ye`.
 * - A letter keeps its place without its mark. Every character outside a-z
 *   and 0-9 became a hyphen, so an accent split the word it was in:
 *   `medell-n-went-green-…`, `…-nicol-s-maduro-…`.
 *
 * Only a new story gets a slug from here; the ones published keep theirs.
 *
 * @param {string} title
 * @param {string | number | Date} date
 */
export function slugify(title, date) {
  const d = new Date(date)
  const prefix = Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10)
  const words = plainLetters(title).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (words.length <= SLUG_MAX) return `${prefix}-${words}`
  // The last hyphen at or before the limit; a single word longer than the
  // limit has none, and is cut where the limit falls.
  const cut = words.lastIndexOf('-', SLUG_MAX)
  return `${prefix}-${cut > 0 ? words.slice(0, cut) : words.slice(0, SLUG_MAX)}`
}

/** @param {string} title */
export function fingerprint(title) {
  return title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40)
}

/**
 * @param {{ uri?: string, label?: string }[] | unknown} categories
 * @param {string} [title]
 * @param {string} [description]
 */
export function zuhdCategory(categories, title = '', description = '') {
  // Accept either API category array or RSS text
  if (Array.isArray(categories)) {
    for (const cat of categories) {
      const uri = (cat.uri || cat.label || '').toLowerCase()
      if (uri.includes('politic') || uri.includes('society') || uri.includes('conflict') || uri.includes('government')) return 'politics'
      if (uri.includes('business') || uri.includes('econom') || uri.includes('financ') || uri.includes('market')) return 'economy'
      if (uri.includes('science') || uri.includes('health') || uri.includes('environment') || uri.includes('medicine')) return 'science'
      if (uri.includes('technolog') || uri.includes('computer') || uri.includes('internet') || uri.includes('software')) return 'tech'
    }
  }

  const text = (`${title} ${description}`).toLowerCase()
  if (/\b(study|research|climate|vaccine|species|quantum|genome|crispr)\b/.test(text)) return 'science'
  if (/\b(ai|startup|software|hack|data breach|algorithm|llm|chatbot)\b/.test(text)) return 'tech'
  if (/\b(gdp|inflation|market|trade|tariff|oil price|currency|imf|crypto|bitcoin|fintech)\b/.test(text)) return 'economy'
  return 'politics'
}
