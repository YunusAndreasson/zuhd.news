// The daily metrics the tuner reads: what a day's articles and a day's cycle
// logs add up to.
//
// This was `scripts/compute-metrics.js`, which read the clock, the corpus and
// the logs at its top level and printed. As functions of what was read, each
// figure can be tested for what it says of a given day.
//
// The figures are moved as they stood. Their output is one of the tuner's
// inputs.

import { datelineOf } from './article.js'
import { parseCycleLog } from './cycle-log.js'
import { recapMatch, titleWords } from './dedup.js'
import { parseFrontmatter } from './frontmatter.js'
import { soleClassifiedSource } from './outlet-class.js'
import { regionFromCoords } from './regions.js'

/**
 * @typedef {object} MetricsRow
 * @property {string} slug
 * @property {string} title
 * @property {string} date
 * @property {string[]} sources every source's name
 * @property {string} sourceUrl the first source's link
 * @property {string} category
 * @property {string} location
 * @property {number | null} lat
 * @property {number | null} lng
 * @property {number | null} publishedAt when zuhd published it, in ms: the
 *   author time of the commit that added the file (`lib/published-at.js`).
 *   Null for a file no commit holds, which is one that has not been published.
 */

/**
 * An article as the first four figures read it. It throws on a file whose
 * frontmatter does not parse; such a file is the validator's business, and
 * the caller leaves it out.
 *
 * Until 2026-10-09 this was a reader of its own, with a pattern a field: a
 * quoted name kept its escapes, a coordinate of exactly 0 read as none, and a
 * file that did not parse was counted. Over the 11,207 articles of the corpus
 * that day the two agreed on every field used here.
 *
 * @param {string} name the filename
 * @param {string} content
 * @param {number | null} [publishedAt] the article's publish time, which is not in the file
 * @returns {MetricsRow}
 */
export function metricsRow(name, content, publishedAt = null) {
  const { meta } = parseFrontmatter(content)
  const listed = Array.isArray(meta.sources) ? meta.sources : []
  const sources = listed.map((s) => String(s?.name ?? '')).filter(Boolean)
  // A string, whatever the file wrote: js-yaml 5 loads with its core schema,
  // which has no timestamp type, so a `date:` without quotes is its text.
  /** @param {unknown} v */
  const text = (v) => String(v ?? '')
  /** @param {unknown} v */
  const coordinate = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  return {
    slug: name.replace(/\.md$/, ''),
    title: text(meta.title),
    date: text(meta.date),
    sources,
    sourceUrl: text(listed[0]?.url),
    category: text(meta.category),
    location: text(meta.location),
    lat: coordinate(meta.lat),
    lng: coordinate(meta.lng),
    publishedAt,
  }
}

/**
 * @template T
 * @param {T[]} items
 * @param {(item: T) => string | null | undefined} keyFn
 */
function tally(items, keyFn) {
  /** @type {Record<string, number>} */
  const counts = {}
  for (const item of items) {
    const k = keyFn(item) || 'unknown'
    counts[k] = (counts[k] || 0) + 1
  }
  return counts
}

// ── Freshness ────────────────────────────────────────────────────────

/**
 * Days between a source's publication and ours, over the articles that have
 * both times and where ours is not the earlier. Ours is `publishedAt`, the
 * commit that added the article; theirs is the frontmatter `date`.
 *
 * Until 2026-10-09 ours was the filename's date at midnight, taken to be when
 * we published. The filename's date is the source's own
 * (`slugify(title, pubDate)`), so for a story dated at any hour of that day
 * the age was negative and the story was left out: what remained was the
 * handful dated at 00:00:00 or filed under a later day. The tuner's goal of a
 * median lag under a day was read off 1 article of 50 on 2026-10-08 and off
 * none of 59 on 10-06. Measured to the commit, every article of those days
 * counts, and the median is 0.1 day with a 90th percentile of 0.3 to 0.4.
 *
 * @param {MetricsRow[]} articles
 */
export function computeFreshness(articles) {
  const ages = articles
    .map((a) => {
      const theirs = new Date(a.date).getTime()
      if (a.publishedAt == null || Number.isNaN(theirs)) return null
      return (a.publishedAt - theirs) / 86400000
    })
    .filter((a) => a !== null && a >= 0)
    .sort((a, b) => /** @type {number} */ (a) - /** @type {number} */ (b))

  if (ages.length === 0) return { median: null, p90: null, max: null, count: 0 }
  const median = /** @type {number} */ (ages[Math.floor(ages.length / 2)])
  const p90 = /** @type {number} */ (ages[Math.floor(ages.length * 0.9)])
  return {
    median: Math.round(median * 10) / 10,
    p90: Math.round(p90 * 10) / 10,
    max: Math.round(Math.max(.../** @type {number[]} */ (ages)) * 10) / 10,
    count: ages.length,
  }
}

// ── Diversity ────────────────────────────────────────────────────────

/** Every outlet behind these articles, once each, in the order first met. @param {MetricsRow[]} articles */
const outletsOf = (articles) => [...new Set(articles.flatMap((a) => a.sources))]

/** @param {MetricsRow[]} articles */
export function computeDiversity(articles) {
  const categories = tally(articles, (a) => a.category)
  // An article with no source counts once, under "unknown".
  const sources = tally(articles.flatMap((a) => (a.sources.length > 0 ? a.sources : ['unknown'])), (name) => name)
  const regions = tally(articles, (a) => regionFromCoords(a.lat, a.lng) ?? 'unknown')
  const uniqueSources = Object.keys(sources).length
  const uniqueRegions = Object.keys(regions).filter((r) => r !== 'unknown').length
  const scienceSources = outletsOf(articles.filter((a) => a.category === 'science'))

  const multiSource = articles.filter((a) => a.sources.length > 1).length

  return { categories, sources, regions, uniqueSources, uniqueRegions, scienceSources, multiSource }
}

// ── Educational Value ────────────────────────────────────────────────

/** @param {MetricsRow[]} articles */
export function computeEducational(articles) {
  const science = articles.filter((a) => a.category === 'science')
  const tech = articles.filter((a) => a.category === 'tech')
  return {
    scienceCount: science.length,
    techCount: tech.length,
    sciTechRatio: articles.length > 0 ? Math.round(((science.length + tech.length) / articles.length) * 100) : 0,
    scienceSources: outletsOf(science),
    techSources: outletsOf(tech),
  }
}

// ── Duplicates ───────────────────────────────────────────────────────

/** @param {MetricsRow[]} articles */
export function findDuplicates(articles) {
  /** @type {Record<string, string[]>} */
  const urlMap = {}
  for (const a of articles) {
    // biome-ignore lint/suspicious/noAssignInExpressions: the (x ??= []) group-by idiom, in statement position. The rule is here for `if (a = b)`.
    if (a.sourceUrl) (urlMap[a.sourceUrl] ??= []).push(a.slug)
  }
  const dupes = Object.entries(urlMap).filter(([, slugs]) => slugs.length > 1)
  return { count: dupes.length, details: dupes.map(([url, slugs]) => ({ url: url.slice(0, 80), slugs })) }
}

// ── Sourcing and datelines ───────────────────────────────────────────
//
// Added 2026-09-25 because every goal the tuner is scored on was trivially met
// ("multi-source ≥ 4/day" against ~60 articles, 72% of them single-source;
// "regions ≥ 4" while a third of datelines were in the US), so the audit read
// "all metrics within targets" over the pipeline's actual weaknesses. These are
// the numbers the 2026-09-25 evaluation had to compute by hand.

// Contiguous US by bounding box: regionFromCoords files the US under 'AM'
// together with Latin America, which is what hid the imbalance.
/** @param {number} lat @param {number} lng */
const inUs = (lat, lng) => lat != null && lng != null && lat > 24 && lat < 50 && lng > -125 && lng < -66

/**
 * @typedef {object} SourcingRow
 * @property {string} slug
 * @property {string} title
 * @property {any[]} sources
 * @property {string} body
 * @property {number} lat
 * @property {number} lng
 */

/**
 * An article as the sourcing figures read it: through the frontmatter parser,
 * so it throws on a file whose YAML does not parse. Such a file is the
 * validator's business, and the caller leaves it out.
 *
 * @param {string} name the filename
 * @param {string} raw
 * @returns {SourcingRow}
 */
export function sourcingRow(name, raw) {
  // The parser's own body. This took the prose to start after the first `---`
  // anywhere in the file, so a source URL holding one would have been counted
  // as a missing dateline (what that cut cost the validator is in
  // `lib/validate-article.js`).
  const { meta, body } = parseFrontmatter(raw)
  const sources = Array.isArray(meta.sources) ? meta.sources : []
  return { slug: name.replace(/\.md$/, ''), title: String(meta.title || ''), sources, body: body.trim(), lat: Number(meta.lat), lng: Number(meta.lng) }
}

/**
 * @param {SourcingRow[]} rows a day's articles, in directory order
 * @param {number} quarantined how many of the day's files were moved to `.md.bad`
 */
export function computeSourcing(rows, quarantined) {
  const n = rows.length
  /** @param {number} k */
  const pct = (k) => (n ? Math.round((k / n) * 100) : 0)
  const single = rows.filter((r) => r.sources.length <= 1).length
  const classified = rows.map((r) => ({ r, cls: soleClassifiedSource(r.sources) })).filter((x) => x.cls)
  const us = rows.filter((r) => inUs(r.lat, r.lng)).length
  const latAm = rows.filter((r) => regionFromCoords(r.lat, r.lng) === 'AM' && !inUs(r.lat, r.lng) && r.lat < 33).length
  const noDateline = rows.filter((r) => datelineOf(r.body) === null).map((r) => r.slug)
  const withImage = rows.filter((r) => r.sources.some((s) => typeof s?.image === 'string' && s.image)).length
  // Same event twice in a day: the title-overlap test prefilter uses, run
  // pairwise over what actually shipped.
  const sameEvent = []
  for (let i = 0; i < rows.length; i++) {
    const earlier = rows.slice(0, i).map((r) => ({ slug: r.slug, words: titleWords(r.title) }))
    const hit = recapMatch(rows[i].title, earlier)
    if (hit) sameEvent.push([hit, rows[i].slug])
  }
  return {
    articles: n,
    singleSourcePct: pct(single),
    multiSourcePct: pct(n - single),
    stateOrAdvocacyOnly: classified.length,
    stateOrAdvocacyOnlySlugs: classified.map((x) => x.r.slug),
    usDatelinePct: pct(us),
    latAmDatelinePct: pct(latAm),
    missingDateline: noDateline.length,
    missingDatelineSlugs: noDateline,
    imageUrlPct: pct(withImage),
    sameEventDuplicates: sameEvent.length,
    sameEventPairs: sameEvent,
    quarantined,
  }
}

// ── A day's articles ─────────────────────────────────────────────────

/**
 * A day's articles as the two readers above take them, and the day's sourcing
 * figures. The day is the date a file is filed under, so this goes by the
 * name's prefix and not by a window (`articleFilesSince` answers for a
 * frontmatter `date`, with a month's margin), and it counts the day's
 * `.md.bad` names, which no window of articles holds.
 *
 * Each file is read once, for both rows. An article is in both or in neither:
 * one whose frontmatter does not parse is the validator's business, and one
 * that cannot be read is left out the same way.
 *
 * @param {string[] | null} names the articles directory's listing; null when there is no directory
 * @param {string} datePrefix the day, `YYYY-MM-DD`
 * @param {(name: string) => string} read a file's text
 * @param {Map<string, number>} publishedAt slug to publish time (`lib/published-at.js`)
 * @returns {{ articles: MetricsRow[], sourcing: ReturnType<typeof computeSourcing> | null }}
 */
export function readDay(names, datePrefix, read, publishedAt) {
  if (!names) return { articles: [], sourcing: null }
  const day = names.filter((n) => n.startsWith(datePrefix))
  /** @type {MetricsRow[]} */
  const articles = []
  /** @type {SourcingRow[]} */
  const sourcing = []
  for (const name of day.filter((n) => n.endsWith('.md'))) {
    try {
      const raw = read(name)
      const row = metricsRow(name, raw, publishedAt.get(name.replace(/\.md$/, '')) ?? null)
      sourcing.push(sourcingRow(name, raw))
      articles.push(row)
    } catch { /* left out of both */ }
  }
  return { articles, sourcing: computeSourcing(sourcing, day.filter((n) => n.endsWith('.md.bad')).length) }
}

// ── Cycle logs ───────────────────────────────────────────────────────

/**
 * One cycle, from its log. Read by `lib/cycle-log.js`. A stage's first
 * attempt, as before; and the log of the cycle this runs inside has no funnel
 * yet, so its counts are null, also as before.
 *
 * @param {string} file the log's filename
 * @param {string} text
 */
export function cycleRow(file, text) {
  const log = parseCycleLog(text)
  /** @param {string} id */
  const first = (id) => log.stages.find((s) => s.id === id)?.attempts[0] ?? null
  const deploy = first('deploy')

  return {
    file,
    totalSeconds: log.totalSeconds,
    feedSeconds: log.feed.seconds,
    selectorSeconds: first('selector')?.seconds ?? null,
    writerSeconds: first('writer')?.seconds ?? null,
    editorSeconds: first('editor')?.seconds ?? null,
    selected: log.selection.count,
    dedupBefore: log.selection.dedupBefore,
    dedupAfter: log.selection.dedupAfter,
    written: log.funnel?.written ?? null,
    published: log.funnel?.published ?? null,
    deploySuccess: deploy ? deploy.exit === 0 : null,
  }
}

/**
 * @typedef {object} DayRead what was read for one day
 * @property {MetricsRow[]} articles
 * @property {ReturnType<typeof computeSourcing> | null} sourcing null when there is no articles directory
 * @property {ReturnType<typeof cycleRow>[]} logs in filename order
 */

/**
 * The metrics record: the day's figures beside the day before's.
 *
 * @param {string} date today, `YYYY-MM-DD`
 * @param {DayRead} today
 * @param {DayRead} yesterday
 */
export function dailyMetrics(date, today, yesterday) {
  const todayLogs = today.logs
  // Over the cycles that have the value. This runs inside the day's last
  // cycle, whose log has no total and no funnel yet (`cycleRow`), and that
  // cycle was averaged in as 0 seconds and 0 published: on 2026-10-08 the
  // tuner was told 869 s and 9 articles a cycle for four cycles that took
  // 1,729, 812, 934 and 871 s and published 11, 10, 12 and 10.
  /** @param {'totalSeconds' | 'selectorSeconds' | 'writerSeconds' | 'editorSeconds' | 'published'} key */
  const avg = (key) => {
    const values = todayLogs.map((l) => l[key]).filter((v) => v != null)
    return values.length > 0 ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : null
  }
  return {
    date,
    articlesPublished: { today: today.articles.length, yesterday: yesterday.articles.length },
    freshness: {
      today: computeFreshness(today.articles),
      yesterday: computeFreshness(yesterday.articles),
    },
    diversity: {
      today: computeDiversity(today.articles),
      yesterday: computeDiversity(yesterday.articles),
    },
    educational: {
      today: computeEducational(today.articles),
      yesterday: computeEducational(yesterday.articles),
    },
    duplicates: {
      today: findDuplicates(today.articles),
      yesterday: findDuplicates(yesterday.articles),
    },
    sourcing: {
      today: today.sourcing,
      yesterday: yesterday.sourcing,
    },
    cycles: {
      today: {
        count: todayLogs.length,
        completed: todayLogs.filter((l) => l.deploySuccess).length,
        avgDuration: avg('totalSeconds'),
        avgSelectorSeconds: avg('selectorSeconds'),
        avgWriterSeconds: avg('writerSeconds'),
        avgEditorSeconds: avg('editorSeconds'),
        avgPublished: avg('published'),
      },
      yesterday: {
        count: yesterday.logs.length,
        completed: yesterday.logs.filter((l) => l.deploySuccess).length,
      },
    },
  }
}
