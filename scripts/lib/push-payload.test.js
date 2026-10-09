// Run: node --test scripts/lib/push-payload.test.js
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { test } from 'node:test'
import { ROOT } from './paths.js'
import { briefingPayload, briefingTop, firstLine, pushSlug, withPushBody } from './push-payload.js'

const payload = () => ({ articles: [{ slug: '2026-10-09-fed-raises-rates', title: 'Fed Raises Rates', category: 'economy', body: 'The Federal Reserve raised', eventCoverage: 12, importance: 6 }] })

test('the slug is the first article\'s, or nothing', () => {
  assert.equal(pushSlug(payload()), '2026-10-09-fed-raises-rates')
  assert.equal(pushSlug({ articles: [{}] }), '')
  assert.equal(pushSlug({ articles: [] }), '')
  assert.throws(() => pushSlug(/** @type {any} */ ({})), TypeError, 'a payload with no articles is not read as an empty one')
})

test('the model\'s line is the first that says anything', () => {
  assert.equal(firstLine('Fed raises interest rates by 25 basis points'), 'Fed raises interest rates by 25 basis points')
  assert.equal(firstLine('\n   \n  Fed raises rates  \r\nA second line it was not asked for\n'), 'Fed raises rates')
  assert.equal(firstLine(' \n\t\n'), undefined)
  assert.equal(firstLine(''), undefined)
  assert.equal(firstLine(undefined), undefined)
})

test('a breaking push goes out as Breaking News with the model\'s line, and keeps the rest', () => {
  assert.deepEqual(withPushBody(payload(), 'Oil prices surge past $100 a barrel'), {
    articles: [{ slug: '2026-10-09-fed-raises-rates', title: 'Breaking News', category: 'economy', body: 'Oil prices surge past $100 a barrel', eventCoverage: 12, importance: 6 }],
  })
  assert.throws(() => withPushBody({ articles: [] }, 'A line'), TypeError)
})

// The app in both stores reads this shape, and the endpoint dedups on the slug.
test('the briefing\'s payload is the shape the endpoint was built for', () => {
  assert.deepEqual(briefingPayload('Fed raises rates · Hormuz traffic dips', '2026-10-09'), {
    articles: [{ slug: 'briefing-2026-10-09', title: "Today's Briefing", body: 'Fed raises rates · Hormuz traffic dips', channelId: 'briefing', priority: 'normal', data: { kind: 'briefing', date: '2026-10-09' } }],
  })
  assert.equal(JSON.stringify(briefingPayload('A line', undefined)), '{"articles":[{"slug":"briefing-undefined","title":"Today\'s Briefing","body":"A line","channelId":"briefing","priority":"normal","data":{"kind":"briefing"}}]}')
})

test('the topic line is written from the five most important stories that are live', () => {
  /** @param {string} label @param {Record<string, any>} over */
  const story = (label, over = {}) => ({ label, category: 'politics', arc: 'ongoing', importance: 3, ...over })
  const ledger = { stories: [
    story('Low And Ongoing'), story('Six', { importance: 6 }), story('Breaking, Low', { arc: 'breaking', importance: 1 }), story('Developing, None', { arc: 'developing', importance: undefined }),
    story('Nine', { importance: 9 }), story('Eight', { importance: 8, category: 'science' }), story('Seven A', { importance: 7 }), story('Seven B', { importance: 7 }), story('Five', { importance: 5 }),
  ] }
  assert.deepEqual(briefingTop(/** @type {any} */ (ledger)), [
    { label: 'Nine', category: 'politics', arc: 'ongoing' },
    { label: 'Eight', category: 'science', arc: 'ongoing' },
    { label: 'Seven A', category: 'politics', arc: 'ongoing' },
    { label: 'Seven B', category: 'politics', arc: 'ongoing' },
    { label: 'Six', category: 'politics', arc: 'ongoing' },
  ])
  assert.deepEqual(briefingTop(/** @type {any} */ ({ stories: [story('Low'), story('Breaking, Low', { arc: 'breaking', importance: 1 })] })), [{ label: 'Breaking, Low', category: 'politics', arc: 'breaking' }])
  assert.deepEqual(briefingTop({}), [])
})

// The harness's `node` is a stand-in, so nothing there starts this file. These
// start it for real; none of the three reads or writes a file of the cycle's.
test('the entry script itself: what it prints, and how it ends', () => {
  const run = (/** @type {string[]} */ args, /** @type {{ input?: string, env?: Record<string, string> }} */ { input, env = {} } = {}) =>
    spawnSync(process.execPath, [join(ROOT, 'scripts/cycle/push-payload.js'), ...args], { encoding: 'utf8', input, env: { PATH: process.env.PATH ?? '', ...env } })
  const text = JSON.stringify(payload())

  assert.deepEqual([run([]).status, run([]).stderr], [2, 'usage: push-payload.js slug | inject | briefing-top | briefing\n'])
  assert.deepEqual([run(['slug'], { input: text }).stdout, run(['slug'], { input: '{"articles":[]}' }).stdout], ['2026-10-09-fed-raises-rates\n', '\n'])

  const injected = run(['inject'], { input: text, env: { NOTIF: '\nFed raises rates\n' } })
  assert.equal(injected.stdout, text.replace('Fed Raises Rates', 'Breaking News').replace('The Federal Reserve raised', 'Fed raises rates'), 'no newline after it')
  const empty = run(['inject'], { input: text, env: { NOTIF: ' \n' } })
  assert.deepEqual([empty.status, empty.stdout, empty.stderr], [2, '', 'empty push body from claude\n'])

  const briefing = run(['briefing'], { env: { BODY: ' Fed raises rates · Hormuz traffic dips ', DATE: '2026-10-09' } })
  assert.equal(briefing.stdout, JSON.stringify(briefingPayload('Fed raises rates · Hormuz traffic dips', '2026-10-09')))
  const none = run(['briefing'], { env: { BODY: '  ', DATE: '2026-10-09' } })
  assert.deepEqual([none.status, none.stdout, none.stderr], [2, '', ''])
})
