// One reader for the cycle log, and the record it yields.
//
// A cycle's outcome existed only as lines in `logs/cycle-<stamp>.log`, and five
// programs each scraped them with regexes of their own: the dashboard, the
// daily metrics, the log ratchets, the replay scorer and the cycle itself.
// About 45 patterns, already apart: four of the dashboard's had no emitter
// left, none of them saw a retry line, and one counted every stage's `✗` as a
// dead RSS feed. This is the one place that knows what the lines look like.
//
// Every marker is matched from the start of a line, and the funnel is read
// only from its own block. The log also carries four model transcripts, and a
// model is free to write "Published: 12" in the middle of one.

import { TUNING_HOUR } from './cycle-run.js'
import { RUN_RECORD_SCHEMA } from './schema.js'

/**
 * `Source angles`, `AI models`, `Dispatch (new-only)` → `source-angles`, `ai-models`, `dispatch-new-only`.
 *
 * @param {string} name
 */
const stageId = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** @param {string | null | undefined} s */
const int = (s) => (s == null ? null : Number.parseInt(s, 10))

// `Selector exit: 0 — 188s`, `Build exit: 0`, `Writer retry exit: 1 — 9s`,
// `Tuning exit: 124 (TIMEOUT — exceeded 600s budget; bump if recurring) — 601s`.
// A name is one to three words: that is every stage, and short of a sentence.
const STAGE_EXIT = /^([A-Z][A-Za-z]*(?: [A-Za-z]+){0,2}?)( retry)? exit: (\d+)(?: \([^)]*\))?(?: — (\d+)s)?$/
// The stages that print how long they took and no status.
const STAGE_SECONDS = /^(Dispatch(?: \(new-only\))?|Event dispatch|Analytics fetch) — (\d+)s$/
const HEADER = /^--- Stage ([0-9][0-9a-z.]*): (.+) ---$/
const SKIPPED = /^(.*?) \(skipped — (.+)\)$/
const PUSH_RESPONSE = /^\{"pushed":\d+.*\}$/
// A stage's own complaint: `  ✗ Bellingcat: HTTP 503`.
const MARK = /✗ (.+?): (.+)/
const FUNNEL = '=== Funnel ==='

/** The lines that end the editorial path early, in the order a cycle can print them. */
const ABORTS = [
  /^✗ Both API and RSS fetches failed/,
  /^Selector failed \(exit \d+\)/,
  /^No selection file produced after retry/,
  /^Selection is empty \(0 stories\)/,
  /^No selection entry could be matched to source text/,
  /^All selections already published/,
  /^No new articles — skipping editor and deploy/,
  /^Build failed — skipping deploy/,
]

/**
 * `JSON.parse`, or null: a line cut short by a kill is still a line.
 *
 * @param {string} text
 */
function jsonOrNull(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * What one cycle log says.
 *
 * @param {string} text
 */
export function parseCycleLog(text) {
  const lines = String(text || '').split('\n')

  /** @type {{ n: string, title: string, skipped: string | null }[]} */
  const headers = []
  /** @type {Map<string, { id: string, attempts: { exit: number | null, seconds: number | null }[] }>} */
  const stages = new Map()
  /** @type {{ reason: string, file: string }[]} */
  const skips = []
  /** @type {{ sha: string, subject: string }[]} */
  const commits = []
  /** @type {string[]} */
  const created = []
  /** @type {{ kind: 'breaking' | 'briefing', payload: any, response: any }[]} */
  const pushes = []
  /** @type {{ stage: string | null, name: string, message: string }[]} */
  const marks = []
  /** @type {string[]} */
  const warnings = []

  const feed = {
    apiStories: /** @type {number | null} */ (null),
    apiEvents: /** @type {number | null} */ (null),
    rssStories: /** @type {number | null} */ (null),
    multi: /** @type {number | null} */ (null),
    niche: /** @type {number | null} */ (null),
    seconds: /** @type {number | null} */ (null),
  }
  const selection = {
    target: /** @type {number | null} */ (null),
    count: /** @type {number | null} */ (null),
    dedupBefore: /** @type {number | null} */ (null),
    dedupAfter: /** @type {number | null} */ (null),
    newArticles: /** @type {number | null} */ (null),
  }
  const out = {
    startedText: /** @type {string | null} */ (null),
    finishedText: /** @type {string | null} */ (null),
    totalSeconds: /** @type {number | null} */ (null),
    newsApiTokens: /** @type {number | null} */ (null),
    validated: /** @type {number | null} */ (null),
    removed: /** @type {number | null} */ (null),
    abort: /** @type {string | null} */ (null),
    alert: /** @type {string | null} */ (null),
  }

  /** The stage whose header was printed last. */
  let current = /** @type {string | null} */ (null)
  /** The push whose answer is the next `{"pushed":…}` line. */
  let awaiting = /** @type {{ kind: 'breaking' | 'briefing', payload: any, response: any } | null} */ (null)

  /** @type {(name: string, exit: number | null, seconds: number | null) => void} */
  const attempt = (name, exit, seconds) => {
    const id = stageId(name)
    /** @type {{ id: string, attempts: { exit: number | null, seconds: number | null }[] }} */
    const stage = stages.get(id) ?? { id, attempts: [] }
    stage.attempts.push({ exit, seconds })
    stages.set(id, stage)
  }

  // One line is one thing: the first pattern that matches takes it.
  /** @type {[RegExp, (m: RegExpMatchArray) => void][]} */
  const rules = [
    [HEADER, (m) => {
      const skip = m[2].match(SKIPPED)
      headers.push({ n: m[1], title: skip ? skip[1] : m[2], skipped: skip ? skip[2] : null })
      current = m[1]
    }],
    [STAGE_EXIT, (m) => attempt(m[1], int(m[3]), int(m[4]))],
    [STAGE_SECONDS, (m) => attempt(m[1], null, int(m[2]))],
    // `failed — 2s` when the merged feed could not be read back.
    [/^Merged feed: (?:(\d+) multi \+ (\d+) niche|.*?) — (\d+)s$/, (m) => {
      feed.multi = int(m[1])
      feed.niche = int(m[2])
      feed.seconds = int(m[3])
    }],
    [/^API fetch: (\d+) stories from (\d+) events$/, (m) => {
      feed.apiStories = int(m[1])
      feed.apiEvents = int(m[2])
    }],
    [/^RSS fetch: (\d+) stories$/, (m) => {
      feed.rssStories = int(m[1])
    }],
    [/^NewsAPI tokens this cycle:\s*~?(\d+)/, (m) => {
      out.newsApiTokens = int(m[1])
    }],
    [/^Selection target: (\d+) stories/, (m) => {
      selection.target = int(m[1])
    }],
    [/^Selection contains (\d+) stories$/, (m) => {
      selection.count = int(m[1])
    }],
    [/^Deduped selection: (\d+) → (\d+)/, (m) => {
      selection.dedupBefore = int(m[1])
      selection.dedupAfter = int(m[2])
    }],
    [/^Found (\d+) new\/modified articles$/, (m) => {
      selection.newArticles = int(m[1])
    }],
    [/^SKIP \((.+)\): (.+)$/, (m) => {
      skips.push({ reason: m[1], file: m[2] })
    }],
    [/^Validated (\d+) articles, (\d+) removed/, (m) => {
      out.validated = int(m[1])
      out.removed = int(m[2])
    }],
    [/^\[[\w./-]+ ([0-9a-f]{7,40})\] (.+)$/, (m) => {
      commits.push({ sha: m[1], subject: m[2] })
    }],
    [/^ create mode \d+ content\/articles\/(.+)\.md$/, (m) => {
      created.push(m[1])
    }],
    [/^Pushing (breaking news|daily briefing): (\{.*\})$/, (m) => {
      awaiting = { kind: m[1] === 'breaking news' ? 'breaking' : 'briefing', payload: jsonOrNull(m[2]), response: null }
      pushes.push(awaiting)
    }],
    [/^(?:WARNING: |⚠ )/, (m) => {
      warnings.push(String(m.input).slice(0, 240))
    }],
    [/^ALERT: (.+)$/, (m) => {
      out.alert = m[1]
    }],
    [/^Started: (.+)$/, (m) => {
      out.startedText ??= m[1]
    }],
    [/^Finished: (.+?) — total (\d+)s$/, (m) => {
      out.finishedText = m[1]
      out.totalSeconds = int(m[2])
    }],
  ]

  for (const line of lines) {
    if (awaiting && PUSH_RESPONSE.test(line)) {
      awaiting.response = jsonOrNull(line)
      awaiting = null
    } else {
      let taken = false
      for (const [re, on] of rules) {
        const m = line.match(re)
        if (m) {
          on(m)
          taken = true
          break
        }
      }
      if (!taken && !out.abort && ABORTS.some((re) => re.test(line))) out.abort = line
    }
    // Under the stage it was printed in, and apart from the rules above: a
    // warning line can carry one too.
    const mark = line.match(MARK)
    if (mark) marks.push({ stage: current, name: mark[1], message: mark[2] })
  }

  return {
    ...out,
    feed,
    selection,
    headers,
    stages: [...stages.values()],
    skips,
    commits,
    created,
    pushes,
    marks,
    warnings,
    funnel: parseFunnel(lines),
  }
}

/**
 * The block the exit trap prints, read from the last `=== Funnel ===` down.
 * Null when the cycle never reached its trap.
 *
 * @param {string[]} lines
 */
function parseFunnel(lines) {
  const at = lines.lastIndexOf(FUNNEL)
  if (at === -1) return null
  const block = lines.slice(at + 1).join('\n')
  /** @param {RegExp} re */
  const num = (re) => int(block.match(re)?.[1])
  const deduped = block.match(/^Deduped:\s+(\d+)(?:\s+\((.+)\))?/m)
  const validated = block.match(/^Validated:\s+(\d+)(?:\s+\((.+)\))?/m)
  return {
    feed: block.match(/^Feed:\s+(.+)$/m)?.[1] ?? null,
    selected: num(/^Selected:\s+(\d+)/m),
    deduped: int(deduped?.[1]),
    dedupNote: deduped?.[2] ?? null,
    written: num(/^Written:\s+(\d+)/m),
    validated: int(validated?.[1]),
    validNote: validated?.[2] ?? null,
    published: num(/^Published:\s+(\d+)/m),
  }
}

/**
 * `cycle-2026-10-08_1804.log` → `2026-10-08_1804`, or null.
 *
 * @param {string} filename
 */
export function cycleIdOf(filename) {
  return String(filename).match(/cycle-(\d{4}-\d{2}-\d{2}_\d{4})\.log$/)?.[1] ?? null
}

/**
 * `2026-10-08_1804` → `cycle-2026-10-08_1804.log`: the way back. A name is a
 * cycle's log, and nothing else, when it is the name of its own id.
 *
 * @param {string} id
 */
export const cycleLogName = (id) => `cycle-${id}.log`

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * `date`'s default output, as the log's `Started:` and `Finished:` lines carry
 * it, to ISO: `Thu Oct  8 06:04:59 PM UTC 2026`, or the 24-hour form a C
 * locale prints. Only UTC is read; anything else is null, not a guess.
 *
 * @param {string | null | undefined} text
 * @returns {string | null}
 */
export function isoFromDateOutput(text) {
  const m = String(text || '').match(/^\w{3} (\w{3}) +(\d{1,2}) (\d{1,2}):(\d{2}):(\d{2})(?: (AM|PM))? UTC (\d{4})$/)
  if (!m) return null
  const month = MONTHS.indexOf(m[1])
  if (month === -1) return null
  let hour = Number(m[3])
  if (m[6] === 'PM' && hour < 12) hour += 12
  if (m[6] === 'AM' && hour === 12) hour = 0
  const at = new Date(Date.UTC(Number(m[7]), month, Number(m[2]), hour, Number(m[4]), Number(m[5])))
  return at.toISOString().replace('.000Z', 'Z')
}

/**
 * `content/articles/2026-10-08-x.md` → `2026-10-08-x`.
 *
 * @param {string} file
 */
export const slugOf = (file) => String(file).replace(/^.*\//, '').replace(/\.md$/, '')

/**
 * Which scheduled jobs the cycle carried. The trap's own hours when it passed
 * them; otherwise the headers, which say it for any cycle that got as far as
 * printing them. A cycle that ended in the editorial path printed none, and
 * the answer is null: the daily hour has moved before, so the clock in an old
 * log's name is not evidence.
 *
 * @param {{ n: string, skipped: string | null }[]} headers
 * @param {{ startHour?: string | null, dailyHour?: string | null }} known
 * @param {string | null} startedAt
 */
function jobsOf(headers, known, startedAt) {
  if (known.startHour && known.dailyHour) {
    const tuning = known.startHour === TUNING_HOUR
    const sunday = startedAt ? new Date(startedAt).getUTCDay() === 0 : false
    return { daily: known.startHour === known.dailyHour, tuning, weekly: tuning && sunday }
  }
  /** @param {string} n */
  const ran = (n) => {
    const h = headers.find((x) => x.n === n)
    return h ? !h.skipped : null
  }
  const [daily, weekly, tuning] = [ran('4'), ran('5'), ran('6')]
  if (daily === null || weekly === null || tuning === null) return null
  return { daily, tuning, weekly }
}

/**
 * The record of one cycle, from its parsed log and what only the caller
 * knows. Everything in `known` but the id is optional: a record rebuilt from
 * an old log has the log and nothing else.
 *
 * @param {ReturnType<typeof parseCycleLog>} log
 * @param {{ id: string, exit?: number | null, startedAt?: string | null, gitHead?: string | null,
 *   scriptsDirty?: boolean | null, startHour?: string | null, dailyHour?: string | null,
 *   written?: string[] }} known `written` is the slugs the writer left this cycle
 * @returns {import('./schema.js').RunRecord}
 */
export function runRecord(log, known) {
  const startedAt = known.startedAt || isoFromDateOutput(log.startedText)
  /** @param {string} id */
  const lastExit = (id) => log.stages.find((s) => s.id === id)?.attempts.at(-1)?.exit ?? null

  const funnel = log.funnel
  const alreadyPublished = funnel?.dedupNote?.match(/(\d+) already published/)

  // An article is out when a deploy carrying it succeeded: the cycle's own, or
  // the audio pass's second one on the daily cycle.
  const deployed = lastExit('deploy') === 0 || lastExit('audio-deploy') === 0
  const quarantined = new Map(log.skips.map((s) => [slugOf(s.file), s.reason]))
  /** @type {import('./schema.js').RunArticle[]} */
  const articles = [...quarantined].map(([slug, reason]) => ({ slug, outcome: 'quarantined', reason }))
  for (const slug of new Set([...log.created, ...(known.written ?? [])])) {
    if (!quarantined.has(slug)) articles.push({ slug, outcome: deployed ? 'published' : 'unpublished' })
  }

  return {
    schema: RUN_RECORD_SCHEMA,
    source: 'log',
    id: known.id,
    startedAt,
    finishedAt: isoFromDateOutput(log.finishedText),
    totalSeconds: log.totalSeconds,
    exit: known.exit ?? null,
    jobs: jobsOf(log.headers, known, startedAt),
    git: { head: known.gitHead || null, scriptsDirty: known.scriptsDirty ?? null },
    ran: log.headers.filter((h) => !h.skipped).map((h) => h.n),
    stages: log.stages.map(({ id, attempts }) => ({
      id,
      exit: attempts.at(-1)?.exit ?? null,
      seconds: attempts.at(-1)?.seconds ?? null,
      retried: attempts.length > 1,
      ...(attempts.length > 1 ? { attempts } : {}),
    })),
    feed: {
      apiStories: log.feed.apiStories,
      apiEvents: log.feed.apiEvents,
      rssStories: log.feed.rssStories,
      multi: log.feed.multi,
      niche: log.feed.niche,
    },
    funnel: {
      target: log.selection.target,
      selected: funnel?.selected ?? null,
      deduped: funnel?.deduped ?? null,
      alreadyPublished: funnel ? (int(alreadyPublished?.[1]) ?? 0) : null,
      written: funnel?.written ?? null,
      validated: funnel?.validated ?? null,
      removed: log.removed,
      published: funnel?.published ?? null,
    },
    commits: log.commits,
    pushes: log.pushes.map((p) => ({
      kind: p.kind,
      slug: p.payload?.articles?.[0]?.slug ?? null,
      pushed: typeof p.response?.pushed === 'number' ? p.response.pushed : null,
    })),
    newsApiTokens: log.newsApiTokens,
    abort: log.abort,
    alert: log.alert,
    warnings: log.warnings,
    articles,
  }
}
