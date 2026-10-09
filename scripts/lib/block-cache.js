// Domain-level block cache. Skips publisher fetches for outlets that have
// repeatedly 403'd us (Cloudflare / Akamai / custom anti-bot). Persists to
// content/.block-cache.json so skip state survives across cycles.
//
// Design: skip after 5 consecutive blocks within 7 days, but ALWAYS try
// with 5% probability so we notice if the outlet un-blocks us. Writing
// off a domain forever would mean citations slowly rot without signal.
//
// "Within 7 days" is kept by `fresh`: a failure older than that counts for
// nothing and its entry is dropped. It used to be kept by nothing. The window
// only aged the skip, the count never decayed and an entry left only on a
// success, so on 2026-10-09 the file held 156 domains, 148 of them last
// failed more than a week before (the oldest 172 days), and a domain at four
// failures since April was one more from a week of being skipped.
import { pathOf } from './datasets.js'
import { readJson, writeJson } from './json-file.js'

let cachePath = pathOf('blockCache')
const BLOCK_THRESHOLD = 5
const BLOCK_TTL_MS = 7 * 24 * 3600 * 1000
const REPROBE_PROBABILITY = 0.05

let cache = null
function load() {
  if (cache) return cache
  try { cache = readJson(cachePath, {}) }
  catch { cache = {} }
  return cache
}

/** Whether an entry's last failure is inside the window. One with no readable
 *  date is not: it would otherwise never age out. */
const fresh = (entry) => Date.now() - new Date(entry?.lastBlockedAt).getTime() <= BLOCK_TTL_MS

function save() {
  if (!cache) return
  for (const [domain, entry] of Object.entries(cache)) if (!fresh(entry)) delete cache[domain]
  try { writeJson(cachePath, cache) } catch { /* best effort */ }
}

function domainOf(url) {
  try { return new URL(url).host.replace(/^www\./, '') } catch { return null }
}

/**
 * Should we skip this URL based on prior block history?
 * @param {string} url
 * @param {() => number} [rand] - injectable RNG for tests
 */
export function shouldSkip(url, rand = Math.random) {
  const domain = domainOf(url)
  if (!domain) return false
  const c = load()[domain]
  if (!c || c.consecutiveBlocks < BLOCK_THRESHOLD) return false
  if (!fresh(c)) return false // cache expired, try again
  if (rand() < REPROBE_PROBABILITY) return false // spontaneous re-probe
  return true
}

/** Record a fetch outcome; `ok` true on HTML 2xx, false on block/error. */
export function recordResult(url, ok) {
  const domain = domainOf(url)
  if (!domain) return
  const c = load()
  if (ok) {
    // Most fetches succeed for a domain with no history. There is nothing to
    // forget and nothing to write: this was a file rewritten for every page.
    if (!c[domain]) return
    delete c[domain]
  } else {
    // A count from outside the window starts again at one.
    const prev = c[domain] && fresh(c[domain]) ? c[domain] : { consecutiveBlocks: 0 }
    c[domain] = {
      consecutiveBlocks: prev.consecutiveBlocks + 1,
      lastBlockedAt: new Date().toISOString(),
    }
  }
  save()
}

/** Reset in-memory cache, and where it is saved — tests only. */
export function _resetForTest(initial = {}, path = cachePath) {
  cache = { ...initial }
  cachePath = path
}
