// Every source the pipeline pulls from or posts to, and whether it is working.
//
// The page had one table of this kind, the RSS outlets. The ten snapshot
// fetchers, the ten sources behind the trends file, the analytics pull, the
// briefing's voice and the three places a story is posted had none, and their
// stages exit 0 when they fail: a fetcher that cannot reach its source keeps
// the last snapshot and says so in the log. X answered "credits depleted" to
// 98 posts in a row and four exchanges returned nothing for forty cycles, and
// nothing here could turn red for either.
//
// A row is read from what the source left on disk, never from a file's
// modification time: the cycle's `git pull --autostash` rewrites every
// snapshot, so ten of them share one. What counts is the stamp inside.

import { AI_LABS } from '../lib/ai-lab-metadata.js'
import { MIN_MODELS } from '../lib/ai-models.js'
import { CHOKEPOINT_CATALOG } from '../lib/chokepoint-metadata.js'
import { COMPANY_TRACKED } from '../lib/company-metadata.js'
import { MARKET_TRACKED } from '../lib/market-metadata.js'
import { RSS_SOURCE_NAMES } from '../lib/rss-sources.js'
import { INDICATORS } from '../lib/trends-registry.js'

const HOUR = 3600_000
const DAY = 24 * HOUR

/**
 * How long each of two fetchers keeps a snapshot before asking again. They
 * are `REFETCH_AFTER_MS` in `fetch-ai-models.js` and `CACHE_MAX_AGE_MS` in
 * `fetch-conflict.js`, scripts that run when they are loaded and so cannot be
 * imported; `dashboard.test.js` holds these to them.
 */
export const KEPT_FOR_MS = { aiModels: 20 * HOUR, conflict: 6 * HOUR }

/** `DATASET_STALE_DAYS` in `fetch-conflict.js`: how far behind UCDP's last week may be. Held by the same test. */
export const CONFLICT_STALE_DAYS = 45

/**
 * How old a series' newest point may be before the row says so, by the
 * cadence the series is published on. A daily series skips weekends and
 * holidays and PortWatch publishes a week at a time; a monthly one is dated
 * the first of its month and released six weeks after it ends. These are the
 * dashboard's own bars: `bis.js` has one (45 days), the other sources none.
 */
export const LAG_DAYS = { daily: 7, weekly: 21, monthly: 92 }

/**
 * @typedef {'green' | 'amber' | 'red' | 'unknown'} Status
 * @typedef {{ id: string, name: string, status: Status, fetchedAt: string | null, dataAsOf: string | null,
 *   got: number | null, expected: number | null, unit: string, note: string,
 *   failed: { n: number, of: number } | null, detail?: { name: string, status: Status, text: string }[] }} Row
 * @typedef {{ id: string, startedAt: string | null, finished: boolean, ran: string[],
 *   marks: { stage: string | null, name: string, message: string }[],
 *   exits: Record<string, number | null>, abort: string | null, cause: string | null }} CycleFacts
 */

/** @param {Status[]} all */
export const worst = (all) => /** @type {Status} */ (['red', 'amber', 'unknown', 'green'].find((s) => all.includes(/** @type {Status} */ (s))) ?? 'unknown')

/** @param {string | null | undefined} date `2026-10-04` or an ISO moment @param {number} now */
const daysOld = (date, now) => (date ? Math.floor((now - Date.parse(date)) / DAY) : null)

/** @param {(string | null | undefined)[]} dates */
const oldest = (dates) => dates.filter(Boolean).sort()[0] ?? null

/**
 * The rows, in the groups the page shows them in.
 *
 * `read(name)` answers a dataset parsed, or null when it is missing or not
 * JSON; `cycles` are the finished cycles, newest first. A cycle still running
 * is left out by the caller: its fetchers have a header in the log before
 * they have written anything.
 *
 * @param {{ read: (name: string) => any, cycles: CycleFacts[], now?: number }} from
 */
export function sourcesView({ read, cycles, now = Date.now() }) {
  const done = cycles.filter((c) => c.finished && c.startedAt)

  /**
   * Whether a stamp is from the last cycle that ran this stage. One cycle
   * behind is amber: the fetcher kept its snapshot. Two is red. A cycle that
   * ended before the stage (an abort, nothing new to write) is not counted,
   * which is what keeps a selector failure from painting every source stale.
   *
   * @param {string | null | undefined} stamp
   * @param {string} stage the number in the stage's log header
   * @param {number} [keptFor] a fetcher that keeps its snapshot this long is not late within it
   * @returns {{ status: Status, note: string }}
   */
  const fresh = (stamp, stage, keptFor = 0) => {
    if (!stamp || Number.isNaN(Date.parse(stamp))) return { status: 'red', note: 'nothing on disk' }
    const runs = done.filter((c) => c.ran.includes(stage))
    if (!runs.length) return { status: 'unknown', note: 'no finished cycle has run this stage' }
    // A minute's grace: a stage's stamp can precede the second its cycle's log opens on.
    const behind = runs.findIndex((c) => Date.parse(stamp) >= Date.parse(/** @type {string} */ (c.startedAt)) - keptFor - 60_000)
    if (behind === 0) return { status: 'green', note: '' }
    if (behind === 1) return { status: 'amber', note: 'not refreshed by the last cycle that tried' }
    return { status: 'red', note: `not refreshed by the last ${behind === -1 ? runs.length : behind} cycles that tried` }
  }

  /**
   * In how many of the cycles that ran a stage it printed a `✗` this test accepts.
   *
   * @param {string} stage
   * @param {(name: string) => boolean} [test]
   */
  const failed = (stage, test = () => true) => {
    const runs = done.filter((c) => c.ran.includes(stage))
    return { n: runs.filter((c) => c.marks.some((m) => m.stage === stage && test(m.name))).length, of: runs.length }
  }

  /** @param {{ status: Status, note: string }[]} parts */
  const judged = (parts) => ({ status: worst(parts.map((p) => p.status)), note: parts.map((p) => p.note).filter(Boolean).join(' · ') })

  /** @param {boolean} bad @param {string} note @param {Status} [status] */
  const when = (bad, note, status = 'amber') => (bad ? { status, note } : { status: /** @type {Status} */ ('green'), note: '' })

  /** @param {string | null} asOf @param {number} limit @param {string} what */
  const lag = (asOf, limit, what) => {
    const days = daysOld(asOf, now)
    return when(days !== null && days > limit, `${what} is ${days} days old`)
  }

  // ── The news feed ──────────────────────────────────────────────────
  const api = read('feedApi')
  const rss = read('feedSourceStats')
  const outlets = Array.isArray(rss?.sources) ? rss.sources : []
  const outletFails = failuresByName(done.filter((c) => c.ran.includes('0')), '0')
  const down = outlets.filter((/** @type {any} */ s) => s.error)
  const apiStories = Array.isArray(api?.stories) ? api.stories.length : null

  /** @type {Row[]} */
  const feed = [
    {
      id: 'newsapi', name: 'NewsAPI.ai', unit: 'stories', fetchedAt: api?.fetchedAt ?? null, dataAsOf: null,
      got: apiStories, expected: null, failed: null,
      ...judged([fresh(api?.fetchedAt, '0'), when(apiStories === 0, 'no stories came back', 'red'),
        { status: 'green', note: api?.tokens?.estTokens != null ? `~${api.tokens.estTokens} tokens` : '' }]),
    },
    {
      id: 'rss', name: 'RSS outlets and Hacker News', unit: 'outlets', fetchedAt: rss?.fetchedAt ?? null, dataAsOf: null,
      got: outlets.length - down.length, expected: RSS_SOURCE_NAMES.length, failed: failed('0'),
      ...judged([fresh(rss?.fetchedAt, '0'),
        when(down.length > 0, `down: ${down.map((/** @type {any} */ s) => s.name).join(', ')}`, down.length > outlets.length / 2 ? 'red' : 'amber'),
        when(outlets.length > 0 && outlets.length < RSS_SOURCE_NAMES.length, `${RSS_SOURCE_NAMES.length - outlets.length} outlets not in the last fetch`)]),
      detail: outlets.map((/** @type {any} */ s) => ({
        name: String(s.name),
        status: s.error ? 'red' : outletFails[s.name] ? 'amber' : 'green',
        text: `${s.error ? String(s.error) : `${s.fetched} fetched, ${s.used} used`}${outletFails[s.name] ? ` · failed in ${outletFails[s.name]} of ${done.filter((c) => c.ran.includes('0')).length} cycles` : ''}`,
      })),
    },
  ]

  // ── The trends file: one fetch, ten sources ────────────────────────
  const trends = read('trendsLatest')
  const indicators = Array.isArray(trends?.indicators) ? trends.indicators : []
  const trendsFresh = fresh(trends?.fetchedAt, '3.4')
  /** @type {[id: string, name: string][]} */
  const TREND_SOURCES = [
    ['futures', 'Yahoo (futures)'], ['fred', 'FRED'], ['imf', 'IMF commodity prices'], ['oer', 'Open Exchange Rates'], ['portwatch', 'IMF PortWatch'], ['polymarket', 'Polymarket'],
    ['crypto', 'CoinGecko'], ['bis', 'BIS policy rates'], ['wikipedia', 'Wikipedia pageviews'], ['stocks', 'Yahoo (story tickers)'],
  ]
  /** @type {Row[]} */
  const trendRows = TREND_SOURCES.map(([id, name]) => {
    const rows = indicators.filter((/** @type {any} */ r) => r.source === id)
    const registered = INDICATORS.filter((r) => r.source === id).length
    const carried = rows.filter((/** @type {any} */ r) => r.fetchedAt && r.fetchedAt < trends.fetchedAt)
    const late = rows.filter((/** @type {any} */ r) => (daysOld(r.asOf, now) ?? 0) > (LAG_DAYS[/** @type {keyof typeof LAG_DAYS} */ (r.cadence)] ?? LAG_DAYS.daily))
    // Story tickers come and go with the stories; every other source should always answer.
    const none = rows.length === 0 && id !== 'stocks'
    return {
      id: `trends-${id}`, name, unit: 'series', fetchedAt: trends?.fetchedAt ?? null,
      dataAsOf: oldest(rows.map((/** @type {any} */ r) => r.asOf)),
      got: rows.length, expected: registered || null,
      failed: failed('3.4', (mark) => mark.startsWith(id)),
      ...judged([trendsFresh,
        when(none, 'no series in the snapshot', 'red'),
        when(registered > 0 && rows.length > 0 && rows.length < registered, `${registered - rows.length} of ${registered} series missing`),
        when(carried.length > 0, `${carried.length} carried from an earlier fetch`),
        when(late.length > 0, `behind: ${late.map((/** @type {any} */ r) => `${r.id} (${r.asOf})`).join(', ')}`)]),
    }
  })
  trendRows.push({
    id: 'trends-calendar', name: 'FRED release calendar', unit: 'releases', fetchedAt: null,
    dataAsOf: trends?.releaseCalendarAsOf ?? null,
    got: Array.isArray(trends?.releaseCalendar) ? trends.releaseCalendar.length : null, expected: null, failed: null,
    ...judged([when(!trends?.releaseCalendarAsOf, 'no calendar in the snapshot', 'red'), lag(trends?.releaseCalendarAsOf, 2, 'the calendar')]),
  })

  // ── Snapshots: a file a fetcher ────────────────────────────────────
  const chokepoints = read('chokepoints')
  const markets = read('markets')
  const companies = read('companies')
  const aiModels = read('aiModels')
  const gdacs = read('gdacs')
  const conflict = read('conflict')
  const ioda = read('ioda')
  const firms = read('firms')
  const ipc = read('ipc')

  /** @param {any} list */
  const count = (list) => (Array.isArray(list) ? list.length : null)
  /** @param {any} file @param {string} key */
  const quotes = (file, key) => {
    const rows = Array.isArray(file?.[key]) ? file[key] : []
    const skipped = Array.isArray(file?.skipped) ? file.skipped : []
    const stale = rows.filter((/** @type {any} */ r) => r.stale)
    return {
      dataAsOf: oldest(rows.map((/** @type {any} */ r) => r.asOf)),
      parts: [
        when(file != null && rows.length === 0, 'the snapshot is empty', 'red'),
        when(skipped.length > 0, `no data: ${skipped.map((/** @type {any} */ s) => s.id).join(', ')}`),
        when(stale.length > 0, `stale or from the cache: ${stale.map((/** @type {any} */ r) => r.id).join(', ')}`),
      ],
    }
  }
  const marketQuotes = quotes(markets, 'exchanges')
  const companyQuotes = quotes(companies, 'companies')
  const chokeAsOf = oldest((chokepoints?.chokepoints ?? []).map((/** @type {any} */ c) => c.asOf))

  /** @type {Row[]} */
  const snapshots = [
    {
      id: 'chokepoints', name: 'Chokepoints (PortWatch, open-meteo)', unit: 'straits', fetchedAt: chokepoints?.generated ?? null, dataAsOf: chokeAsOf,
      got: count(chokepoints?.chokepoints), expected: CHOKEPOINT_CATALOG.length, failed: failed('3.4b'),
      ...judged([fresh(chokepoints?.generated, '3.4b'),
        when((count(chokepoints?.chokepoints) ?? 0) < CHOKEPOINT_CATALOG.length, 'straits missing'),
        lag(chokeAsOf, LAG_DAYS.daily, 'the newest transit count')]),
    },
    {
      id: 'markets', name: 'Exchanges (Yahoo Finance)', unit: 'exchanges', fetchedAt: markets?.generated ?? null, dataAsOf: marketQuotes.dataAsOf,
      got: count(markets?.exchanges), expected: MARKET_TRACKED.length, failed: failed('3.4b2'),
      ...judged([fresh(markets?.generated, '3.4b2'), ...marketQuotes.parts]),
    },
    {
      id: 'companies', name: 'Companies (Yahoo Finance)', unit: 'companies', fetchedAt: companies?.generated ?? null, dataAsOf: companyQuotes.dataAsOf,
      got: count(companies?.companies), expected: COMPANY_TRACKED.length, failed: failed('3.4b3'),
      ...judged([fresh(companies?.generated, '3.4b3'), ...companyQuotes.parts]),
    },
    {
      id: 'ai-models', name: 'AI models (Epoch AI)', unit: 'labs', fetchedAt: aiModels?.fetched ?? null,
      dataAsOf: oldest((aiModels?.labs ?? []).map((/** @type {any} */ l) => l.asOf)),
      got: count(aiModels?.labs), expected: AI_LABS.length, failed: failed('3.4b4'),
      ...judged([fresh(aiModels?.fetched, '3.4b4', KEPT_FOR_MS.aiModels),
        when((count(aiModels?.labs) ?? 0) < AI_LABS.length, 'labs missing'),
        when(aiModels != null && !(aiModels.models >= MIN_MODELS), `${aiModels?.models} models, under the floor of ${MIN_MODELS}`, 'red'),
        { status: 'green', note: aiModels?.models ? `${aiModels.models} models` : '' }]),
    },
    {
      id: 'gdacs', name: 'Disasters (GDACS)', unit: 'alerts', fetchedAt: gdacs?.generated ?? null, dataAsOf: null,
      got: count(gdacs?.alerts), expected: null, failed: failed('3.4c'),
      ...judged([fresh(gdacs?.generated, '3.4c'), when(count(gdacs?.alerts) === 0, 'no alerts', 'red')]),
    },
    {
      id: 'conflict', name: 'Conflict (UCDP candidate)', unit: 'events', fetchedAt: conflict?.generated ?? null, dataAsOf: conflict?.windowEnd ?? null,
      got: count(conflict?.events), expected: null, failed: failed('3.4c2'),
      ...judged([fresh(conflict?.generated, '3.4c2', KEPT_FOR_MS.conflict),
        lag(conflict?.windowEnd, CONFLICT_STALE_DAYS, 'the newest week UCDP has published'),
        { status: 'green', note: conflict?.ucdpVersion ? `release ${conflict.ucdpVersion}` : '' }]),
    },
    {
      id: 'ioda', name: 'Internet outages (IODA)', unit: 'countries', fetchedAt: ioda?.generated ?? null, dataAsOf: null,
      got: count(ioda?.countries), expected: null, failed: failed('3.4c3'),
      ...judged([fresh(ioda?.generated, '3.4c3'), when(count(ioda?.countries) === 0, 'no countries', 'red')]),
    },
    {
      id: 'firms', name: 'Thermal anomalies (NASA FIRMS)', unit: 'cells', fetchedAt: firms?.generated ?? null, dataAsOf: null,
      got: firms ? firms.cells - firms.cellsFailed : null, expected: firms?.cells ?? null, failed: failed('3.4c4'),
      ...judged([fresh(firms?.generated, '3.4c4'),
        when(firms?.cellsFailed > 0, `${firms?.cellsFailed} cells failed`, firms?.cellsFailed > firms?.cells / 2 ? 'red' : 'amber'),
        { status: 'green', note: firms ? `${count(firms.events)} events attached` : '' }]),
    },
    {
      id: 'ipc', name: 'Food insecurity (IPC via HDX)', unit: 'countries', fetchedAt: ipc?.generated ?? null, dataAsOf: null,
      got: count(ipc?.countries), expected: null, failed: failed('3.4c5'),
      ...judged([fresh(ipc?.generated, '3.4c5'),
        when(count(ipc?.countries) === 0, 'no countries', 'red'),
        when(ipc?.countriesFailed > 0, `${ipc?.countriesFailed} countries failed`),
        { status: 'green', note: ipc ? `${count(ipc.areas)} areas` : '' }]),
    },
  ]

  // ── Once a day ─────────────────────────────────────────────────────
  const analytics = read('analytics')
  const analyticsError = read('analyticsError')
  const briefing = read('briefingMeta')
  const fallbackVoice = Array.isArray(briefing?.engines) && briefing.engines.some((/** @type {string} */ e) => e !== 'gemini')
  /** @type {Row[]} */
  const daily = [
    {
      id: 'analytics', name: 'Pageviews (Cloudflare)', unit: 'requests', fetchedAt: analytics?.fetchedAt ?? null, dataAsOf: null,
      got: analytics?.lastRunRequests ?? null, expected: null, failed: null,
      ...judged([fresh(analytics?.fetchedAt, '3.9'),
        when(analyticsError != null, `the last fetch failed: ${String(analyticsError?.error ?? analyticsError?.message ?? 'see the log').slice(0, 120)}`, 'red'),
        when(analytics?.lastRunRequests === 0, 'no requests counted', 'red')]),
    },
    {
      id: 'briefing', name: 'Briefing voice (Gemini TTS)', unit: 'seconds', fetchedAt: briefing?.generated ?? null, dataAsOf: briefing?.date ?? null,
      got: briefing?.duration ?? null, expected: null, failed: null,
      ...judged([fresh(briefing?.generated, '4'),
        when(fallbackVoice, `read by the fallback voice (${briefing?.engines?.join(' + ')})`),
        { status: 'green', note: briefing?.voice ? String(briefing.voice) : '' }]),
    },
  ]

  // ── Where a story is posted ────────────────────────────────────────
  /** @type {Row[]} */
  const outbound = [
    posted('push', 'Push notifications', read('pushLog')),
    posted('x', 'X', read('tweetLog')),
    posted('instagram', 'Instagram', read('instagramLog')),
  ]

  // ── What the cycle itself stands on ────────────────────────────────
  /** @type {Row[]} */
  const platform = [
    stageRow('claude', 'Claude (selector, writer, editor)', ['selector', 'writer', 'editor'], done),
    stageRow('build', 'Site build', ['build'], done),
    stageRow('deploy', 'Cloudflare Pages deploy', ['deploy'], done),
  ]

  const groups = [
    { id: 'feed', title: 'news feed — every cycle', rows: feed },
    { id: 'trends', title: 'instruments — the trends file, every cycle with new articles', rows: trendRows },
    { id: 'snapshots', title: 'map layers and snapshots — every cycle with new articles', rows: snapshots },
    { id: 'daily', title: 'once a day', rows: daily },
    { id: 'outbound', title: 'where a story is posted', rows: outbound },
    { id: 'platform', title: 'what the cycle stands on', rows: platform },
  ]
  const all = groups.flatMap((g) => g.rows)
  /** @param {Status} s */
  const n = (s) => all.filter((r) => r.status === s).length
  return {
    groups,
    summary: { total: all.length, green: n('green'), amber: n('amber'), red: n('red'), unknown: n('unknown'), status: worst(all.map((r) => r.status)) },
    lastCycle: done[0] ? { id: done[0].id, startedAt: done[0].startedAt, abort: done[0].abort, cause: done[0].cause } : null,
  }
}

/**
 * In how many of these cycles each name was marked `✗` in one stage, a name
 * counted once a cycle.
 *
 * @param {{ marks: { stage: string | null, name: string }[] }[]} cycles
 * @param {string} stage
 * @returns {Record<string, number>}
 */
export function failuresByName(cycles, stage) {
  /** @type {Record<string, number>} */
  const counts = {}
  for (const cycle of cycles) {
    const names = new Set(cycle.marks.filter((mark) => mark.stage === stage).map((mark) => mark.name))
    for (const name of names) counts[name] = (counts[name] || 0) + 1
  }
  return counts
}

/** How many of a channel's last posts decide its colour. */
const RECENT_POSTS = 5

/**
 * A channel, from the log of what was posted to it (`lib/post-log.js`). An
 * entry is an attempt when it was sent or carries an error; a push that was
 * held back because no story cleared the bar is neither.
 *
 * @param {string} id
 * @param {string} name
 * @param {any} log
 * @returns {Row}
 */
function posted(id, name, log) {
  const attempts = (Array.isArray(log) ? log : []).filter((e) => e && (e.sent || e.error || e.response))
  const last = attempts.at(-1)
  const lastSent = attempts.findLast((e) => e.sent)
  const recent = attempts.slice(-RECENT_POSTS)
  const lost = recent.filter((e) => !e.sent).length
  /** @type {Status} */
  const status = !attempts.length ? 'unknown' : lost === recent.length ? 'red' : lost > 0 ? 'amber' : 'green'
  const error = last && !last.sent ? String(last.error ?? last.skipReason ?? 'not sent').slice(0, 120) : ''
  return {
    id, name, unit: 'sent', status, fetchedAt: last?.timestamp ?? null, dataAsOf: null,
    got: attempts.filter((e) => e.sent).length, expected: attempts.length, failed: null,
    note: [
      error && `last attempt: ${error}`,
      status !== 'green' && attempts.length ? `last sent ${lastSent ? String(lastSent.timestamp).slice(0, 10) : 'not in the log'}` : '',
      id === 'push' && last?.response?.tokens != null ? `${last.response.tokens} devices` : '',
    ].filter(Boolean).join(' · '),
  }
}

/**
 * A row for stages that end with a status: the last cycle that reached them,
 * and in how many of the cycles on record one of them failed.
 *
 * @param {string} id
 * @param {string} name
 * @param {string[]} stages
 * @param {CycleFacts[]} done
 * @returns {Row}
 */
function stageRow(id, name, stages, done) {
  /** @param {CycleFacts} c */
  const bad = (c) => stages.filter((s) => c.exits[s] != null && c.exits[s] !== 0)
  const reached = done.filter((c) => stages.some((s) => c.exits[s] != null))
  const last = reached[0]
  const lastBad = last ? bad(last) : []
  return {
    id, name, unit: '', fetchedAt: last?.startedAt ?? null, dataAsOf: null, got: null, expected: null,
    status: !last ? 'unknown' : lastBad.length ? 'red' : 'green',
    note: lastBad.length ? `${lastBad.map((s) => `${s} exit ${last.exits[s]}`).join(', ')}${last.cause ? ` — ${last.cause}` : ''}` : '',
    failed: { n: reached.filter((c) => bad(c).length > 0).length, of: reached.length },
  }
}
