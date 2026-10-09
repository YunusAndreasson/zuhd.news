#!/usr/bin/env node
// Coverage-gap signal for the selector: Wikipedia's most-read articles
// yesterday, minus anything zuhd.news covered in the last 7 days.
//
// One free Wikimedia AQS call (pageviews/top). The top-1000 list is mostly
// entertainment noise — a denylist strips the obvious junk, and the selector
// prompt frames the rest as a judgment-required signal, not a directive.
//
// Output: up to 10 lines of "Title — 1.2M views" on stdout, and nothing else
// there: the selector step pastes stdout into the prompt. No lines when the
// list could not be had (`skipped`, with what came back instead) and when the
// stage fails, which it does out loud: a non-zero exit and the error on
// stderr. It used to swallow both, so a blocked user agent or a changed
// response would have been a quiet day for as long as it lasted. The step
// reads only stdout, so each is still "no injection".

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseFrontmatter } from './lib/frontmatter.js'
import { ROOT } from './lib/paths.js'
import { runStage } from './lib/stage.js'

const USER_AGENT = 'zuhd-news/1.0 (+https://zuhd.news; editorial@zuhd.news)'
const COVERAGE_WINDOW_DAYS = 7
const MAX_LINES = 10
const TOP_CANDIDATES = 120 // how deep into the ranked list to look after junk filtering

/**
 * The whole run's deadline. The selector step gives this script 15 s
 * (`timeout 15`) and it prints once, at the end, so a run killed there prints
 * nothing. The list has 10 s and each summary 8 s, which is 18: a slow list
 * followed by one slow summary lost every line. Under this, a summary still
 * out at the deadline costs its own row.
 */
const RUN_BUDGET_MS = 12_000

// Obvious non-news patterns in top-pageview titles. Not exhaustive — the
// selector applies final editorial judgment; this just cuts the bulk.
const JUNK_PATTERNS = [
  /^Main_Page$/,
  /:/,                       // namespaces (Special:, Wikipedia:, File:…)
  /^List_of/i,
  /^Deaths_in/i,
  /\((film|TV_series|miniseries|season|album|song|singer|actor|actress|band|rapper|wrestler|footballer|video_game|game|character|franchise|series)\)$/i,
  /\b(UFC|WWE|WrestleMania|NBA|NFL|MLB|NHL|Premier_League|Champions_League|FIFA|UEFA|Grand_Prix|Wimbledon|Super_Bowl|Copa)\b/i,
  /^(YouTube|Google|Facebook|Instagram|TikTok|Netflix|Pornhub|OnlyFans|XNXX|XVideos|ChatGPT|Bible|Quran)$/i,
  /^(Cleopatra|Taylor_Swift|Elon_Musk)$/,   // perma-trending celebrities
]

function isJunk(title) {
  // Test against the spaced form too: underscores are word characters, so
  // \b-anchored patterns never match inside "2026_FIFA_World_Cup".
  const spaced = title.replace(/_/g, ' ')
  return JUNK_PATTERNS.some((p) => p.test(title) || p.test(spaced))
}

/** Words worth matching on — lowercase, ≥4 chars, not stopwords. */
const STOP = new Set(['with', 'from', 'that', 'this', 'their', 'over', 'after', 'into'])
function significantWords(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w))
}

/**
 * Collect what we covered recently: concept labels + slug word sets.
 *
 * A corpus that cannot be listed throws. Read as "nothing covered", it made
 * every title in the top list a gap, and the selector was handed the stories
 * the site had just run as the ones it had missed. One article that will not
 * parse still costs only itself.
 */
function recentCoverage(now = Date.now()) {
  const dir = join(ROOT, 'content', 'articles')
  const cutoffPrefix = new Date(now - COVERAGE_WINDOW_DAYS * 86400_000).toISOString().slice(0, 10)
  const concepts = new Set()
  const slugWordSets = []
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.md') || f.slice(0, 10) < cutoffPrefix) continue
    slugWordSets.push(new Set(significantWords(f.slice(11, -3).replace(/-/g, ' '))))
    try {
      const { meta } = parseFrontmatter(readFileSync(join(dir, f), 'utf8'))
      for (const c of meta.concepts || []) {
        const label = typeof c === 'object' ? c.label : c
        if (typeof label === 'string') concepts.add(label.toLowerCase())
      }
    } catch {}
  }
  return { concepts, slugWordSets }
}

function isCovered(title, { concepts, slugWordSets }) {
  const plain = title.replace(/_/g, ' ').toLowerCase()
  if (concepts.has(plain)) return true
  const words = significantWords(plain)
  if (words.length === 0) return true // nothing to match on — treat as covered/noise
  // Covered if any single recent slug contains a majority of the title's words.
  for (const set of slugWordSets) {
    const hits = words.filter((w) => set.has(w)).length
    if (hits >= Math.max(1, Math.ceil(words.length / 2)) && hits >= 1 && words.length <= 2) return true
    if (words.length > 2 && hits >= Math.ceil(words.length / 2)) return true
  }
  return false
}

function fmtViews(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}

// Wikipedia's short description ("Bosnian footballer", "American actress",
// "2026 film") is a precise sports/entertainment classifier the title-pattern
// denylist can't match — player and celebrity names carry no parenthetical.
const DESC_JUNK = /\b(footballer|football|soccer|fifa|uefa|world cup|olympics?|basketball|baseball|cricketer|cricket|tennis|golfer|golf|wrestler|wrestling|boxer|boxing|athlete|racing driver|sprinter|swimmer|actor|actress|singer|songwriter|rapper|musician|comedian|model|band|film|movie|television series|tv series|miniseries|video game|album|song|manga|anime|youtuber|streamer|influencer|pornographic|reality (tv|television)|sports? (team|club|league|competition|tournament|event|season)|world ranking)\b/i

/**
 * A title's short description, `''` where the page has none, or null when the
 * summary could not be had. That one is per title on purpose: a title with no
 * description to judge is left out, and the others still print.
 *
 * @param {string} title
 * @param {typeof fetch} get
 * @param {AbortSignal} deadline the run's
 */
async function fetchDescription(title, get, deadline) {
  try {
    const res = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
      signal: AbortSignal.any([deadline, AbortSignal.timeout(8000)]),
      headers: { 'User-Agent': USER_AGENT, accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.description || ''
  } catch {
    return null
  }
}

/** Why there is no list to print: said on stderr, and returned for the stage's result. */
const skip = (why) => {
  console.error(`trending-gaps: ${why}`)
  return { skipped: why }
}

/**
 * @param {object} [o] the seams a test holds it by
 * @param {typeof fetch} [o.fetch]
 * @param {ReturnType<typeof recentCoverage>} [o.coverage] what the site ran this week
 * @param {(text: string) => void} [o.write] stdout
 * @param {number} [o.now]
 */
export async function main({ fetch: get = fetch, coverage, write = (text) => process.stdout.write(text), now = Date.now() } = {}) {
  const deadline = AbortSignal.timeout(RUN_BUDGET_MS)

  // Yesterday UTC — today's top list doesn't exist until the day closes.
  const d = new Date(now - 86400_000)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${y}/${m}/${day}`

  const res = await get(url, {
    signal: AbortSignal.any([deadline, AbortSignal.timeout(10000)]),
    headers: { 'User-Agent': USER_AGENT, accept: 'application/json' },
  })
  if (!res.ok) return skip(`HTTP ${res.status} from the pageviews top list for ${y}-${m}-${day}`)
  const data = await res.json()
  const articles = data?.items?.[0]?.articles
  if (!Array.isArray(articles)) {
    // A response that is not the list is a change of shape until shown otherwise.
    return skip(`the top list for ${y}-${m}-${day} has no articles: ${JSON.stringify(data)?.slice(0, 160)}`)
  }

  const covered = coverage ?? recentCoverage(now)
  const candidates = []
  for (const a of articles.slice(0, TOP_CANDIDATES)) {
    if (candidates.length >= MAX_LINES * 3) break // headroom for description-stage drops
    const title = a.article || ''
    if (!title || isJunk(title)) continue
    if (isCovered(title, covered)) continue
    candidates.push({ title, views: a.views })
  }

  // Second-stage filter on Wikipedia's own short description — catches the
  // footballers/celebrities/films the title patterns can't.
  const descriptions = await Promise.all(candidates.map((c) => fetchDescription(c.title, get, deadline)))
  const lines = []
  for (let i = 0; i < candidates.length; i++) {
    if (lines.length >= MAX_LINES) break
    const desc = descriptions[i]
    if (desc === null) continue // summary unreachable — skip rather than pass junk
    if (DESC_JUNK.test(desc)) continue
    const c = candidates[i]
    lines.push(`- ${c.title.replace(/_/g, ' ')}${desc ? ` (${desc})` : ''} — ${fmtViews(c.views)} views`)
  }
  if (lines.length > 0) write(`${lines.join('\n')}\n`)
  return {
    counts: {
      listed: articles.length,
      candidates: candidates.length,
      unreachable: descriptions.filter((x) => x === null).length,
      lines: lines.length,
    },
  }
}

await runStage(import.meta, 'trending-gaps', main)
