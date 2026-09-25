#!/usr/bin/env node
// Validates new articles from /tmp/zuhd-new-articles.txt.
// Moves malformed files to .bad so they don't get deployed.
import { readFileSync, existsSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { splitBlocks } from './lib/blocks.js'
import { normalizeUrl } from './lib/dedup.js'
import { parseFrontmatter } from './lib/frontmatter.js'
import { bodyNamesOutlet, soleClassifiedSource } from './lib/outlet-class.js'

const files = readFileSync('/tmp/zuhd-new-articles.txt', 'utf8').trim().split('\n').filter(Boolean)
let bad = 0
let repaired = 0

// ── What is already published, for the duplicate gates ────────────────────
//
// No duplicate check ran after the writer. On 2026-09-07 the editor spotted a
// same-URL double publish and had no way to stop it, and in the fortnight to
// 09-25 two identical titles shipped within a day ("India Ends Free UPI",
// "Trump Presses Kyiv On Refineries"). Both gates below are exact-match on
// purpose: measured over 837 articles they fire only on real duplicates.
const WINDOW_MS = 72 * 3600 * 1000
const ARTICLES_DIR = resolve('content/articles')
const batch = new Set(files.map((f) => basename(f)))
const normTitle = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
const recentDay = new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10)
/** @type {{ slug: string, t: number, title: string, url: string }[]} */
const published = []
for (const name of readdirSync(ARTICLES_DIR)) {
  if (!name.endsWith('.md') || name.slice(0, 10) < recentDay || batch.has(name)) continue
  try {
    const { meta } = parseFrontmatter(readFileSync(join(ARTICLES_DIR, name), 'utf8'))
    published.push({ slug: name, t: Date.parse(meta.date), title: normTitle(meta.title), url: normalizeUrl(meta.sources?.[0]?.url || '') })
  } catch { /* an unparseable neighbour is its own problem, not this article's */ }
}
const DATELINE = /^([^\n—]{2,60}?) — /

for (const f of files) {
  const full = resolve(f)
  if (!existsSync(full)) continue
  const raw = readFileSync(full, 'utf8')

  const markBad = reason => {
    console.log(`SKIP (${reason}): ${f}`)
    renameSync(full, `${full}.bad`)
    bad++
  }

  const fm = raw.match(/^---\n([\s\S]*?)\n---/)
  if (!fm) {
    markBad('no frontmatter')
    continue
  }

  // Parse with the same function build.js uses, not just string-match it.
  // The string checks below pass on frontmatter that js-yaml rejects, so an
  // unparseable article reached Stage 3b and took the whole build down with
  // it — a no-publish cascade off one file. Quarantining it here is what the
  // .bad mechanism is for: 12 good articles ship, the broken one does not.
  try {
    parseFrontmatter(raw)
  } catch (err) {
    markBad(`unparseable frontmatter: ${err.reason || err.message}`)
    continue
  }

  const yaml = fm[1]
  const has = k => yaml.includes(`${k}:`)
  const hasSources = yaml.includes('sources:') && yaml.includes('  - name:')
  if (!has('title') || !has('date') || !has('category') || !has('location') || !hasSources) {
    markBad('missing fields')
    continue
  }

  // The writer's contract is four blocks, or five when the optional
  // counterpoint-or-quote block was earned (`scripts/write-prompt.md` §rhythm).
  // This range is deliberately wider than the contract in BOTH directions,
  // because the penalty here is not a warning — it is the article not
  // publishing at all. A three-block draft that lost a paragraph break is still
  // readable news; quarantining it costs the reader the story to enforce a rule
  // the editor stage is better placed to fix. The ceiling is the real guard: a
  // body that split into six or more blocks is a malformed file, not a long
  // article.
  const body = raw.replace(/^---[\s\S]*?---\s*/, '').trim()
  const blocks = splitBlocks(body).filter(s => s.length > 5)
  if (blocks.length < 2 || blocks.length > 5) {
    markBad(`${blocks.length} blocks`)
    continue
  }

  const { meta } = parseFrontmatter(raw)
  const location = String(meta.location || '').trim()

  // Dateline. Nine bodies shipped without one on 2026-09-22 22:00 — the editor
  // rewrote their hooks and dropped it. `location` is the dateline city by
  // invariant, so a missing one is repaired rather than costing the story.
  const dl = body.match(DATELINE)
  if (!dl) {
    if (!location) {
      markBad('no dateline and no location')
      continue
    }
    const fixed = raw.replace(body, () => `${location} — ${body}`)
    writeFileSync(full, fixed)
    repaired++
    console.log(`REPAIRED (dateline "${location} — " restored): ${f}`)
  } else if (dl[1].trim() !== location) {
    markBad(`location "${location}" is not the dateline city "${dl[1].trim()}"`)
    continue
  }

  // Same primary source URL, or the same title, as an article published in the
  // last 72 hours — or as an earlier file in this batch.
  const t = Date.parse(meta.date)
  const url = normalizeUrl(meta.sources?.[0]?.url || '')
  const title = normTitle(meta.title)
  const dup = published.find((p) => Math.abs(p.t - t) <= WINDOW_MS && ((url && p.url === url) || (title && p.title === title)))
  if (dup) {
    markBad(`duplicate of ${dup.slug} (${dup.url === url ? 'same source URL' : 'same title'})`)
    continue
  }
  published.push({ slug: basename(f), t, title, url })

  // State-media or advocacy as the only sourcing: allowed, but the body must
  // say whose claim it is (lib/outlet-class.js has the why).
  const cls = soleClassifiedSource(meta.sources)
  if (cls && !bodyNamesOutlet(body, cls)) {
    markBad(`only source is ${cls.label}, and the body does not name it`)
  }
}

console.log(`Validated ${files.length} articles, ${bad} removed${repaired ? `, ${repaired} dateline(s) repaired` : ''}`)
