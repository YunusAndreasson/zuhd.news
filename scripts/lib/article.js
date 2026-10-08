// An article file, read one way.
//
// Frontmatter has one parser (`lib/frontmatter.js`) and twenty-odd callers,
// and beside them ten files that go around it with regexes of their own; the
// link strip that turns `[Iran](country:IR)` into what a reader sees exists
// thirteen times, the dateline pattern ten. Each copy is a second opinion on
// what an article is. These are the first ones, for a stage to be moved onto.

import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { splitBlocks } from './blocks.js'
import { parseFrontmatter } from './frontmatter.js'
import { CATEGORIES } from './schema.js'

/**
 * @typedef {object} Article
 * @property {string} path
 * @property {string} slug the filename without `.md`
 * @property {string} raw the file as it stands
 * @property {import('./schema.js').ArticleMeta & Record<string, any>} meta
 * @property {string} body the prose, trimmed
 */

/**
 * Read and parse one article. Throws on frontmatter that is not YAML, as
 * `parseFrontmatter` does and for its reason: a block that does not parse is
 * the failure the build must not swallow.
 *
 * @param {string} path
 * @returns {Article}
 */
export function readArticle(path) {
  const raw = readFileSync(path, 'utf8')
  const { meta, body } = parseFrontmatter(raw)
  return { path, slug: basename(path, '.md'), raw, meta, body }
}

/**
 * `readArticle` for a reader that must outlive one bad file: the article, or
 * the error. Several stages scan a window of the corpus to decide something
 * about *other* articles, and an unreadable neighbour is its own problem, not
 * theirs.
 *
 * @param {string} path
 * @returns {{ article: Article, error: null } | { article: null, error: Error }}
 */
export function tryReadArticle(path) {
  try {
    return { article: readArticle(path), error: null }
  } catch (err) {
    return { article: null, error: /** @type {Error} */ (err) }
  }
}

/**
 * Prose as the reader sees it: `[Iran](country:IR)` costs its label, nothing
 * more. Every length the pipeline measures is taken after this.
 *
 * @param {string} text
 */
export const visibleText = (text) => text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

/**
 * The dateline city a body opens with (`Geneva — The World Trade…`), or null.
 * By invariant it equals the frontmatter `location`.
 *
 * @param {string} body
 * @returns {string | null}
 */
export function datelineOf(body) {
  const m = body.match(/^([^\n—]{2,60}?) — /)
  return m ? m[1].trim() : null
}

const REQUIRED = ['title', 'date', 'category', 'location', 'sources']

/**
 * What is wrong with an article's shape, as short phrases; empty when
 * nothing is. The checks every surface depends on, gathered from where they
 * had grown: the corpus ratchets and the validator's block count.
 *
 * It reports and decides nothing. Whether a problem costs the article its
 * place in the cycle is the validator's call, which is deliberately more
 * forgiving than this list.
 *
 * @param {Record<string, any>} meta
 * @param {string} body
 * @returns {string[]}
 */
export function articleProblems(meta, body) {
  if (!meta || typeof meta !== 'object') return ['unparseable']
  const problems = []
  for (const k of REQUIRED) if (!(k in meta)) problems.push(`missing ${k}`)
  if (meta.category && !CATEGORIES.includes(meta.category)) problems.push(`invalid category ${meta.category}`)
  if (!Array.isArray(meta.sources) || meta.sources.length === 0) problems.push('no sources')
  for (const s of Array.isArray(meta.sources) ? meta.sources : []) {
    if (!s?.name) problems.push('source missing name')
    if (!s?.url || !/^https?:\/\//.test(s.url)) problems.push(`source bad url ${s?.url}`)
    if (s?.country && !/^[A-Z]{2}$/.test(String(s.country))) problems.push(`bad country code ${s.country}`)
  }
  if ('lat' in meta && (typeof meta.lat !== 'number' || meta.lat < -90 || meta.lat > 90)) problems.push(`lat=${meta.lat}`)
  if ('lng' in meta && (typeof meta.lng !== 'number' || meta.lng < -180 || meta.lng > 180)) problems.push(`lng=${meta.lng}`)
  for (const m of body.matchAll(/\[[^\]]+\]\(country:([^)]+)\)/g)) {
    if (!/^[A-Z]{2}$/.test(m[1])) problems.push(`country link ${m[1]}`)
  }
  // Four blocks, or five with an earned counterpoint; two and three are
  // readable news and six is a malformed file. The validator's own range.
  const blocks = splitBlocks(body).filter((b) => b.length > 5).length
  if (blocks < 2 || blocks > 5) problems.push(`${blocks} blocks`)
  return problems
}
