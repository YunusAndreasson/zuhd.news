import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseStockMentions, stockMentionsPrompt, subjectsBlock } from './stock-mentions.js'

test('the prompt carries each article and asks for the subject', () => {
  const prompt = stockMentionsPrompt([
    { slug: 'a-story', title: 'Micron Sees Tighter Memory', body: 'Boise — Micron said """so""".' },
  ])
  assert.match(prompt, /slug: a-story/)
  assert.match(prompt, /title: Micron Sees Tighter Memory/)
  assert.match(prompt, /subject: true when the article is ABOUT this company/)
  // A body cannot close the block it is quoted in.
  assert.ok(!prompt.includes('said """so"""'))
})

test('a body is cut to what the scan reads', () => {
  const prompt = stockMentionsPrompt([{ slug: 's', title: 't', body: `${'x'.repeat(1500)}TAIL` }])
  assert.ok(!prompt.includes('TAIL'))
})

test('subject is true only for a literal true', () => {
  const out = parseStockMentions({
    story: [
      { mention: 'Meta', ticker: 'META', name: 'Meta Platforms', subject: true },
      { mention: 'Nvidia', ticker: 'NVDA', name: 'Nvidia', subject: false },
      { mention: 'Apple', ticker: 'AAPL', name: 'Apple' },
      { mention: 'Tesla', ticker: 'TSLA', name: 'Tesla', subject: 'true' },
    ],
  })
  assert.deepEqual(
    out.get('story').map((c) => [c.ticker, c.subject]),
    [
      ['META', true],
      ['NVDA', false],
      ['AAPL', false],
      ['TSLA', false],
    ],
  )
})

test('a malformed company is dropped and its article is still answered for', () => {
  const out = parseStockMentions({
    story: [
      { mention: 'Meta', ticker: 'not a ticker!', name: 'Meta Platforms', subject: true },
      { ticker: 'NVDA', name: 'Nvidia' },
      null,
    ],
    quiet: [],
    odd: 'nothing',
  })
  assert.deepEqual(out.get('story'), [])
  // Read, and nothing there: not the same answer as never read.
  assert.deepEqual(out.get('quiet'), [])
  assert.deepEqual(out.get('odd'), [])
  assert.equal(out.has('absent'), false)
})

test('an answer that is not an object is no answer', () => {
  assert.equal(parseStockMentions(null).size, 0)
  assert.equal(parseStockMentions([]).size, 0)
  assert.equal(parseStockMentions('{}').size, 0)
})

test('subjectsBlock writes one id a line, once each, and says so when there are none', () => {
  assert.deepEqual(subjectsBlock(['stocks:NVDA', 'stocks:MU', 'stocks:NVDA']), [
    'subjects:',
    '  - "stocks:NVDA"',
    '  - "stocks:MU"',
  ])
  assert.deepEqual(subjectsBlock([]), ['subjects: []'])
})
