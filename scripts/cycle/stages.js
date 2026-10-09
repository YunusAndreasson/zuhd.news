// The cycle, as a list.
//
// Each entry is one stage: what it runs, for how long at most, where its
// output goes, what the log says of it, and when it runs at all. The order of
// the list is the order of the cycle. `scripts/cycle/run.js` runs it;
// `lib/cycle-run.js` is how; the stages that are more than one command are
// functions in `lib/cycle-steps.js`, named here.
//
// This was `run-cycle.sh`, where the same facts were spread through a
// thousand lines of bash. To see what a given cycle would run:
//
//   node scripts/cycle/run.js --plan --at 22 --dow 7

import { rmSync } from 'node:fs'
import { DAILY_HOUR, when } from '../lib/cycle-run.js'
import * as steps from '../lib/cycle-steps.js'
import { pathOf } from '../lib/datasets.js'

/** @typedef {import('../lib/cycle-run.js').Cycle} Cycle */

/**
 * @typedef {object} Stage
 * @property {string} id
 * @property {string} [number] the stage's number in the log's headers: `0`, `3.4b2`
 * @property {string} [title] with `number`, the header it opens with: `--- Stage 3.4: Trends fetch ---`
 *
 * @property {'daily' | 'not-daily' | 'tuning' | 'weekly'} [on] the cycles it runs in; every cycle when absent
 * @property {(cycle: Cycle) => string} [skipped] what its header says in a cycle it does not run in; no header when absent
 * @property {'articles' | 'built' | 'deployed'} [needs] what the cycle must have by then: new articles from the
 *   writer, a build that succeeded, a deploy that succeeded. A stage whose need is not met is passed over in silence.
 *
 * @property {string[]} [command] what it runs, found through PATH. Never imported: the cycle pulls half way
 *   through, and what runs after the pull is the file as pulled.
 * @property {number} [timeout] seconds, kept by `timeout`, whose status (124) is the stage's when it runs out
 * @property {import('../lib/cycle-run.js').Route} [route] where its output goes; the log and the journal when absent
 * @property {(cycle: Cycle) => void | Promise<void>} [run] in place of `command`, for a stage that is more than one
 *
 * @property {(cycle: Cycle) => void} [before] done first, after the header
 * @property {string} [warning] the line the log gets when it exits non-zero. The cycle goes on either way: only a
 *   stage's own `run` can end one.
 * @property {string} [exit] the name in its `<name> exit: <status>` line
 * @property {boolean} [timed] end that line with how long it took
 * @property {string} [took] or a line with only the time: `<took> — 41s`
 * @property {{ message: string, datasets: (keyof typeof import('../lib/datasets.js').DATASETS)[] }} [commit] what it
 *   leaves is committed: these datasets (`lib/datasets.js`), under this message and the minute
 * @property {(cycle: Cycle) => void | Promise<void>} [after] done last: a count, a kept copy, an early end to the cycle
 */

/** A snapshot stage: a fetcher with a deadline whose output goes to the log alone. Fail-soft: the last good snapshot stays. */
const snapshot = (/** @type {string} */ id, /** @type {string} */ number, /** @type {string} */ title, /** @type {number} */ timeout, /** @type {string} */ exit) =>
  /** @type {Stage} */ ({ id, number, title, needs: 'articles', command: ['node', `scripts/${id}.js`], timeout, route: 'log', exit, timed: true })

/** @type {Stage[]} */
export const STAGES = [
  // ── Stage 0: the feed ───────────────────────────────────────────────
  { id: 'fetch-news-api', number: '0', title: 'API + RSS feed fetch', run: steps.fetchApi },
  { id: 'fetch-news', run: steps.fetchRss },
  { id: 'merge-feeds', command: ['node', 'scripts/merge-feeds.js'], route: 'errlog', exit: 'Merge', after: steps.countFeed },
  // Remove stories that match already-published articles.
  { id: 'prefilter-feed', command: ['node', 'scripts/prefilter-feed.js'], exit: 'Prefilter' },

  // ── Stage 1: the selection ──────────────────────────────────────────
  { id: 'selector', number: '1', title: 'Selector', run: steps.selector },
  // The selector reads a feed without bodies to save tokens; they are put back here for the writer.
  { id: 'enrich-selection', command: ['node', 'scripts/enrich-selection.js'], exit: 'Enrich', after: steps.afterEnrich },
  // Before the ledger, so only stories that are new enter it.
  { id: 'dedup-selection', command: ['node', 'scripts/dedup-selection.js'], exit: 'Dedup', after: steps.afterDedup },
  { id: 'update-ledger', command: ['node', 'scripts/update-ledger.js'], exit: 'Ledger' },
  // Live indicator levels, so the writer can cite a number rather than say "oil prices fell".
  { id: 'attach-indicators', command: ['node', 'scripts/attach-indicators.js'], exit: 'Indicators', after: (cycle) => cycle.keepSelection('4-offered') },

  // ── Stage 2: the writer ─────────────────────────────────────────────
  { id: 'writer', number: '2', title: 'Writer', run: steps.writer },
  // Frontmatter the selection already holds, copied in without a model.
  { id: 'scaffold-articles', needs: 'articles', command: ['node', 'scripts/scaffold-articles.js'], exit: 'Scaffold' },

  // ── Stage 3: the editor, and what is fetched while the batch is fresh ─
  { id: 'editor', number: '3', title: 'Editor', needs: 'articles', run: steps.editor },
  // 180s, not 120s: exceeding it kills the fetch and the cycle publishes with no trends snapshot at all.
  snapshot('fetch-trends', '3.4', 'Trends fetch', 180, 'Trends'),
  snapshot('fetch-chokepoints', '3.4b', 'Chokepoints snapshot', 60, 'Chokepoints'),
  // One Yahoo call an exchange, in turn: in parallel they trip its rate limit.
  snapshot('fetch-markets', '3.4b2', 'Market snapshot', 90, 'Markets'),
  snapshot('fetch-companies', '3.4b3', 'Company quotes', 90, 'Companies'),
  // Called every cycle and fetched once a day: the script keeps a snapshot under 20 hours old.
  snapshot('fetch-ai-models', '3.4b4', 'AI model scores', 90, 'AI models'),
  snapshot('fetch-gdacs', '3.4c', 'GDACS snapshot', 120, 'GDACS'),
  snapshot('fetch-conflict', '3.4c2', 'Conflict snapshot', 120, 'Conflict'),
  snapshot('fetch-ioda', '3.4c3', 'IODA outage snapshot', 90, 'IODA'),
  snapshot('fetch-firms', '3.4c4', 'Thermal anomaly snapshot', 180, 'FIRMS'),
  snapshot('fetch-ipc', '3.4c5', 'IPC food insecurity snapshot', 240, 'IPC'),
  // Opus writes a narrative for each Orange or Red alert, cached by its inputs.
  snapshot('narrate-gdacs', '3.4d', 'GDACS narration', 600, 'Narration'),
  { id: 'extract-entities', number: '3.6', title: 'Entity extraction', needs: 'articles', command: ['node', 'scripts/extract-entities.js'], timeout: 180, exit: 'Entities', timed: true },
  { id: 'extract-source-angles', number: '3.7', title: 'Source angles', needs: 'articles', command: ['node', 'scripts/extract-source-angles.js'], timeout: 300, exit: 'Source angles', timed: true },
  // The 48h window into Swedish for islam.se. A translation failure must never be able to stop the publish.
  {
    id: 'translate-swedish', number: '3.75', title: 'Swedish desk', needs: 'articles',
    command: ['node', 'scripts/translate-swedish.js'], timeout: 600,
    warning: 'WARNING: swedish translation failed (non-fatal — islam.se keeps the previous payload)', exit: 'Swedish desk', timed: true,
  },
  // Signal selection is before publishing; failure does not block the news.
  {
    id: 'market-signals', needs: 'articles',
    command: ['node', 'scripts/narrate-indicators.js', '--market-signals'], timeout: 420, warning: 'WARNING: market signals failed',
    commit: { message: 'Market signals', datasets: ['marketSignals', 'marketSignalState'] },
  },

  // ── Stage 3b: build and deploy. Always, even if the editor timed out ──
  { id: 'validate-articles', number: '3b', title: 'Build & Deploy', needs: 'articles', run: steps.validate },
  // From the validated articles, not the selection: the next selector skips only what was published.
  { id: 'write-last-cycle', needs: 'articles', command: ['node', 'scripts/write-last-cycle.js'], exit: 'Last cycle' },
  // Before the build, so the baked social card carries the headline it writes. Fail-soft: the push keeps its own order.
  {
    id: 'pick-breaking-social', needs: 'articles',
    before: () => rmSync(pathOf('breakingPick'), { force: true }),
    command: ['node', 'scripts/pick-breaking-social.js'], timeout: 60, warning: 'WARNING: social pick failed (non-fatal, legacy selection applies)',
  },
  // Reports, never blocks. A type error reaches this box the way a content change does, through the pull below.
  { id: 'typecheck', needs: 'articles', command: ['npm', 'run', 'typecheck'], timeout: 120, warning: 'WARNING: typecheck failed (non-fatal — see above)' },
  { id: 'build', needs: 'articles', run: steps.build },
  { id: 'publish', needs: 'built', run: steps.publish },
  {
    id: 'breaking-push', needs: 'deployed', run: steps.breakingPush,
    commit: { message: 'Push log', datasets: ['pushLog', 'tweetLog', 'instagramLog'] },
  },
  // This cycle's output against the autoresearch rubric: the deterministic clusters only, no tokens.
  {
    id: 'score-production-cycle', needs: 'deployed', command: ['node', 'scripts/score-production-cycle.js'], timeout: 60,
    commit: { message: 'RVS trend', datasets: ['rvsTrend'] },
  },

  // ── Stage 3.8: the prose under each instrument ──────────────────────
  // Daily: Opus writes two sentences for every instrument the rail shows a
  // number for. Before Stage 4 on purpose: the briefing rebuilds and redeploys,
  // so the prose ships on that pass.
  {
    id: 'narrate-indicators', on: 'daily', number: '3.8', title: 'Indicator dispatch',
    command: ['node', 'scripts/narrate-indicators.js'], timeout: 1500, warning: 'WARNING: indicator dispatch failed', took: 'Dispatch',
    commit: { message: 'Indicator dispatch', datasets: ['indicatorDispatch'] },
  },
  {
    id: 'narrate-events', on: 'daily', number: '3.8b', title: 'Event dispatch',
    command: ['node', 'scripts/narrate-events.js'], timeout: 600, warning: 'WARNING: event dispatch failed', took: 'Event dispatch',
    commit: { message: 'Event dispatch', datasets: ['eventsDispatch'] },
  },
  // Any other cycle: only instruments that have never been narrated, so a new
  // one does not sit for a day with no prose. Commits, does not deploy: it
  // ships on the next cycle's build.
  {
    id: 'narrate-indicators-new', on: 'not-daily', number: '3.8', title: 'Indicator dispatch (new instruments only)',
    command: ['node', 'scripts/narrate-indicators.js', '--new-only'], timeout: 420, warning: 'WARNING: indicator dispatch (new-only) failed', took: 'Dispatch (new-only)',
    commit: { message: 'Indicator dispatch', datasets: ['indicatorDispatch'] },
  },

  // ── The daily, weekly and nightly jobs ──────────────────────────────
  { id: 'fetch-analytics', on: 'daily', number: '3.9', title: 'Analytics fetch', command: ['node', 'scripts/fetch-analytics.js'], timeout: 60, took: 'Analytics fetch' },
  {
    id: 'briefing', on: 'daily', number: '4', title: 'Audio briefing', run: steps.briefing,
    skipped: (cycle) => `skipped — ${cycle.startHour}:xx UTC, runs at ${DAILY_HOUR}:00 only`,
  },
  // The deterministic metric scan only, for the dashboard's writing-quality panel.
  {
    id: 'measure-quality', on: 'weekly', number: '5', title: 'Weekly quality snapshot', command: ['node', 'scripts/measure-quality.js'],
    skipped: (cycle) => `skipped — day ${when.weekday(cycle.clock())} ${cycle.startHour}:00 UTC, runs Sunday 22:00 only`,
  },
  {
    id: 'tuning', on: 'tuning', number: '6', title: 'Daily tuning', run: steps.tuning,
    skipped: (cycle) => `skipped — ${cycle.startHour}:xx UTC, runs at 22:00 only`,
  },
]
