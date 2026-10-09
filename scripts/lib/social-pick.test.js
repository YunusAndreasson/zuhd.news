// Run: node --test scripts/lib/social-pick.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseFrontmatter } from './frontmatter.js'
import { leadOf, parsePick, pickPrompt, socialTitleOf, withSocialTitle } from './social-pick.js'

test('a lead is the first paragraph as a reader sees it, without the dateline', () => {
  assert.equal(leadOf('Washington — [Microsoft](company:MSFT)\'s shares fell *7.5%*\nafter the `suspension`.\n\nWhy it matters.'), 'Microsoft\'s shares fell 7.5% after the suspension.')
  assert.equal(leadOf('St. John\'s, N.L. — The ferry sailed.'), 'The ferry sailed.')
  assert.equal(leadOf('The ferry sailed without a dateline.'), 'The ferry sailed without a dateline.')
  assert.equal(leadOf(undefined), '')
})

test('a long lead ends at a sentence when one ends late enough, and at a word otherwise', () => {
  const sentence = 'The committee voted to extend the measure for another year. '
  const cut = leadOf(`Geneva — ${sentence.repeat(8)}`)
  assert.equal(cut, sentence.repeat(5).trim(), 'the last full stop before 320 characters')
  const unbroken = leadOf(`Geneva — ${'word '.repeat(100)}`)
  assert.ok(unbroken.endsWith('word…') && unbroken.length <= 321, unbroken)
})

const CANDS = [
  { slug: '2026-10-08-a', title: 'US Bars Microsoft Sponsorships', category: 'tech', body: 'Washington — Shares fell 7.5%.\n\nMore.', importance: 6, eventCoverage: 224 },
  { slug: '2026-10-08-b', title: 'US Proposes Student Work Charge', category: 'politics', body: 'Washington — Universities would pay $100,000.', importance: 5, eventCoverage: 163 },
]

test('the prompt is the instructions and then the candidates, numbered', () => {
  assert.equal(pickPrompt('<task>\nPick one.\nCandidates:\n</task>\n', CANDS), [
    '<task>',
    'Pick one.',
    'Candidates:',
    '</task>',
    '',
    '1. slug: 2026-10-08-a',
    '   category: tech  importance: 6  eventCoverage: 224',
    '   title: US Bars Microsoft Sponsorships',
    '   lead: Shares fell 7.5%.',
    '',
    '2. slug: 2026-10-08-b',
    '   category: politics  importance: 5  eventCoverage: 163',
    '   title: US Proposes Student Work Charge',
    '   lead: Universities would pay $100,000.',
    '',
  ].join('\n'))
})

test('the pick is the object in the answer, whatever prose is around it', () => {
  assert.deepEqual(parsePick('Here you go:\n{"slug": "2026-10-08-b", "score": 8}\nHope that helps.'), { pick: { slug: '2026-10-08-b', score: 8 }, problem: null })
  assert.deepEqual(parsePick('I could not choose.'), { pick: null, problem: 'no JSON in claude output: I could not choose.' })
  assert.equal(parsePick(`${'x'.repeat(200)}`).problem, `no JSON in claude output: ${'x'.repeat(120)}`)
  assert.equal(parsePick(null).problem, 'no JSON in claude output: ')
  assert.match(parsePick('{ "slug": oops }').problem ?? '', /^bad JSON from claude: Unexpected token/)
})

test('the card headline loses the quotes around it and anything past 80 characters', () => {
  assert.equal(socialTitleOf({ socialTitle: ' “$100,000 To Study In America” ' }), '$100,000 To Study In America')
  assert.equal(socialTitleOf({ socialTitle: '"It\'s "Over", Says Fed"' }), 'It\'s "Over", Says Fed', 'only the outer ones')
  assert.equal(socialTitleOf({ socialTitle: `${'Nine char '.repeat(8)}tail` }), 'Nine char '.repeat(8).trim())
  assert.equal(socialTitleOf({}), '')
  assert.equal(socialTitleOf({ socialTitle: 150 }), '150')
})

const ARTICLE = `---
title: "Nvidia Authorizes Record Buyback"
date: "2026-10-08T17:00:00Z"
category: "economy"
sources:
  - name: "Dawn"
    url: "https://www.dawn.com/news/1"
---

Santa Clara — Body.
`

test('the headline goes under the title, and every other line stays as it was', () => {
  const out = withSocialTitle(ARTICLE, 'Nvidia Authorizes Record $150 Billion Share Buyback')
  assert.equal(out, ARTICLE.replace('Buyback"\n', 'Buyback"\nsocialTitle: "Nvidia Authorizes Record $150 Billion Share Buyback"\n'))
  assert.equal(parseFrontmatter(out).meta.socialTitle, 'Nvidia Authorizes Record $150 Billion Share Buyback')
})

test('a headline with quotes, a backslash or a pattern in it still parses, and comes back as written', () => {
  for (const title of ['He Said "No" — $& And $1 And $`', 'C:\\Users Are Not News', 'Colon: Then # Hash', 'A Line\u2028Separator', 'Tab\tAnd é And 日本']) {
    assert.equal(parseFrontmatter(withSocialTitle(ARTICLE, title)).meta.socialTitle, title)
  }
})

test('an article that has one already gets the new one in its place', () => {
  const first = withSocialTitle(ARTICLE, 'The First Try')
  const second = withSocialTitle(first, 'The Second Try')
  assert.equal(second, first.replace('The First Try', 'The Second Try'))
  assert.equal(second.match(/^socialTitle:/gm)?.length, 1)
})

// The edit is one line; what stands under an older `socialTitle:` is not its
// business, and here it would be left hanging under the new one.
test('an edit that would change anything but the headline is refused', () => {
  const folded = ARTICLE.replace('date:', 'socialTitle: >\n  An older headline,\n  folded over two lines\ndate:')
  assert.equal(parseFrontmatter(folded).meta.socialTitle, 'An older headline, folded over two lines\n')
  assert.throws(() => withSocialTitle(folded, 'A New One'), /the edit|bad indentation|did not survive/)

  const broken = ARTICLE.replace('"Nvidia Authorizes Record Buyback"', '"Nvidia "Authorizes" Record Buyback"')
  assert.throws(() => withSocialTitle(broken, 'A New One'), 'an article that does not parse to begin with')
})

test('a file with no frontmatter is refused', () => {
  assert.throws(() => withSocialTitle('Just prose.\n', 'A Title'), /no frontmatter block/)
})
