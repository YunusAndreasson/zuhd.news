#!/usr/bin/env node
// Wikipedia REST API helper for context brief generation
// Fetches page summaries from https://en.wikipedia.org/api/rest_v1/page/summary/{title}

const DELAY_MS = 100
const TIMEOUT_MS = 5000
const USER_AGENT = 'zuhd.news/1.0 (context-briefs; no-auth)'

/** Extract Wikipedia page title from a concept URI like "http://en.wikipedia.org/wiki/Iran" */
export function uriToTitle(uri) {
  const match = uri.match(/\/wiki\/(.+)$/)
  return match ? decodeURIComponent(match[1]) : null
}

/** Fetch a single Wikipedia page summary. Returns { title, extract, description } or null on 404/error. */
export async function fetchSummary(title) {
  const encoded = encodeURIComponent(title.replace(/ /g, '_'))
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (res.status === 404) return null
    const json = await res.json()
    return {
      title: json.title || title,
      extract: json.extract || '',
      description: json.description || ''
    }
  } catch { return null }
}

/** Fetch summaries for multiple titles sequentially with delay. Returns array (nulls filtered out). */
export async function fetchSummaries(titles) {
  const results = []
  for (let i = 0; i < titles.length; i++) {
    const summary = await fetchSummary(titles[i])
    if (summary) results.push(summary)
    if (i < titles.length - 1) await new Promise(r => setTimeout(r, DELAY_MS))
  }
  return results
}

/** Convert concept URIs to titles and fetch all summaries. */
export async function fetchFromUris(uris) {
  const titles = uris.map(uriToTitle).filter(Boolean)
  return fetchSummaries(titles)
}
