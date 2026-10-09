// HTML → plain-text extractor for source URLs. Prefers @mozilla/readability
// (Firefox Reader View engine) with a regex-based fallback for when it
// can't parse the DOM. Fetches with a realistic User-Agent (default Node
// fetch UA gets 403'd on most news sites), caps at MAX_TEXT chars.
//
// Paywalls are not defeated — they just return shorter text (the paywall
// message). Anything under MIN_USEFUL chars is "no useful content extracted":
// `fetchSourcePage` gives its text as null, and callers fall back gracefully.
//
// One fetcher and one extractor. `fetch-news.js` had a second copy of both for
// the pages Hacker News links to, and the copies had parted: 200 characters
// counted as an article there and 500 here, with THIN_BODY (400) between them,
// so a page could be "extracted" by the fetcher and thin to the prefilter.
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import { shouldSkip, recordResult } from './block-cache.js'
import { htmlLeadImage } from './feed-image.js'
import { BROWSER_UA } from './http.js'

const TIMEOUT_MS = 8000
const MAX_TEXT = 3500 // enough for Haiku to judge the angle; more is diminishing returns
// Paywall pages often dribble out a few hundred chars of teaser prose
// before the block. 500+ chars indicates we got at least some real
// content; below that we'd be sending Haiku a prompt about "subscribe
// to read the rest" which adds nothing.
const MIN_USEFUL = 500

/** Strip HTML to readable plain text. Not robust to every site's markup —
 *  just good enough to give Haiku the gist of an article's framing. */
export function stripHtml(html) {
  if (typeof html !== 'string' || html.length === 0) return ''
  let text = html

  // Drop everything that isn't prose: scripts, styles, nav chrome, ads.
  text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
  text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
  text = text.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
  text = text.replace(/<(nav|header|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  text = text.replace(/<!--[\s\S]*?-->/g, ' ')

  // Try to narrow to the article body — if the site tagged one. Prefer the
  // largest <article> block; fall back to <main>; fall back to the whole doc.
  const articleMatches = [...text.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)]
  if (articleMatches.length > 0) {
    articleMatches.sort((a, b) => b[1].length - a[1].length)
    text = articleMatches[0][1]
  } else {
    const mainMatch = text.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)
    if (mainMatch) text = mainMatch[1]
  }

  // Strip remaining tags, decode a few common entities, collapse whitespace.
  text = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/\s+/g, ' ')
    .trim()

  return text.slice(0, MAX_TEXT)
}

// The tags that end a run of prose: a paragraph, a heading, a list item, a
// line break. Every other tag (a link, an emphasis) sits inside a sentence.
const BLOCK_TAG = /<\/?(?:p|div|br|hr|li|ul|ol|dl|dt|dd|h[1-6]|blockquote|pre|table|thead|tbody|tfoot|tr|td|th|caption|figure|figcaption|section|article|aside|header|footer|nav|main|address|details|summary)\b[^>]*>/gi

/**
 * A fragment of HTML as text: an RSS item's description or `content:encoded`.
 * Entities are left for the caller, which decodes them after.
 *
 * `fetch-news.js` deleted every tag and put nothing in its place, so a feed
 * that writes `</p><p>` with no line break between them (Drop Site News,
 * Responsible Statecraft) handed the writer paragraphs run together: 48
 * sentence ends in the RSS feed of 2026-10-09 10:00, 28 of them in seven
 * stories' bodies, read like "…he finished.Another citizen, a pastor…", a
 * heading ran into its paragraph ("…Iran war's costThe Con…"), and none of the
 * API's bodies did.
 *
 * A tag that ends a block leaves a space. One inside a sentence leaves
 * nothing, because a space there would stand before every comma and full stop
 * that follows a link. Line breaks the feed wrote are kept.
 *
 * @param {string} html
 */
export function stripTags(html) {
  return html
    .replace(BLOCK_TAG, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .trim()
}

/**
 * The HTML Readability needs, and nothing JSDOM will choke on.
 *
 * JSDOM parses every `<style>` block and inline stylesheet through csstree,
 * synchronously; a page shipping megabytes of CSS stalled Stage 0 for minutes
 * (RSS fetch 279-371s on 2026-09-23/24, the log full of "Could not parse CSS
 * stylesheet"). Readability reads text, so styles and scripts are dropped and
 * the page is capped before parsing.
 * @param {string} html
 */
export function htmlForReadability(html) {
  return html
    .slice(0, 1_500_000)
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<link\b[^>]*rel=["']?stylesheet[^>]*>/gi, '')
    .replace(/\sstyle="[^"]*"/gi, '')
}

/**
 * A page's main text, capped at MAX_TEXT: what Readability makes of it, or,
 * where that is under MIN_USEFUL, what `stripHtml` does. May still be short.
 *
 * @param {string} html
 * @param {string} url the page's own address, which JSDOM resolves against
 */
export function pageText(html, url) {
  let text = ''
  try {
    const dom = new JSDOM(htmlForReadability(html), { url })
    const article = new Readability(dom.window.document).parse()
    if (article?.textContent) text = article.textContent.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT)
  } catch { /* fall through to regex extractor */ }
  if (text.length < MIN_USEFUL) text = stripHtml(html)
  return text
}

/**
 * Fetch one source page. `text` is its main text, or null when the page gave
 * less than MIN_USEFUL of it; `image` is the lead image its head names
 * (`htmlLeadImage`). Null when there was no page to read: a domain being
 * skipped, a refusal, a timeout, something that is not HTML.
 *
 * @param {string} url
 * @returns {Promise<{ text: string | null, image: string | null } | null>}
 */
export async function fetchSourcePage(url) {
  if (!url || typeof url !== 'string') return null
  if (shouldSkip(url)) return null
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
      headers: {
        'User-Agent': BROWSER_UA,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
    })
    if (!res.ok) { recordResult(url, false); return null }
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('html')) return null
    const html = await res.text()
    const text = pageText(html, url)
    const useful = text.length >= MIN_USEFUL
    recordResult(url, useful)
    return { text: useful ? text : null, image: htmlLeadImage(html) }
  } catch {
    recordResult(url, false)
    return null
  }
}

/**
 * Fetch one source URL and extract its main text. Returns null on any
 * failure (timeout, network, non-HTML response, tiny extracted text).
 *
 * @param {string} url
 * @returns {Promise<string | null>}
 */
export async function fetchSourceText(url) {
  return (await fetchSourcePage(url))?.text ?? null
}
