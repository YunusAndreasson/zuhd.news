// Run: node --test scripts/lib/cycle-log.test.js
//
// The lines below are the cycle's own, copied from logs of 2026-10-07 and
// 2026-10-08 with the slugs shortened. What sits between the markers in a real
// log is model prose, so each fixture carries a line or two of it that says
// something a careless pattern would take for a marker.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cycleIdOf, isoFromDateOutput, parseCycleLog, runRecord } from './cycle-log.js'

const HEAD = [
  '=== zuhd.news editorial cycle ===',
  'Started: Wed Oct  7 10:04:22 PM UTC 2026',
  '',
  '--- Stage 0: API + RSS feed fetch ---',
  'NewsAPI tokens this cycle: ~18 (events=1×5 articles=5×1 perEvent=8×1 other=0)',
  'API fetch: 80 stories from 50 events',
  '  ✗ Bellingcat: HTTP 503',
  'RSS fetch: 77 stories',
  'Merged feed: 15 multi + 45 niche — 14s',
  '',
  '--- Stage 1: Selector ---',
  'Selection target: 15 stories (22:00 UTC)',
]

const FUNNEL = (rows) => ['', '=== Funnel ===', ...rows, '', 'Finished: Wed Oct  7 10:25:22 PM UTC 2026 — total 1261s']

const REGULAR = [
  ...HEAD,
  'Thirteen picked. The 18:00 log said Published: 99 and Selector exit: 7 — 1s, which is wrong.',
  'Published: 99',
  'Selector exit: 0 — 168s',
  'Selection contains 13 stories',
  'Deduped selection: 13 → 12 (1 duplicates removed)',
  '',
  '--- Stage 2: Writer ---',
  'Writer exit: 0 — 482s',
  'Found 12 new/modified articles',
  '',
  '--- Stage 3: Editor ---',
  'Editor exit: 0 — 128s',
  '',
  '--- Stage 3.4: Trends fetch ---',
  '  ✗ yahoo: ^N225 HTTP 429',
  'Trends exit: 0 — 59s',
  '',
  '--- Stage 3.4b4: AI model scores ---',
  'AI models exit: 0 — 0s',
  '',
  '--- Stage 3.7: Source angles ---',
  'Source angles exit: 0 — 51s',
  '[master bad5b8ea] Market signals 2026-10-07T22:16',
  '',
  '--- Stage 3b: Build & Deploy ---',
  'SKIP (duplicate of 2026-10-07-a.md (same title)): content/articles/2026-10-07-b.md',
  'Validated 12 articles, 1 removed',
  'Build exit: 0',
  '[master 36e643cd] Editorial cycle 2026-10-07 22:17 UTC: 11 articles',
  ' 13 files changed, 402 insertions(+), 61 deletions(-)',
  ' create mode 100644 content/articles/2026-10-07-c.md',
  ' create mode 100644 content/articles/2026-10-07-d.md',
  'WARNING: git push failed',
  'Deploy exit: 0',
  'Pushing breaking news: {"articles":[{"slug":"2026-10-07-c","title":"Breaking News","body":"Fed raises rates"}]}',
  '{"pushed":1,"skipped":0,"tokens":5}',
  '',
  '--- Stage 3.8: Indicator dispatch (new instruments only) ---',
  'Dispatch (new-only) — 22s',
  '',
  '--- Stage 4: Audio briefing (skipped — 22:xx UTC, runs at 05:00 only) ---',
  '',
  '--- Stage 5: Weekly quality snapshot (skipped — day 3 22:00 UTC, runs Sunday 22:00 only) ---',
  '',
  '--- Stage 6: Daily tuning ---',
  'Tuning exit: 124 (TIMEOUT — exceeded 600s budget; bump if recurring) — 601s',
  ...FUNNEL(['Feed:      15 multi + 45 niche', 'Selected:  13', 'Deduped:   12 (1 already published)', 'Written:   12', 'Validated: 11 (1 removed)', 'Published: 11']),
].join('\n')

test('a cycle reads as its stages, in the order it ran them', () => {
  const log = parseCycleLog(REGULAR)
  assert.deepEqual(log.stages.map((s) => s.id), ['selector', 'writer', 'editor', 'trends', 'ai-models', 'source-angles', 'build', 'deploy', 'dispatch-new-only', 'tuning'])
  const by = Object.fromEntries(log.stages.map((s) => [s.id, s.attempts]))
  assert.deepEqual(by.selector, [{ exit: 0, seconds: 168 }])
  assert.deepEqual(by.build, [{ exit: 0, seconds: null }], 'a status with no duration')
  assert.deepEqual(by['dispatch-new-only'], [{ exit: null, seconds: 22 }], 'a duration with no status')
  assert.deepEqual(by.tuning, [{ exit: 124, seconds: 601 }], 'the timeout note sits between the two')
})

test('a marker is a whole line, and the funnel is read from its own block', () => {
  const log = parseCycleLog(REGULAR)
  assert.deepEqual(log.stages.find((s) => s.id === 'selector')?.attempts, [{ exit: 0, seconds: 168 }], 'not the 7 the transcript quoted')
  assert.equal(log.funnel?.published, 11, 'not the 99 a model wrote on a line of its own')
  assert.deepEqual(log.funnel, {
    feed: '15 multi + 45 niche',
    selected: 13,
    deduped: 12,
    dedupNote: '1 already published',
    written: 12,
    validated: 11,
    validNote: '1 removed',
    published: 11,
  })
})

test('headers say what ran and what was skipped, and why', () => {
  const { headers } = parseCycleLog(REGULAR)
  assert.deepEqual(headers.find((h) => h.n === '4'), { n: '4', title: 'Audio briefing', skipped: '22:xx UTC, runs at 05:00 only' })
  assert.deepEqual(headers.find((h) => h.n === '3.8'), { n: '3.8', title: 'Indicator dispatch (new instruments only)', skipped: null })
  assert.deepEqual(headers.find((h) => h.n === '6'), { n: '6', title: 'Daily tuning', skipped: null })
})

test('a complaint is filed under the stage that printed it', () => {
  const { marks } = parseCycleLog(REGULAR)
  assert.deepEqual(marks, [
    { stage: '0', name: 'Bellingcat', message: 'HTTP 503' },
    { stage: '3.4', name: 'yahoo', message: '^N225 HTTP 429' },
  ])
})

test('the record carries the funnel, the commits and what became of each article', () => {
  const rec = runRecord(parseCycleLog(REGULAR), { id: '2026-10-07_2204' })
  assert.equal(rec.schema, 1)
  assert.equal(rec.source, 'log')
  assert.equal(rec.startedAt, '2026-10-07T22:04:22Z')
  assert.equal(rec.finishedAt, '2026-10-07T22:25:22Z')
  assert.equal(rec.totalSeconds, 1261)
  assert.equal(rec.exit, null, 'a log does not carry the script status')
  assert.deepEqual(rec.jobs, { daily: false, tuning: true, weekly: false })
  assert.deepEqual(rec.ran, ['0', '1', '2', '3', '3.4', '3.4b4', '3.7', '3b', '3.8', '6'])
  assert.deepEqual(rec.feed, { apiStories: 80, apiEvents: 50, rssStories: 77, multi: 15, niche: 45 })
  assert.deepEqual(rec.funnel, { target: 15, selected: 13, deduped: 12, alreadyPublished: 1, written: 12, validated: 11, removed: 1, published: 11 })
  assert.deepEqual(rec.commits, [
    { sha: 'bad5b8ea', subject: 'Market signals 2026-10-07T22:16' },
    { sha: '36e643cd', subject: 'Editorial cycle 2026-10-07 22:17 UTC: 11 articles' },
  ])
  assert.deepEqual(rec.pushes, [{ kind: 'breaking', slug: '2026-10-07-c', pushed: 1 }])
  assert.deepEqual(rec.warnings, ['WARNING: git push failed'])
  assert.deepEqual(rec.articles, [
    { slug: '2026-10-07-b', outcome: 'quarantined', reason: 'duplicate of 2026-10-07-a.md (same title)' },
    { slug: '2026-10-07-c', outcome: 'published' },
    { slug: '2026-10-07-d', outcome: 'published' },
  ])
  assert.equal(rec.newsApiTokens, 18)
})

// 2026-07-26 04:04: the writer answered "what would you like me to do?" in 6 s
// and exited 0; the retry wrote the batch. Every reader saw the 6 s.
test('a retry is seen: the last attempt is the outcome, the first is kept', () => {
  const text = [
    ...HEAD,
    'Selector exit: 0 — 6s',
    'Selector returned 0 but produced no selection file — retrying once',
    'Selector retry exit: 0 — 611s',
    '--- Stage 2: Writer ---',
    'Writer exit: 1 — 9s',
    'Writer wrote no articles (exit 1) — retrying once',
    'Writer retry exit: 0 — 240s',
  ].join('\n')
  const log = parseCycleLog(text)
  assert.deepEqual(log.stages.find((s) => s.id === 'writer')?.attempts, [{ exit: 1, seconds: 9 }, { exit: 0, seconds: 240 }])
  const rec = runRecord(log, { id: '2026-07-26_0404' })
  assert.deepEqual(rec.stages, [
    { id: 'selector', exit: 0, seconds: 611, retried: true, attempts: [{ exit: 0, seconds: 6 }, { exit: 0, seconds: 611 }] },
    { id: 'writer', exit: 0, seconds: 240, retried: true, attempts: [{ exit: 1, seconds: 9 }, { exit: 0, seconds: 240 }] },
  ])
})

// 2026-08-19 17:06, the first of seventeen: an expired login, four seconds.
test('a cycle that ends in the selector says so, and names no jobs it never reached', () => {
  const text = [
    ...HEAD,
    'Failed to authenticate: OAuth session expired and could not be refreshed',
    'Selector exit: 1 — 4s',
    'Selector failed (exit 1) — aborting cycle',
    ...FUNNEL(['Feed:      15 multi + 45 niche', 'Selected:  0', 'Deduped:   0', 'Written:   0', 'Validated: 0', 'Published: 0']),
    'ALERT: claude CLI authentication failed — re-run \'claude\' interactively on the server to log in (1 cycle(s) in a row since 2026-08-19T17:06:46.000Z)',
  ].join('\n')
  const log = parseCycleLog(text)
  assert.equal(log.abort, 'Selector failed (exit 1) — aborting cycle')
  const rec = runRecord(log, { id: '2026-08-19_1702', exit: 1 })
  assert.equal(rec.exit, 1)
  assert.equal(rec.jobs, null, 'no Stage 4, 5 or 6 header was printed')
  assert.equal(rec.funnel.published, 0)
  assert.deepEqual(rec.articles, [])
  assert.match(rec.alert ?? '', /^claude CLI authentication failed/)
})

test('the trap\'s own hours name the jobs, reached or not', () => {
  const log = parseCycleLog([...HEAD, 'Selector exit: 1 — 4s', 'Selector failed (exit 1) — aborting cycle'].join('\n'))
  const at = (startHour, startedAt) => runRecord(log, { id: 'x', startHour, dailyHour: '05', startedAt }).jobs
  assert.deepEqual(at('05', '2026-10-08T05:01:52Z'), { daily: true, tuning: false, weekly: false })
  assert.deepEqual(at('22', '2026-10-08T22:03:05Z'), { daily: false, tuning: true, weekly: false }, 'a Thursday')
  assert.deepEqual(at('22', '2026-10-11T22:03:05Z'), { daily: false, tuning: true, weekly: true }, 'a Sunday')
  assert.deepEqual(at('07', '2026-10-08T07:40:00Z'), { daily: false, tuning: false, weekly: false }, 'a catch-up run off the schedule')
})

test('a killed cycle has no funnel and no finish, and is still a record', () => {
  const log = parseCycleLog([...HEAD, 'Selector exit: 0 — 168s', '--- Stage 2: Writer ---'].join('\n'))
  assert.equal(log.funnel, null)
  const rec = runRecord(log, { id: '2026-09-23_0403' })
  assert.equal(rec.finishedAt, null)
  assert.equal(rec.totalSeconds, null)
  assert.deepEqual(rec.funnel, { target: 15, selected: null, deduped: null, alreadyPublished: null, written: null, validated: null, removed: null, published: null })
})

test('an article is out only when a deploy carried it', () => {
  const base = [...HEAD, '--- Stage 3b: Build & Deploy ---', ' create mode 100644 content/articles/2026-10-07-c.md']
  const outcome = (lines, known = {}) => runRecord(parseCycleLog([...base, ...lines].join('\n')), { id: 'x', ...known }).articles
  assert.deepEqual(outcome(['Deploy exit: 1']), [{ slug: '2026-10-07-c', outcome: 'unpublished' }])
  assert.deepEqual(outcome(['Deploy exit: 1', 'Audio deploy exit: 0']), [{ slug: '2026-10-07-c', outcome: 'published' }], 'the daily cycle deploys twice')
  assert.deepEqual(
    outcome(['Build exit: 1', 'Build failed — skipping deploy'], { written: ['2026-10-07-c', '2026-10-07-e'] }),
    [{ slug: '2026-10-07-c', outcome: 'unpublished' }, { slug: '2026-10-07-e', outcome: 'unpublished' }],
    'nothing was committed, so the names come from the writer\'s list',
  )
})

test('a push whose payload was cut short is still a push', () => {
  const cut = 'Pushing daily briefing: {"articles":[{"slug":"briefing-2026-10-08"}'
  const { pushes } = parseCycleLog([cut, '{"pushed":1,"skipped":0,"tokens":5}'].join('\n'))
  assert.deepEqual(pushes, [{ kind: 'briefing', payload: null, response: { pushed: 1, skipped: 0, tokens: 5 } }])
})

test('date output becomes ISO, in UTC or not at all', () => {
  assert.equal(isoFromDateOutput('Thu Oct  8 06:04:59 PM UTC 2026'), '2026-10-08T18:04:59Z')
  assert.equal(isoFromDateOutput('Thu Oct  8 12:00:01 AM UTC 2026'), '2026-10-08T00:00:01Z')
  assert.equal(isoFromDateOutput('Thu Oct  8 12:30:00 PM UTC 2026'), '2026-10-08T12:30:00Z')
  assert.equal(isoFromDateOutput('Thu Oct  8 18:04:59 UTC 2026'), '2026-10-08T18:04:59Z', 'a C locale prints 24 hours')
  assert.equal(isoFromDateOutput('Thu Oct  8 06:04:59 PM CEST 2026'), null)
  assert.equal(isoFromDateOutput(null), null)
})

test('a cycle is named by its log', () => {
  assert.equal(cycleIdOf('logs/cycle-2026-10-08_1804.log'), '2026-10-08_1804')
  assert.equal(cycleIdOf('cycle-2026-10-08_1804.log.gz'), null)
  assert.equal(cycleIdOf('trends-picks.jsonl'), null)
})
