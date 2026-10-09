// The cycles the harness runs (`cycle-harness.js`): a healthy one for each
// kind of cycle the schedule produces, and one for each way the script leaves
// its main path. A recorded run of each is in `fixtures/cycle/`.
//
// A scenario is a moment and a set of rules. The moment decides the kind: the
// script reads the hour and the weekday off `date` and nothing else. A rule
// names a call and says how the stub answers it; a rule with several answers
// gives them in turn, so "fails once, then works" is two answers.

/** @typedef {import('./cycle-harness.js').Scenario} Scenario */
/** @typedef {Scenario['rules'][number]} Rule */
/** @typedef {Rule['answers'][number]} Answer */

const A = 'content/articles/2026-10-08-fed-raises-rates.md'
const B = 'content/articles/2026-10-08-hormuz-traffic-dips.md'

/** @param {string} title @param {string} city */
const article = (title, city) =>
  `---\ntitle: "${title}"\ndate: "2026-10-08T17:27:44Z"\ncategory: "economy"\nlocation: "${city}"\nsources:\n  - name: "Dawn"\n    url: "https://www.dawn.com/news/1"\n---\n\n${city} — One.\n\nTwo.\n\nThree.\n\nFour.\n`

const SELECTION = `${JSON.stringify([
  { suggestedSlug: '2026-10-08-fed-raises-rates', title: 'Fed Raises Rates', category: 'economy', sources: [{ name: 'Dawn', url: 'https://www.dawn.com/news/1' }] },
  { suggestedSlug: '2026-10-08-hormuz-traffic-dips', title: 'Hormuz Traffic Dips', category: 'economy', sources: [{ name: 'Dawn', url: 'https://www.dawn.com/news/2' }] },
])}\n`

const PUSH = '{"articles":[{"slug":"2026-10-08-fed-raises-rates","title":"Fed Raises Rates","category":"economy","body":"The Federal Reserve raised","eventCoverage":12,"importance":6}]}'
const PUSHED = '{"articles":[{"slug":"2026-10-08-fed-raises-rates","title":"Breaking News","category":"economy","body":"Fed raises interest rates by 25 basis points","eventCoverage":12,"importance":6}]}'
const BRIEFING_PUSH = '{"articles":[{"slug":"briefing-2026-10-08","title":"Today\'s Briefing","body":"Fed raises rates · Hormuz traffic dips","channelId":"briefing","priority":"normal","data":{"kind":"briefing","date":"2026-10-08"}}]}'

/** @param {string} id @param {string} cmd @param {string} match @param {...Answer} answers @returns {Rule} */
const rule = (id, cmd, match, ...answers) => ({ id, cmd, match, answers: answers.length ? answers : [{}] })
/** @param {string} out @param {Omit<Answer, 'out'>} [rest] @returns {Answer} */
const says = (out, rest = {}) => ({ out, ...rest })

/**
 * A cycle in which everything works. Only what the script parses, branches
 * on or commits by has a rule; every other call is named by the stub
 * (`node:merge-feeds`, `git:push`) and succeeds.
 *
 * @returns {Rule[]}
 */
const healthy = () => [
  // The small programs the script once carried inline, now `scripts/cycle/`
  // and `scripts/body-lengths.js`: what each prints is what bash acts on.
  rule('api-stats', 'node', '^scripts/cycle/tally\\.js feed-api$', says('80 stories from 50 events\n')),
  rule('rss-stats', 'node', '^scripts/cycle/tally\\.js feed-rss$', says('77\n')),
  rule('feed-stats', 'node', '^scripts/cycle/tally\\.js feed$', says('13 multi + 47 niche\n')),
  rule('selection-count', 'node', '^scripts/cycle/tally\\.js selection$', says('2\n')),
  rule('body-lengths', 'node', '^scripts/body-lengths\\.js$', says(`ok 452 chars  4 blocks  ${A}\nOVER 571 chars  5 blocks  ${B}\n`)),
  rule('breaking-pick', 'node', '^scripts/cycle/breaking-push\\.js pick$', says(`${PUSH}\n`)),
  rule('push-slug', 'node', '^scripts/cycle/push-payload\\.js slug$', says('2026-10-08-fed-raises-rates\n')),
  rule('push-inject', 'node', '^scripts/cycle/push-payload\\.js inject$', says(PUSHED)),
  rule('push-log', 'node', '^scripts/cycle/breaking-push\\.js sent$', says('')),
  rule('briefing-top', 'node', '^scripts/cycle/push-payload\\.js briefing-top$', says('[{"label":"Fed Raises Rates","category":"economy","arc":"breaking"}]')),
  rule('briefing-payload', 'node', '^scripts/cycle/push-payload\\.js briefing$', says(BRIEFING_PUSH)),
  rule('alert', 'node', '/scripts/cycle/alert\\.js$', says('ALERT: no articles published (1 cycle(s) in a row since 2026-10-08T18:04:59.000Z)\n')),

  // The stages whose outcome the script acts on.
  rule('fetch-api', 'node', '^scripts/fetch-news-api\\.js$'),
  rule('fetch-rss', 'node', '^scripts/fetch-news\\.js$'),
  rule('enrich', 'node', '^scripts/enrich-selection\\.js$'),
  rule('validate', 'node', '^scripts/validate-articles\\.js$', says('Validated 2 articles, 0 removed\n')),
  rule('build', 'node', '^scripts/build\\.js$', says('Built 812 pages.\n')),
  rule('briefing', 'node', '^scripts/generate-briefing\\.js$', says('Briefing written.\n')),
  rule('metrics', 'node', '^scripts/compute-metrics\\.js$', says('{"date":"2026-10-08"}\n')),

  // The six sessions, told apart by what each is allowed to do or is asked.
  rule('selector', 'claude', '--allowedTools Read,Write,Glob,Grep ', says('Selected 2 stories.\n', { writes: { '/tmp/zuhd-selection.json': SELECTION } })),
  rule('writer', 'claude', '--allowedTools Read,Write,Edit --add-dir', says('Wrote 2 articles.\n')),
  rule('editor', 'claude', '--allowedTools Read,Edit,Glob,Grep ', says('Trimmed one, left one.\n')),
  rule('tuner', 'claude', '--allowedTools Read,Write,Edit,Glob,Grep,Bash ', says('All metrics within targets. No experiment.\n')),
  rule('push-body', 'claude', 'Write ONE push notification body for this article', says('Fed raises interest rates by 25 basis points\n')),
  rule('briefing-body', 'claude', 'daily news briefing audio is ready', says('Fed raises rates · Hormuz traffic dips\n')),

  rule('head', 'git', 'rev-parse HEAD$', says('0123456789abcdef0123456789abcdef01234567\n')),
  rule('new-articles', 'git', '^ls-files --others --exclude-standard content/articles/$', says(`${A}\n${B}\n`)),
  rule('edited-articles', 'git', '^diff --name-only content/articles/$', says('')),
  rule('audit-changed', 'git', '^diff --name-only content/\\.experiments\\.json', says('content/.daily-audit.json\n')),
  rule('audit-new', 'git', '^ls-files --others --exclude-standard content/\\.daily-audit\\.json$', says('')),
  // Reached only for a path that is not on disk: not known to git either.
  rule('known-to-git', 'git', '^ls-files --error-unmatch ', { exit: 1 }),
  rule('commit', 'git', '^commit ', says('[master 1234567] committed\n')),

  rule('deploy', 'npx', '^wrangler pages deploy ', says('Deployment complete.\n')),
  rule('push', 'curl', '', says('{"pushed":1,"skipped":0,"tokens":5}')),
]

// What a cycle's commits name, present as they are on the server: a path
// that is neither on disk nor known to git is dropped from its commit.
const STATE = Object.fromEntries(
  [
    '.market-signals.json', '.market-signal-state.json', '.last-cycle.json', '.story-ledger.json', '.context-briefs.json',
    '.sv.json', '.push-log.json', '.tweet-log.json', '.instagram-log.json', '.rvs-trend.json', '.indicator-dispatch.json',
    '.events-dispatch.json', '.experiments.json', '.daily-audit.json', '.daily-audit.md', 'audio/briefing-meta.json',
  ].map((f) => [`content/${f}`, '{}\n']),
)

/**
 * A rule for a call that has none, from the name the stub gives it unasked
 * (`node:translate-swedish`, `git:pull`, `npm:typecheck`). Under that name its
 * healthy answer is what the stub says anyway, so naming a call here to make
 * it fail in one scenario changes no other recording.
 *
 * @param {string} id
 * @param {Answer[]} answers
 * @returns {Rule}
 */
function named(id, answers) {
  const m = id.match(/^(node|git|npm):([\w-]+)$/)
  if (!m) throw new Error(`cycle-scenarios: no rule named ${id}`)
  const match = { node: `^scripts/${m[2]}\\.js( |$)`, git: `^${m[2]}( |$)`, npm: `^(run )?${m[2]}( |$)` }[m[1]]
  return { id, cmd: m[1], match, answers }
}

/**
 * @param {string} now
 * @param {{ answers?: Record<string, Answer[]>, env?: Record<string, string>, lockHeld?: boolean, without?: string[] }} [change]
 *   `without` names files the repository does not hold in this scenario
 * @returns {Scenario}
 */
function cycle(now, { answers = {}, env = { PUSH_SECRET: 'not-a-secret' }, lockHeld = false, without = [] } = {}) {
  const rules = healthy().map((r) => (answers[r.id] ? { ...r, answers: answers[r.id] } : r))
  for (const id of Object.keys(answers)) if (!rules.some((r) => r.id === id)) rules.push(named(id, answers[id]))
  /** @type {Record<string, string>} */
  const files = { ...STATE, [A]: article('Fed Raises Rates', 'Washington'), [B]: article('Hormuz Traffic Dips', 'Dubai') }
  for (const path of without) delete files[path]
  return { now, rules, files, env, lockHeld }
}

/** Every answer of a call the same failure. @param {number} [exit] @returns {Answer[]} */
const fails = (exit = 1) => [{ exit }]

// 2026-10-08 is a Thursday.
const REGULAR = '2026-10-08T18:04:59Z'
const DAILY = '2026-10-08T05:01:52Z'
const TUNING = '2026-10-08T22:03:05Z'

/** The healthy cycles, recorded in full: prompts, log and journal. */
export const FULL = ['regular', 'daily', 'tuning', 'sunday-tuning', 'off-schedule']

/** @type {Record<string, Scenario>} */
export const SCENARIOS = {
  // ── Each kind of cycle, with everything working ──────────────────────
  regular: cycle(REGULAR),
  daily: cycle(DAILY),
  tuning: cycle(TUNING),
  'sunday-tuning': cycle('2026-10-11T22:03:05Z'),
  // A catch-up run after the machine was off: no hour the schedule knows.
  'off-schedule': cycle('2026-10-08T07:40:00Z'),

  // ── The exits that end the whole script ──────────────────────────────
  'lock-held': cycle(REGULAR, { lockHeld: true }),
  'both-fetches-fail': cycle(REGULAR, { answers: { 'fetch-api': [{ exit: 1 }], 'fetch-rss': [{ exit: 1 }] } }),
  'selector-fails': cycle(REGULAR, { answers: { selector: [says('Failed to authenticate: OAuth session expired and could not be refreshed\n', { exit: 1 })] } }),
  // 2026-07-26: "what would you like me to do?", exit 0, both times.
  'selector-writes-nothing': cycle(REGULAR, { answers: { selector: [says('I see the project context loaded but no actual request yet.\n')] } }),
  'selection-empty': cycle(REGULAR, { answers: { selector: [says('Nothing new.\n', { writes: { '/tmp/zuhd-selection.json': '[]\n' } })], 'selection-count': [says('0\n')] } }),
  'enrich-matches-none': cycle(REGULAR, { answers: { 'selection-count': [says('2\n'), says('0\n')] } }),
  'all-deduped': cycle(REGULAR, { answers: { 'selection-count': [says('2\n'), says('2\n'), says('0\n')] } }),
  // The same exits on the daily and the tuning cycle, which is where they
  // cost the most: everything after them is skipped with the editorial path.
  'selector-fails-daily': cycle(DAILY, { answers: { selector: [says('Failed to authenticate\n', { exit: 1 })] } }),
  'selector-fails-tuning': cycle(TUNING, { answers: { selector: [says('Failed to authenticate\n', { exit: 1 })] } }),

  // ── Retries ───────────────────────────────────────────────────────────
  'selector-recovers': cycle(REGULAR, { answers: { selector: [says('What would you like me to do?\n'), says('Selected 2 stories.\n', { writes: { '/tmp/zuhd-selection.json': SELECTION } })] } }),
  'writer-recovers': cycle(REGULAR, { answers: { 'new-articles': [says(''), says(`${A}\n${B}\n`)] } }),
  'editor-times-out-once': cycle(REGULAR, { answers: { editor: [{ exit: 124 }, says('Trimmed one, left one.\n')] } }),
  'build-lock-clears': cycle(REGULAR, { answers: { build: [says('Another build is already running (lock: .build.lock) — exiting.\n', { exit: 1 }), says('Built 812 pages.\n')] } }),

  // ── Paths that skip part of the cycle and carry on ────────────────────
  // A stage on the way to the writer dies, and the writer is handed whatever
  // the file held before it.
  'enrich-crashes': cycle(REGULAR, { answers: { enrich: [says('SyntaxError: Unexpected end of JSON input\n', { exit: 1 })] } }),
  'writer-writes-nothing': cycle(REGULAR, { answers: { 'new-articles': [says('')] } }),
  'writer-writes-nothing-daily': cycle(DAILY, { answers: { 'new-articles': [says('')] } }),
  'validator-quarantines-one': cycle(REGULAR, { answers: { validate: [says(`SKIP (6 blocks): ${B}\nValidated 2 articles, 1 removed\n`)] } }),
  'build-fails': cycle(REGULAR, { answers: { build: [says('YAMLException: bad indentation of a mapping entry (2:48)\n', { exit: 1 })] } }),
  'deploy-fails': cycle(REGULAR, { answers: { deploy: [says('Received a malformed response from the API\n', { exit: 1 })] } }),
  'no-breaking-story': cycle(REGULAR, { answers: { 'breaking-pick': [says('')] } }),
  'no-push-secret': cycle(REGULAR, { env: {} }),
  'push-body-empty': cycle(REGULAR, { answers: { 'push-body': [says('')] } }),
  'briefing-fails': cycle(DAILY, { answers: { briefing: [says('TTS: 3 INVALID_ARGUMENT\n', { exit: 1 })] } }),
  'metrics-fail': cycle(TUNING, { answers: { metrics: [{ exit: 1 }] } }),
  'tuner-times-out': cycle(TUNING, { answers: { tuner: [{ exit: 124 }] } }),

  // ── What a stage's failure costs: a line in the log, and no more ──────
  // Every stage the cycle only reports on fails at once, and the cycle still
  // builds and deploys. Each warning and each exit line is in this recording.
  'advisory-stages-fail': cycle(REGULAR, {
    answers: {
      'node:merge-feeds': fails(), 'node:prefilter-feed': fails(), 'node:update-ledger': fails(2), 'node:attach-indicators': fails(), 'node:scaffold-articles': fails(),
      'node:fetch-trends': fails(124), 'node:fetch-chokepoints': fails(), 'node:fetch-markets': fails(), 'node:fetch-companies': fails(), 'node:fetch-ai-models': fails(),
      'node:fetch-gdacs': fails(), 'node:fetch-conflict': fails(), 'node:fetch-ioda': fails(), 'node:fetch-firms': fails(137), 'node:fetch-ipc': fails(), 'node:narrate-gdacs': fails(124),
      'node:extract-entities': fails(), 'node:extract-source-angles': fails(124), 'node:translate-swedish': fails(), 'node:narrate-indicators': fails(),
      validate: [says('TypeError: Cannot read properties of undefined\n', { exit: 1 })], 'node:write-last-cycle': fails(), 'node:pick-breaking-social': fails(124),
      'npm:typecheck': [says('scripts/x.js(1,1): error TS2304: Cannot find name\n', { exit: 2 })], 'git:add': fails(128), commit: [says('nothing to commit, working tree clean\n', { exit: 1 })],
      'git:pull': [says('error: cannot pull with rebase: You have unstaged changes.\n', { exit: 128 })], 'npm:install': fails(), 'git:push': [says(' ! [rejected] master -> master (fetch first)\n', { exit: 1 })],
      'node:post-to-twitter': fails(), 'node:post-to-instagram': fails(124), 'node:score-production-cycle': fails(),
    },
  }),
  'advisory-stages-fail-daily': cycle(DAILY, {
    answers: {
      'node:narrate-indicators': fails(124), 'node:narrate-events': fails(), 'node:fetch-analytics': fails(),
      'git:pull': fails(128), 'npm:install': fails(), 'git:push': fails(),
      // The cycle's own build works; the rebuild with the audio does not.
      build: [says('Built 812 pages.\n'), says('ENOSPC: no space left on device\n', { exit: 1 })],
    },
  }),
  'api-fetch-fails': cycle(REGULAR, { answers: { 'fetch-api': fails() } }),
  'selector-fails-on-retry': cycle(REGULAR, { answers: { selector: [says('What would you like me to do?\n'), says('API Error: 529 overloaded\n', { exit: 1 })] } }),
  // Articles on disk and a non-zero exit: no retry, and the cycle goes on with what there is.
  'writer-fails-with-output': cycle(REGULAR, { answers: { writer: [says('Wrote 2 of 13, then the tool call could not be parsed.\n', { exit: 1 })] } }),
  'editor-times-out-twice': cycle(REGULAR, { answers: { editor: fails(124) } }),
  'build-lock-never-clears': cycle(REGULAR, { answers: { build: [says('Another build is already running (lock: .build.lock) — exiting.\n', { exit: 1 })] } }),
  // A cycle with nothing of its own to commit: the files a commit names are neither on disk nor known to git.
  'nothing-to-commit': cycle(REGULAR, { without: ['content/.rvs-trend.json', 'content/.market-signals.json', 'content/.market-signal-state.json', 'content/.indicator-dispatch.json'] }),
  'audit-unchanged': cycle(TUNING, { answers: { 'audit-changed': [says('')] } }),

  // ── The pushes, where they stop short ────────────────────────────────
  'push-injection-fails': cycle(REGULAR, { answers: { 'push-inject': [says('', { exit: 2 })] } }),
  'push-slug-missing': cycle(REGULAR, { answers: { 'push-slug': [says('\n')] } }),
  'push-article-missing': cycle(REGULAR, { answers: { 'push-slug': [says('2026-10-08-not-on-disk\n')] } }),
  'briefing-no-top-stories': cycle(DAILY, { answers: { 'briefing-top': [says('[]')] } }),
  'briefing-top-fails': cycle(DAILY, { answers: { 'briefing-top': [says('')] } }),
  'briefing-body-empty': cycle(DAILY, { answers: { 'briefing-body': [says('\n\n')] } }),
  'briefing-body-two-lines': cycle(DAILY, { answers: { 'briefing-body': [says('Fed raises rates · Hormuz traffic dips\nAnd a second line it was not asked for\n')] } }),
  'briefing-payload-fails': cycle(DAILY, { answers: { 'briefing-payload': [says('', { exit: 2 })] } }),
  'briefing-no-push-secret': cycle(DAILY, { env: {} }),

  // ── Stopped from outside ─────────────────────────────────────────────
  // systemd ends a cycle that outlives its hour by signalling it. The stage
  // that was running is cut short, and the way out still happens: the funnel,
  // the alert, the record. One for each way a stage is waited for.
  'stopped-in-the-writer': cycle(REGULAR, { answers: { writer: [says('Wrote 1 of 13 so far.\n', { kill: 'SIGTERM', exit: 143 })] } }),
  'stopped-in-a-snapshot': cycle(REGULAR, { answers: { 'node:fetch-markets': [{ kill: 'SIGTERM', exit: 143 }] } }),
  'stopped-in-a-count': cycle(REGULAR, { answers: { 'node:coverage-map': [says('', { kill: 'SIGTERM', exit: 143 })] } }),
  'stopped-in-the-build': cycle(REGULAR, { answers: { build: [says('Building 400 of 812 pages...\n', { kill: 'SIGTERM', exit: 143 })] } }),
  'stopped-after-publishing': cycle(TUNING, { answers: { tuner: [says('Reading the audit...\n', { kill: 'SIGTERM', exit: 143 })] } }),
}
