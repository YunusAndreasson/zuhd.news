// How specific an article is: the dashboard's specificity panel.
//
// Numbers and names against hedging, and how far the first sentence repeats
// the title. A count per article and a mean over the newest of them
// (`scoreDir`); the dashboard keeps one mean a day.

import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { stripDateline, tryReadArticle, visibleText } from './article.js'

// Hedges & filler explicitly called out in the prompt's antipatterns block
const HEDGE_PATTERNS = [
  /\bmay\b/i, /\bcould\b/i, /\bpotentially\b/i, /\bis poised to\b/i,
  /\bcould reshape\b/i, /\bmay signal\b/i, /\braises questions about\b/i,
  /\bin a significant development\b/i, /\bit remains to be seen\b/i,
  /\bsituation remains fluid\b/i, /\bat press time\b/i,
  /\bgrowing risk\b/i, /\bmust now\b/i,
]

// Sentence-start word stop list — these are capitalized but not proper nouns
const STOPSTART = new Set([
  'The', 'A', 'An', 'But', 'And', 'Or', 'If', 'When', 'Where', 'While',
  'After', 'Before', 'During', 'In', 'On', 'At', 'For', 'With', 'By',
  'From', 'To', 'Of', 'As', 'It', 'This', 'That', 'These', 'Those',
  'Here', 'There', 'Now', 'Then', 'Today', 'Yesterday', 'Tomorrow',
  'He', 'She', 'They', 'We', 'I', 'You',
])

/** @param {string} s */
const tokenize = (s) => s.toLowerCase().match(/[a-z0-9']+/g) || []

/** @param {string[]} a @param {string[]} b */
function jaccard(a, b) {
  const A = new Set(a)
  const B = new Set(b)
  const inter = [...A].filter((x) => B.has(x)).length
  const uni = new Set([...A, ...B]).size
  return uni === 0 ? 0 : inter / uni
}

/**
 * One article's counts, over its prose as the reader sees it and without its
 * dateline.
 *
 * @param {Pick<import('./article.js').Article, 'slug' | 'meta' | 'body'>} article
 */
export function score({ slug, meta, body }) {
  const title = String(meta.title ?? '')
  const visible = visibleText(stripDateline(body, meta.location))
  const sentences = visible.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0)

  // Specificity: digits/numbers + proper-noun-like tokens
  const digits = (visible.match(/\d+/g) || []).length
  // Proper noun heuristic: capitalized word not at sentence start
  let properNouns = 0
  for (const sentence of sentences) {
    const tokens = sentence.match(/[A-Za-z][A-Za-z'-]+/g) || []
    properNouns += tokens.slice(1).filter((t) => /^[A-Z]/.test(t) && !STOPSTART.has(t)).length
  }

  let hedges = 0
  for (const pattern of HEDGE_PATTERNS) hedges += (visible.match(new RegExp(pattern.source, 'gi')) || []).length

  return {
    file: slug,
    title,
    sentences: sentences.length,
    digits,
    properNouns,
    specificity: digits + properNouns,
    hedges,
    // Title-echo: Jaccard of title vs sentence 1
    titleEcho: jaccard(tokenize(title), tokenize(sentences[0] || '')),
  }
}

/**
 * The newest `limit` articles in `dir`, scored, and their mean. A file that
 * does not parse is the validator's business and is left out.
 *
 * @param {string} dir
 * @param {number} [limit]
 */
export function scoreDir(dir, limit) {
  let files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort()
  if (limit) files = files.slice(-limit)
  const rows = []
  for (const f of files) {
    const { article } = tryReadArticle(join(dir, f))
    if (article) rows.push(score(article))
  }
  if (rows.length === 0) return { rows: [], mean: null }
  /** @param {'specificity' | 'digits' | 'properNouns' | 'hedges' | 'titleEcho' | 'sentences'} k */
  const meanOf = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length
  const mean = {
    specificity: meanOf('specificity'),
    digits: meanOf('digits'),
    properNouns: meanOf('properNouns'),
    hedges: meanOf('hedges'),
    titleEcho: meanOf('titleEcho'),
    sentences: meanOf('sentences'),
    articleCount: rows.length,
  }
  return { rows, mean }
}
