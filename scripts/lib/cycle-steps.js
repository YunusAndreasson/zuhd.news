// The stages that are more than one command: the ones the shell script wrote
// as a paragraph of bash, each a function of the cycle here.
//
// `scripts/cycle/stages.js` is the list and names these; `lib/cycle-run.js`
// is what they are written with. Every line a stage prints, every argument it
// passes and the order it does things in is the script's, and the recordings
// in `lib/fixtures/cycle/` hold it to that.

import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CycleExit, captured, lineCount, pathspec, when } from './cycle-run.js'
import { pathOf } from './datasets.js'
import { modelFor } from './models.js'
import { ROOT } from './paths.js'

/** @typedef {import('./cycle-run.js').Cycle} Cycle */

// ── Sessions ─────────────────────────────────────────────────────────

// Common flags for all headless Claude CLI invocations (no --model: passed per stage).
//   --no-session-persistence   don't write resume state for headless calls
//   --setting-sources project  skip ~/.claude/settings.json — only project settings
//   --disable-slash-commands   skip user + project skills (cycle prompts are self-contained)
//   --strict-mcp-config        skip every MCP server (we never pass --mcp-config)
// Auto-memory still loads (tied to OAuth-compatible mode); prune memory files
// manually if their content shouldn't reach the cycle.
const CLAUDE_FLAGS = ['--no-session-persistence', '--setting-sources', 'project', '--disable-slash-commands', '--strict-mcp-config']

// Tool whitelist for Claude CLI (--dangerously-skip-permissions is blocked as root).
// Stage-specific tool sets: narrower access = fewer wrong turns.
// The selector needs no Bash: the feed is fetched before its session starts.
// The writer keeps Edit: Sonnet 5 self-revises just-written files with it, and
// without it stalls on permission prompts (43 articles lost 07-01→07-03).
const TOOLS = {
  selector: 'Read,Write,Glob,Grep',
  writer: 'Read,Write,Edit',
  editor: 'Read,Edit,Glob,Grep',
  tuner: 'Read,Write,Edit,Glob,Grep,Bash',
}

/**
 * A prompt file as `$(cat scripts/<name>)` read it: without the newlines at
 * its end, and empty when it is not there.
 *
 * @param {string} name
 */
function prompt(name) {
  try {
    return captured(readFileSync(join(ROOT, 'scripts', name), 'utf8'))
  } catch {
    return ''
  }
}

/**
 * The argv of a working session: one that reads and writes files with tools.
 *
 * @param {object} s
 * @param {number} s.timeout seconds, kept by `timeout`
 * @param {string} s.effort
 * @param {string} s.model
 * @param {string} [s.fallback] a second model, for when the first is not answering
 * @param {string} s.tools
 * @param {boolean} [s.tmp] let it reach /tmp, where the selection is
 * @param {number} s.turns
 * @param {string} s.prompt
 */
export function sessionArgv({ timeout, effort, model, fallback, tools, tmp = false, turns, prompt: text }) {
  return [
    'timeout', String(timeout), 'claude', ...CLAUDE_FLAGS,
    '--effort', effort, '--model', model, ...(fallback ? ['--fallback-model', fallback] : []),
    '--allowedTools', tools, ...(tmp ? ['--add-dir', '/tmp'] : []),
    '--max-turns', String(turns), '--exclude-dynamic-system-prompt-sections', '-p', text,
  ]
}

/**
 * The argv of a one-line call: no tools, one answer, 30 seconds.
 *
 * @param {string} model
 * @param {string} text
 */
export const lineArgv = (model, text) => ['timeout', '30', 'claude', ...CLAUDE_FLAGS, '--model', model, '--effort', 'medium', '--tools', '', '-p', text]

/**
 * The count `tally.js selection` prints, as the script took it: with
 * `|| echo 0` behind it, so a count that could not be taken is none.
 *
 * @param {Cycle} cycle
 */
async function selectionCount(cycle) {
  const { status, out } = await cycle.read(['node', 'scripts/cycle/tally.js', 'selection'])
  return status === 0 ? out : `${out}${out ? '\n' : ''}0`
}

// ── Stage 0: the feed ────────────────────────────────────────────────

/** @param {Cycle} cycle */
export async function fetchApi(cycle) {
  cycle.state.stage0 = cycle.timer()
  // NewsAPI.ai event-grouped fetch (6 queries = 10 tokens, + up to 8 per-event calls)
  rmSync(pathOf('feedApi'), { force: true })
  const status = await cycle.run(['node', 'scripts/fetch-news-api.js'], { route: 'errlog' })
  cycle.state.apiExit = status
  if (status !== 0) cycle.say(`⚠ API fetch failed (exit ${status}) — see log for error. RSS-only cycle.`)
  cycle.say(`API fetch: ${(await cycle.read(['node', 'scripts/cycle/tally.js', 'feed-api'])).out}`)
}

/** @param {Cycle} cycle */
export async function fetchRss(cycle) {
  // RSS niche sources (HN, 404 Media, Bellingcat, Mada Masr, etc.)
  const status = await cycle.run(['node', 'scripts/fetch-news.js'], { route: 'errlog' })
  if (status !== 0) cycle.say(`⚠ RSS fetch failed (exit ${status})`)
  cycle.say(`RSS fetch: ${(await cycle.read(['node', 'scripts/cycle/tally.js', 'feed-rss'])).out} stories`)
  // No feed, no cycle.
  if (cycle.state.apiExit !== 0 && status !== 0) {
    cycle.say('✗ Both API and RSS fetches failed — aborting cycle')
    throw new CycleExit(1)
  }
}

/** After the merge: the first row of the funnel. @param {Cycle} cycle */
export async function countFeed(cycle) {
  const stats = (await cycle.read(['node', 'scripts/cycle/tally.js', 'feed'])).out
  cycle.funnel.feed = stats
  cycle.say(`Merged feed: ${stats} — ${cycle.state.stage0()}s`)
}

// ── Stage 1: the selector ────────────────────────────────────────────

// How many stories a cycle picks follows how much news arrived since the last
// one (measured 2026-09-25 across 14 global outlets: 05:00 ≈11% of the day's
// publishing, 10:00 ≈16%, 14:00 ≈20%, 18:00 ≈28%, 22:00 ≈25%). A fixed 12-13
// made quiet cycles pad with floor-fillers and busy ones drop good stories.
// 11 is the floor because the category floors sum to 11.
/** @type {Record<string, number>} */
const PICK_TARGET = { '05': 11, 10: 12, 14: 13, 18: 15, 22: 15 }

/** @param {Cycle} cycle */
export async function selector(cycle) {
  const took = cycle.timer()
  let text = prompt('select-prompt.md')

  // Inject compact coverage map so selector understands today's topic landscape at a glance
  const coverage = (await cycle.read(['node', 'scripts/coverage-map.js'])).out
  if (coverage) {
    text += `

Do not re-select stories already covered in the last 24 hours. Here is recent coverage grouped by topic — avoid duplicating any of these angles:
<recent-coverage>
${coverage}
</recent-coverage>`
    cycle.say(`Injecting coverage map (${lineCount(coverage)} topic groups) into selector prompt`)
  }
  // Inject Wikipedia trending-gap signal — yesterday's most-read pages we haven't
  // covered. Free AQS call; fail-soft (empty output → no injection).
  const trending = (await cycle.read(['timeout', '15', 'node', 'scripts/trending-gaps.js'])).out
  if (trending) {
    text += `

Yesterday's most-read Wikipedia articles that zuhd.news has NOT covered in the last 7 days. Most entries are entertainment noise — ignore those. But if one is verifiable hard news in our categories AND the feed carries sources for it, treat it as a public-attention signal that the story deserves selection weight:
<trending-uncovered>
${trending}
</trending-uncovered>`
    cycle.say(`Injecting trending-gaps signal (${lineCount(trending)} titles) into selector prompt`)
  }
  // Inject the shares that moved with no story here to say why
  // (lib/company-gaps.js). The app charts each, and its card can explain a move
  // only from a story the site has run. Local read; fail-soft (empty → nothing).
  const movers = (await cycle.read(['timeout', '15', 'node', 'scripts/company-gaps.js'])).out
  if (movers) {
    text += `

Shares among the twenty largest companies that moved sharply over the past week, with no story on zuhd.news in a fortnight that says why. The app charts each one, and can explain a move only from a story the site has published. If the feed carries a report of what moved one — results, an order, a ruling, a deal, a ban — it is a strong economy or tech pick, and the Consequence rule still holds: say what moved it or who it lands on. If the feed has only the price, or only analyst talk, skip it; the list is a signal, never a quota.
<unexplained-movers>
${movers}
</unexplained-movers>`
    cycle.say(`Injecting unexplained-movers signal (${lineCount(movers)} companies) into selector prompt`)
  }
  const target = PICK_TARGET[cycle.startHour] ?? 13
  text += `

<cycle-target>
Select ${target} stories this cycle (${cycle.startHour}:00 UTC).
</cycle-target>`
  cycle.say(`Selection target: ${target} stories (${cycle.startHour}:00 UTC)`)

  const model = modelFor('selector', cycle.env)
  const session = modelFor('session', cycle.env)
  const argv = sessionArgv({ timeout: 1200, effort: 'medium', model, fallback: model !== session ? session : undefined, tools: TOOLS.selector, turns: 35, prompt: text })
  const selection = pathOf('selection')
  // `[ -s file ]`: there, and not empty.
  const wrote = () => existsSync(selection) && statSync(selection).size > 0

  let status = await cycle.run(argv)
  cycle.say(`Selector exit: ${status} — ${took()}s`)

  // Retry once if the selector exited cleanly but wrote no selection file —
  // a recurring failure mode where the model hallucinates a sandbox restriction
  // and returns prose instead of running the task. Roughly 8% of cycles in the
  // week of 2026-05-10 to 2026-05-17 failed this way. The `<runtime>` preamble
  // in select-prompt.md is the primary defence; this retry catches the residual.
  if (status === 0 && !wrote()) {
    cycle.say('Selector returned 0 but produced no selection file — retrying once')
    const again = cycle.timer()
    status = await cycle.run(argv)
    cycle.say(`Selector retry exit: ${status} — ${again()}s`)
  }

  // Abort if selector failed or produced no selection
  if (status !== 0) {
    cycle.say(`Selector failed (exit ${status}) — aborting cycle`)
    throw new CycleExit(1)
  }
  if (!wrote()) {
    cycle.say('No selection file produced after retry — skipping writer and editor')
    throw new CycleExit(0)
  }
  // Guard against empty JSON array (selector wrote [] with 0 stories)
  const count = await selectionCount(cycle)
  if (Number(count) === 0) {
    cycle.say('Selection is empty (0 stories) — skipping writer and editor')
    throw new CycleExit(0)
  }
  cycle.funnel.selected = Number(count)
  cycle.say(`Selection contains ${count} stories`)
  cycle.keepSelection('1-selected')
}

/**
 * After enrich. A recount: enrich drops entries it could not match to source
 * text, so without this the drops are charged to dedup and reported as
 * "already published".
 *
 * @param {Cycle} cycle
 */
export async function afterEnrich(cycle) {
  cycle.keepSelection('2-enriched')
  const count = await selectionCount(cycle)
  if (Number(count) === 0) {
    cycle.say('No selection entry could be matched to source text — skipping writer and editor')
    throw new CycleExit(0)
  }
  cycle.funnel.selected = Number(count)
}

/** After dedup: what is left is what the writer gets. @param {Cycle} cycle */
export async function afterDedup(cycle) {
  cycle.keepSelection('3-deduped')
  const count = await selectionCount(cycle)
  cycle.funnel.deduped = Number(count)
  const dropped = (cycle.funnel.selected ?? 0) - Number(count)
  if (dropped > 0) cycle.funnel.dedupNote = `${dropped} already published`
  if (Number(count) === 0) {
    cycle.say('All selections already published — skipping writer and editor')
    throw new CycleExit(0)
  }
}

// ── Stage 2: the writer ──────────────────────────────────────────────

/**
 * The articles the working tree holds that the last commit does not: modified
 * and untracked, as two calls to git, one name a line.
 *
 * @param {Cycle} cycle
 */
async function changedArticles(cycle) {
  const edited = await cycle.read(['git', 'diff', '--name-only', pathspec('articles')])
  const fresh = await cycle.read(['git', 'ls-files', '--others', '--exclude-standard', pathspec('articles')])
  return [edited.out, fresh.out].filter(Boolean).join('\n')
}

/** @param {Cycle} cycle */
export async function writer(cycle) {
  const took = cycle.timer()
  // --add-dir /tmp: without it, whether the model treats the selection as
  // reachable is left to its own judgement, and since ~2026-08-01 it has
  // sometimes decided no ("File access ... is blocked in this session — it's
  // outside the allowed working directory"), killing the cycle. Observed 4 of
  // ~40 cycles, 2 of them zero-publish; the retry below re-issues the same
  // prompt and reproduces the refusal rather than clearing it, so this is the
  // actual fix rather than the safety net.
  const argv = sessionArgv({ timeout: 1800, effort: 'medium', model: modelFor('session', cycle.env), tools: TOOLS.writer, tmp: true, turns: 60, prompt: prompt('write-prompt.md') })

  let status = await cycle.run(argv)
  cycle.say(`Writer exit: ${status} — ${took()}s`)

  // Retry once if the writer produced nothing, whatever its exit code.
  //
  // This was gated on a timeout, the API-stall mode where `claude -p`
  // idle-blocks for the full 1800s. That is one way to write nothing and it
  // turned out to be the rare one. Over 2026-07-25→30, five of 29 cycles
  // published zero and the retry fired for none of them, because the writer
  // died in the first seventeen seconds every time and only twice with a
  // non-zero status: it asked for approval to use a tool it does not have, it
  // said it saw no request, its tool call could not be parsed. Three different
  // transient flakes, one outcome, and an exit code that says nothing useful
  // about any of them. So the condition is the one that matters: did this run
  // write an article.
  //
  // Safe to retry unconditionally here: an empty selection already ended the
  // cycle, so reaching this line having written nothing is always a failure
  // and never a legitimate quiet cycle. A slow-but-productive run keeps its
  // partial output — the gate is articles, not time.
  if (!(await changedArticles(cycle))) {
    cycle.say(`Writer wrote no articles (exit ${status}) — retrying once`)
    const again = cycle.timer()
    status = await cycle.run(argv)
    cycle.say(`Writer retry exit: ${status} — ${again()}s`)
  }
  if (status !== 0) cycle.say(`Writer failed (exit ${status}) — continuing with any partial output`)

  // Capture new articles from this cycle (modified + untracked). Through the
  // real `sort`: its order under the service's locale is not byte order, and
  // this list goes into the editor's prompt.
  const sorted = (await cycle.read(['sort', '-u'], { input: `${await changedArticles(cycle)}\n`, err: 'journal' })).out
  if (!sorted) {
    cycle.say('No new articles — skipping editor and deploy')
    return
  }
  cycle.state.articles = sorted
  cycle.state.newCount = lineCount(sorted)
  cycle.funnel.written = cycle.state.newCount
  cycle.say(`Found ${cycle.state.newCount} new/modified articles`)
  // Save the list so the editor checks only this batch (not all untracked files)
  writeFileSync(pathOf('newArticles'), `${sorted}\n`)
}

// ── Stage 3: the editor ──────────────────────────────────────────────

/** @param {Cycle} cycle */
export async function editor(cycle) {
  const took = cycle.timer()
  const check = prompt('check-prompt.md')
  const list = captured(readFileSync(pathOf('newArticles'), 'utf8'))
  // Measure body character counts — gives the editor exact data on which articles need trimming
  const lengths = (await cycle.read(['node', 'scripts/body-lengths.js'])).out
  // Hooks that say the title again (lib/title-echo.js) — a list for the
  // editor's title-echo test, never a gate: about 7 in 10 flags are echoes.
  const echoes = (await cycle.read(['node', 'scripts/flag-title-echo.js', pathOf('newArticles')])).out
  const addendum = `

Check only the files listed in <files> below (this cycle's batch). Other untracked articles belong to earlier runs.

<files>
${list}
</files>

<body-lengths>
${lengths}
</body-lengths>

<title-echo>
${echoes}
</title-echo>`
  // --add-dir /tmp: the editor's first rule is checking figures and quotes
  // against the sources, and the source text lives only in the selection.
  // Without it the editor said, every cycle, that it "only saw them as links" —
  // the fabricated-quote check was an honour system.
  const argv = sessionArgv({ timeout: 1800, effort: cycle.env.ZUHD_EDITOR_EFFORT || 'low', model: modelFor('session', cycle.env), tools: TOOLS.editor, tmp: true, turns: 50, prompt: `${check}${addendum}` })

  let status = await cycle.run(argv)
  cycle.say(`Editor exit: ${status} — ${took()}s`)
  // Retry once on timeout — parity with selector/writer. Editing is idempotent
  // (rule-checks against files on disk), so a partial first pass is safe to redo.
  if (status === 124) {
    cycle.say('Editor timed out — retrying once')
    const again = cycle.timer()
    status = await cycle.run(argv)
    cycle.say(`Editor retry exit: ${status} — ${again()}s`)
  }
}

// ── Stage 3b: validate, build, publish ───────────────────────────────

/**
 * Validate new articles — move malformed ones aside so they don't get
 * deployed. What the validator quarantined is counted from its own output.
 * This was `find -name '*.bad' -newer "$LOG"`, which is always 0: a rename
 * keeps the article's mtime and the log is appended to right after, so the
 * funnel and the commit message counted quarantined articles as published.
 *
 * @param {Cycle} cycle
 */
export async function validate(cycle) {
  const { status, out, raw } = await cycle.readBoth(['node', 'scripts/validate-articles.js'])
  // Read, and into the log, but not the journal: the script took it through a
  // `tee` whose own stdout was the variable.
  cycle.logOnly(raw)
  cycle.say(`Validate exit: ${status}`)
  const bad = out.split('\n').filter((l) => l.startsWith('SKIP (')).length
  cycle.funnel.validated = cycle.state.newCount - bad
  if (bad > 0) cycle.funnel.validNote = `${bad} removed`
}

/** @param {Cycle} cycle */
export async function build(cycle) {
  const status = await cycle.build()
  cycle.state.buildExit = status
  cycle.say(`Build exit: ${status}`)
  if (status !== 0) cycle.say('Build failed — skipping deploy')
}

const DEPLOY = ['npx', 'wrangler', 'pages', 'deploy', 'dist', '--project-name', 'zuhd-news', '--branch', 'master', '--commit-dirty=true']

/** Commit the cycle's articles, reconcile with the remote, and deploy. @param {Cycle} cycle */
export async function publish(cycle) {
  await cycle.commitOnly(`Editorial cycle ${when.spoken(cycle.clock())}: ${cycle.funnel.validated ?? cycle.state.newCount} articles`, [
    'articles', 'lastCycle', 'storyLedger', 'contextBriefs', 'swedish',
  ])
  await cycle.sync()
  const status = await cycle.run(DEPLOY)
  cycle.state.deployExit = status
  cycle.say(`Deploy exit: ${status}`)
  if (status === 0) cycle.funnel.published = cycle.funnel.validated
}

const PUSH = (/** @type {string} */ secret, /** @type {string} */ body) => [
  'curl', '-s', '-X', 'POST', 'https://zuhd.news/api/push', '-H', `Authorization: Bearer ${secret}`, '-H', 'Content-Type: application/json', '-d', body,
]

/**
 * Push notifications for breaking stories, and the same story mirrored to X
 * and Instagram.
 *
 * @param {Cycle} cycle
 */
export async function breakingPush(cycle) {
  let payload = (await cycle.read(['node', 'scripts/cycle/breaking-push.js', 'pick'], { err: 'journal' })).out
  const secret = cycle.env.PUSH_SECRET
  if (!payload || !secret) return

  // Craft notification body with Claude — the article lead isn't written for push
  const slug = (await cycle.read(['node', 'scripts/cycle/push-payload.js', 'slug'], { input: `${payload}\n`, err: 'journal' })).out
  const article = join(pathOf('articles'), `${slug}.md`)
  if (slug && existsSync(article)) {
    const text = captured(readFileSync(article, 'utf8'))
    const line = (await cycle.read(lineArgv(modelFor('session', cycle.env), `${prompt('push-prompt.md')}\n${text}`))).out
    if (line) {
      // The title and the first line of the answer go into the payload in one
      // pass, which fails loudly if no line can be taken from it.
      const injected = (await cycle.read(['node', 'scripts/cycle/push-payload.js', 'inject'], { input: `${payload}\n`, env: { NOTIF: line }, err: 'log' })).out
      if (injected) {
        payload = injected
      } else {
        cycle.say('⚠ Push body injection failed — skipping this push')
        payload = ''
      }
    }
  }
  if (!payload) return

  cycle.say(`Pushing breaking news: ${payload}`)
  const response = (await cycle.read(PUSH(secret, payload), { err: 'journal' })).out
  cycle.say(response)
  // Update push log: title and body come from the sent JSON itself
  await cycle.run(['node', 'scripts/cycle/breaking-push.js', 'sent'], { route: 'errlog', env: { BJSON: payload, PRESP: response } })
  if (!slug) return
  // Mirror the same breaking story to X/Twitter as one plain-text tweet.
  // Non-fatal: the tweet step condenses via Claude, signs OAuth 1.0a, and
  // dedups via content/.tweet-log.json; any failure must not abort the cycle.
  if ((await cycle.run(['timeout', '60', 'node', 'scripts/post-to-twitter.js', '--slug', slug])) !== 0) cycle.say('⚠ tweet step failed (non-fatal)')
  // Mirror the same breaking story to Instagram: the /api/ig/{slug}.jpg card
  // (deployed above) plus a Claude-written caption, a first-comment article
  // link, and a Story cross-post. Non-fatal, deduped via the Instagram log.
  if ((await cycle.run(['timeout', '90', 'node', 'scripts/post-to-instagram.js', '--slug', slug])) !== 0) cycle.say('⚠ instagram step failed (non-fatal)')
}

// ── Stage 4: the audio briefing ──────────────────────────────────────

/** @param {Cycle} cycle */
export async function briefing(cycle) {
  const status = await cycle.run(['timeout', '900', 'node', 'scripts/generate-briefing.js'])
  cycle.say(`Briefing exit: ${status}`)
  if (status !== 0) return

  cycle.say('Rebuilding and redeploying with audio...')
  const built = await cycle.build()
  cycle.say(`Audio rebuild exit: ${built}`)
  await cycle.commitOnly(`Audio briefing ${when.day(cycle.clock())}`, ['audio'])
  await cycle.sync()
  let deployed = 1
  if (built === 0) {
    deployed = await cycle.run(DEPLOY)
  } else {
    cycle.say("WARNING: audio rebuild failed — not deploying; the next cycle's build ships the briefing")
  }
  cycle.say(`Audio deploy exit: ${deployed}`)

  // Stage 4b: Daily briefing push notification — fires once per day after the
  // audio is live. Body is a Claude-crafted topic line ("Hormuz $106 · BJP
  // defects · DeepSeek V4 ships") so the reader learns what's in the briefing
  // without needing to open the app first. Idempotent via the endpoint's 7-day
  // dedup keyed on the synthetic slug `briefing-<date>`.
  const secret = cycle.env.PUSH_SECRET
  if (deployed !== 0 || !secret) return
  const date = when.day(cycle.clock())
  // Top stories for the topic line — read straight from the ledger so no
  // second model pass is needed to rank.
  const top = (await cycle.read(['node', 'scripts/cycle/push-payload.js', 'briefing-top'], { err: 'log' })).out
  if (!top || top === '[]') {
    cycle.say('Briefing push skipped: no top stories in ledger')
    return
  }
  // The first line of the answer: `| head -1 | tr -d '\n'`.
  const body = (await cycle.read(lineArgv(modelFor('session', cycle.env), `${prompt('briefing-push-prompt.md')}\n${top}`))).out.split('\n')[0]
  if (!body) {
    cycle.say('⚠ Empty briefing-body from Claude — skipping push')
    return
  }
  const payload = (await cycle.read(['node', 'scripts/cycle/push-payload.js', 'briefing'], { env: { BODY: body, DATE: date }, err: 'log' })).out
  if (!payload) {
    cycle.say('⚠ Briefing push payload assembly failed — skipping')
    return
  }
  cycle.say(`Pushing daily briefing: ${payload}`)
  await cycle.run(PUSH(secret, payload))
  cycle.say()
}

// ── Stage 6: the daily tuning ────────────────────────────────────────

/**
 * Compute the day's metrics, then let the tuning session evaluate experiments
 * and propose bounded parameter changes.
 *
 * @param {Cycle} cycle
 */
export async function tuning(cycle) {
  const took = cycle.timer()
  // Compute metrics deterministically (no LLM) — Claude reads the result
  if ((await cycle.run(['node', 'scripts/compute-metrics.js'], { route: 'errlog', into: pathOf('metrics') })) !== 0) {
    cycle.say('Metrics computation failed — skipping tuning')
    return
  }
  // Opus for daily tuning — proposes bounded parameter changes that govern the
  // next day's 5 cycles. Daily cadence makes Opus affordable; medium effort is
  // enough since the metric inputs are deterministic. 600 s: Opus medium runs
  // slower per turn than Sonnet medium, and this keeps 15 turns in scope.
  const status = await cycle.run(sessionArgv({ timeout: 600, effort: 'medium', model: modelFor('tuner', cycle.env), tools: TOOLS.tuner, turns: 15, prompt: prompt('tune-prompt.md') }))
  cycle.say(status === 124 ? `Tuning exit: 124 (TIMEOUT — exceeded 600s budget; bump if recurring) — ${took()}s` : `Tuning exit: ${status} — ${took()}s`)

  // The tuning session handles its own git workflow (experiment branches and
  // merges). Here only the tracking files are committed, if they changed.
  /** @type {('experiments' | 'dailyAudit' | 'dailyAuditNotes')[]} */
  const tracked = ['experiments', 'dailyAudit', 'dailyAuditNotes']
  const changed = (await cycle.read(['git', 'diff', '--name-only', ...tracked.map(pathspec)])).out
  const fresh = (await cycle.read(['git', 'ls-files', '--others', '--exclude-standard', pathspec('dailyAudit')])).out
  if (!changed && !fresh) return
  await cycle.commitOnly(`Daily audit ${when.day(cycle.clock())}`, tracked)
  await cycle.sync()
}
