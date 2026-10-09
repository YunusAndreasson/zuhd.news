// Run: node --test scripts/lib/push-payload.test.js
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { test } from 'node:test'
import { ROOT } from './paths.js'
import { parseBriefingScript } from './briefing-script.js'
import { briefingPayload, briefingTop, briefingTopFromScript, firstLine, pushSlug, withPushBody } from './push-payload.js'

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

// A briefing as it is saved beside its recording: the intro and the lead, then
// a section a category, a heading and a short pause at the head of each.
const SCRIPT = `This is your Jumu'ah briefing for the ninth of October, twenty twenty-six.
<long pause>
Eighty schoolchildren from Borno State, in Nigeria's northeast, are still in captivity... nearly six months after insurgents took them. Forty-four were seized at Mussa in May. The families are asking why.
---
In politics. <short pause>
In Sanaa, a fourteen-year-old girl was killed on her school bus, on the way home from her last exam. Witnesses say shrapnel hit the bus.
<long pause>
A federal immigration agent in New York fired seven rounds into a car. The mayor called it unconscionable.
---
On the economy. <short pause>
Only seven ships crossed the Strait of Hormuz on Tuesday, the fewest since late July. That's well below the eighty a day before the war.
---
In science. <short pause>
At St. Olaf College, chemists found that nickel electrodes do their work as nickel dioxide. Textbooks say otherwise.
---
In technology. <short pause>
Alibaba is suing the Pentagon, denying any link to the Chinese military.
<long pause>
That's your briefing.
`

// The line used to be written from the ledger's five newest rows. Over
// 2026-10-05 to 10-09 the briefing's own lead was missing from it on two days
// of five, and three of fifteen topics pushed were in no briefing.
test('the topic line is written from the briefing: its lead, then the first story of each section', () => {
  assert.deepEqual(briefingTopFromScript(parseBriefingScript(SCRIPT).sections), [
    { label: "Eighty schoolchildren from Borno State, in Nigeria's northeast, are still in captivity... nearly six months after insurgents took them.", category: 'lead', arc: 'breaking' },
    { label: 'In Sanaa, a fourteen-year-old girl was killed on her school bus, on the way home from her last exam.', category: 'politics', arc: 'breaking' },
    { label: 'Only seven ships crossed the Strait of Hormuz on Tuesday, the fewest since late July.', category: 'economy', arc: 'breaking' },
    { label: 'At St. Olaf College, chemists found that nickel electrodes do their work as nickel dioxide.', category: 'science', arc: 'breaking' },
    { label: 'Alibaba is suing the Pentagon, denying any link to the Chinese military.', category: 'tech', arc: 'breaking' },
  ], 'an ellipsis is a breath, a stop inside the first forty characters is not yet the end, and the sign-off is no story')
})

test('a script that leaves something out still gives what it has', () => {
  const noIntro = briefingTopFromScript(['The lead story came with no intro before it. And a second sentence.', 'In politics.\nA section whose heading has no pause after it, which a model forgets now and then. More.'])
  assert.deepEqual(noIntro, [
    { label: 'The lead story came with no intro before it.', category: 'lead', arc: 'breaking' },
    { label: 'A section whose heading has no pause after it, which a model forgets now and then.', category: 'politics', arc: 'breaking' },
  ])
  assert.deepEqual(briefingTopFromScript(['This is your briefing for the ninth of October.', 'In sport. <short pause>\nA category the site does not have.']), [{ label: 'A category the site does not have.', category: 'news', arc: 'breaking' }])
  assert.deepEqual(briefingTopFromScript([]), [])
  assert.equal(briefingTopFromScript(Array.from({ length: 9 }, (_, i) => `Story number ${i} is long enough to stand as a sentence of its own.`)).length, 5, 'five at most')
})

// What stands in when there is no script to read.
test('the ledger\'s rows that are live, the first five by importance', () => {
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
