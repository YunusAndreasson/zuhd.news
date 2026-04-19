// Domain-level block cache. Skips publisher fetches for outlets that have
// repeatedly 403'd us (Cloudflare / Akamai / custom anti-bot). Persists to
// content/.block-cache.json so skip state survives across cycles.
//
// Design: skip after 5 consecutive blocks within 7 days, but ALWAYS try
// with 5% probability so we notice if the outlet un-blocks us. Writing
// off a domain forever would mean citations slowly rot without signal.
import { readFileSync, writeFileSync, existsSync } from 'fs'

const CACHE_PATH = 'content/.block-cache.json'
const BLOCK_THRESHOLD = 5
const BLOCK_TTL_MS = 7 * 24 * 3600 * 1000
const REPROBE_PROBABILITY = 0.05

let cache = null
function load() {
  if (cache) return cache
  try { cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, 'utf8')) : {} }
  catch { cache = {} }
  return cache
}

function save() {
  if (!cache) return
  try { writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2)) } catch { /* best effort */ }
}

function domainOf(url) {
  try { return new URL(url).host.replace(/^www\./, '') } catch { return null }
}

/**
 * Should we skip this URL based on prior block history?
 * @param {string} url
 * @param {() => number} [rand] — injectable RNG for tests
 */
export function shouldSkip(url, rand = Math.random) {
  const domain = domainOf(url)
  if (!domain) return false
  const c = load()[domain]
  if (!c || c.consecutiveBlocks < BLOCK_THRESHOLD) return false
  const age = Date.now() - new Date(c.lastBlockedAt).getTime()
  if (age > BLOCK_TTL_MS) return false // cache expired, try again
  if (rand() < REPROBE_PROBABILITY) return false // spontaneous re-probe
  return true
}

/** Record a fetch outcome; `ok` true on HTML 2xx, false on block/error. */
export function recordResult(url, ok) {
  const domain = domainOf(url)
  if (!domain) return
  const c = load()
  if (ok) {
    if (c[domain]) delete c[domain]
  } else {
    const prev = c[domain] || { consecutiveBlocks: 0 }
    c[domain] = {
      consecutiveBlocks: prev.consecutiveBlocks + 1,
      lastBlockedAt: new Date().toISOString(),
    }
  }
  save()
}

/** Reset in-memory cache — tests only. */
export function _resetForTest(initial = {}) {
  cache = { ...initial }
}
