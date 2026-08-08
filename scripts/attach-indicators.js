#!/usr/bin/env node
// Attaches live indicator levels to each selected story, before the writer runs.
//
// The crossreference between an article and a chart used to be built entirely
// after the fact: the writer wrote "oil prices fell", and `extract-entities.js`
// later noticed the word "oil" and hung a Brent chip off it. That chip is a
// decoration on a sentence that never engaged with the number. Handing the
// writer the number instead makes the link *earned* — "Brent at $71.20, down
// 8% in a fortnight" is a sentence the chart is genuinely about.
//
// Deterministic and free: no model call and no API call. It reads the trends
// snapshot already on disk and the same `entity-registry.js` rules
// `extract-entities.js` uses, so the ids offered to the writer are exactly the
// ids the entity stage will resolve afterwards.
//
// ── On staleness, which is not a defect here ──────────────────────────────
//
// `fetch-trends.js` is Stage 3.4 and runs *after* the writer, so the freshest
// snapshot at this point is the previous cycle's. That is fine and must not be
// "fixed" by moving the fetch onto the critical path ahead of Stage 2: these
// series carry their own publication lag anyway — Brent's `asOf` in an 8 August
// snapshot is 3 August — so a fetch here would buy no freshness and would put a
// network call in front of the one stage that must not fail. What matters is
// that the writer knows the date, so `asOf` travels with every level and the
// prompt requires it be stated.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { extractEntities } from './lib/entity-registry.js'

const ROOT = new URL('..', import.meta.url).pathname
const SELECTION = '/tmp/zuhd-selection.json'

if (!existsSync(SELECTION)) {
  console.log('No selection file — skipping indicator attach.')
  process.exit(0)
}

/** Newest daily trends snapshot, or null. */
const latestTrends = () => {
  const dir = join(ROOT, 'content', 'trends')
  if (!existsSync(dir)) return null
  const names = readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
  return names.length ? join(dir, names[names.length - 1]) : null
}

const path = latestTrends()
if (!path) {
  console.log('No trends snapshot — skipping indicator attach.')
  process.exit(0)
}

const trends = JSON.parse(readFileSync(path, 'utf8'))
const byId = new Map((trends.indicators || []).map((i) => [i.id, i]))

/**
 * The change across the last `n` published points, with the period named.
 *
 * **The period comes from the cadence, and getting that wrong is the whole
 * hazard of this stage.** `values` is a list of observations, not of days:
 * `wheat` and `rice` are monthly, so the last seven points are seven *months*.
 * The first version labelled every one of them `change7d`, which offered a
 * writer a 12-month commodity swing as a fortnight's move — a wrong number in
 * an article, produced by a stage whose whole purpose is getting numbers into
 * articles.
 */
const change = (ind, n) => {
  const v = (ind.values || []).filter(Number.isFinite)
  if (v.length < 2) return null
  const steps = Math.min(n, v.length - 1)
  const from = v[v.length - 1 - steps]
  const to = v[v.length - 1]
  if (!Number.isFinite(from) || from === 0) return null
  const unit = ind.cadence === 'monthly' ? 'month' : ind.cadence === 'weekly' ? 'week' : 'day'
  return {
    pct: Number((((to - from) / Math.abs(from)) * 100).toFixed(1)),
    over: `${steps} ${unit}${steps === 1 ? '' : 's'}`,
  }
}

/** Days since a published `asOf`, or null. */
const ageDays = (asOf) => {
  const t = Date.parse(`${asOf}T00:00:00Z`)
  return Number.isFinite(t) ? Math.round((Date.now() - t) / 86400_000) : null
}

/**
 * How stale a level may be before it stops being a level.
 *
 * A monthly series is legitimately two months behind its own publication and
 * still current; a daily one two months behind is broken. Beyond this the
 * indicator is dropped rather than dated, because a writer handed a figure will
 * use it and the caveat is the first thing a 350-character article cuts.
 */
const MAX_AGE_DAYS = { monthly: 45, weekly: 30 }
const STALE_DEFAULT = 12

/**
 * The two windows offered per cadence, in observations.
 *
 * Fixed at 7 and 30 first, which on a monthly series is seven months and
 * **twenty-two** — a nearly two-year swing offered beside a daily one as though
 * they were the same kind of statement. A window is only useful if a reader
 * would recognise it as a period: a quarter and a year for a monthly print, a
 * week and a month for a daily one.
 */
const WINDOWS = { monthly: [3, 12], weekly: [4, 26] }
const WINDOWS_DEFAULT = [7, 30]

/** Four significant figures — what a sentence can carry and what the rail
 *  prints. A writer given 71.2047 will print 71.2047. */
const sig4 = (n) => (Number.isFinite(n) ? Number(Number(n).toPrecision(4)) : null)

let selection
try {
  selection = JSON.parse(readFileSync(SELECTION, 'utf8'))
} catch (err) {
  console.log(`Selection unreadable (${err.message}) — skipping indicator attach.`)
  process.exit(0)
}
if (!Array.isArray(selection)) {
  console.log('Selection is not an array — skipping indicator attach.')
  process.exit(0)
}

let attached = 0
let stale = 0
let stories = 0

for (const story of selection) {
  if (!story || typeof story !== 'object') continue
  /**
   * The title, the selector's angle, and the concepts — **never the source
   * bodies**.
   *
   * The bodies were included first, on the reasoning that they are the prose
   * the writer works from. They are also full news articles, and a full news
   * article contains every incidental noun in the English language: the first
   * run offered a **wheat price to a story about a solar eclipse**, because a
   * paragraph describing where to stand in Spain mentioned "wheat fields and
   * rolling hills". That is precisely the wrong-crossreference failure this
   * work exists to remove, arriving one stage earlier than usual.
   *
   * A title, an angle and a concept list are *statements of what the story is
   * about*. A body is everything the outlet happened to write. Only the first
   * kind can decide whether a number belongs in front of a writer.
   */
  const text = [story.title, story.angle].filter(Boolean).join('\n')

  const { resolved } = extractEntities(text, story.concepts)
  const rows = []
  for (const e of resolved) {
    const ind = byId.get(e.indicatorId)
    if (!ind || !Array.isArray(ind.values)) continue
    const values = ind.values.filter(Number.isFinite)
    if (values.length < 2) continue
    const asOf = ind.asOf || trends.asOf || ''
    const age = ageDays(asOf)
    const limit = MAX_AGE_DAYS[ind.cadence] ?? STALE_DEFAULT
    if (age != null && age > limit) {
      stale++
      continue
    }
    rows.push({
      id: ind.id,
      label: ind.label,
      level: sig4(values[values.length - 1]),
      unit: ind.unit || '',
      cadence: ind.cadence || 'daily',
      recent: change(ind, (WINDOWS[ind.cadence] ?? WINDOWS_DEFAULT)[0]),
      wider: change(ind, (WINDOWS[ind.cadence] ?? WINDOWS_DEFAULT)[1]),
      // Non-negotiable: a figure a writer cannot date is a figure they will
      // present as today's.
      asOf,
      ageDays: age,
    })
  }

  // Ambiguous mentions are deliberately dropped rather than defaulted. The
  // entity stage resolves `rupee` and `pound` with a Haiku call it is already
  // making; guessing here would put a Pakistani rupee level in front of a
  // writer covering Delhi, and a wrong number in an article is far worse than
  // an absent one.
  if (!rows.length) continue
  // Three at most. A story is about one or two things, and a longer list reads
  // as a menu the writer is expected to work through.
  story.indicators = rows.slice(0, 3)
  attached += story.indicators.length
  stories++
}

writeFileSync(SELECTION, JSON.stringify(selection, null, 2))
console.log(
  `Indicators: ${attached} level(s) attached across ${stories}/${selection.length} stories, ${stale} dropped as stale ` +
    `(snapshot ${trends.asOf || 'undated'})`,
)
