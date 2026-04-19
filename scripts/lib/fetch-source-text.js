// HTML → plain-text extractor for source URLs. Prefers @mozilla/readability
// (Firefox Reader View engine) with a regex-based fallback for when it
// can't parse the DOM. Fetches with a realistic User-Agent (default Node
// fetch UA gets 403'd on most news sites), caps at MAX_TEXT chars.
//
// Paywalls are not defeated — they just return shorter text (the paywall
// message). Callers should treat any return of <MIN_USEFUL chars as "no
// useful content extracted" and fall back gracefully.
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import { shouldSkip, recordResult } from './block-cache.js'

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'
const TIMEOUT_MS = 8000
const MAX_TEXT = 3500 // enough for Haiku to judge the angle; more is diminishing returns

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

/**
 * Fetch one source URL and extract its main text. Returns null on any
 * failure (timeout, network, non-HTML response, tiny extracted text).
 *
 * @param {string} url
 * @returns {Promise<string | null>}
 */
export async function fetchSourceText(url) {
  if (!url || typeof url !== 'string') return null
  if (shouldSkip(url)) return null
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
    })
    if (!res.ok) { recordResult(url, false); return null }
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('html')) return null
    const html = await res.text()
    let text = ''
    try {
      const dom = new JSDOM(html, { url })
      const article = new Readability(dom.window.document).parse()
      if (article?.textContent) text = article.textContent.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT)
    } catch { /* fall through to regex extractor */ }
    if (text.length < 500) text = stripHtml(html)
    // Paywall pages often dribble out a few hundred chars of teaser prose
    // before the block. 500+ chars indicates we got at least some real
    // content; below that we'd be sending Haiku a prompt about "subscribe
    // to read the rest" which adds nothing.
    if (text.length < 500) { recordResult(url, false); return null }
    recordResult(url, true)
    return text
  } catch {
    recordResult(url, false)
    return null
  }
}
