// Run: node --test scripts/lib/utils.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fingerprint, slugify } from './utils.js'

// --- fingerprint: one function, where there were three ----------------------
const HEADLINES = [
  'Iraq devalues currency as war and Hormuz closure squeeze cash',
  'Russia-Ukraine war: List of key events, day 1,323',
  'Fed Raises Rates',
  '“Math 2.0” will need to value mathematical progress more holistically',
  'Medellín went green to stay cool – heat rose faster',
  '',
  '…',
]

test('each of the three it replaces, at the length that one had', () => {
  // As they were: `lib/utils.js` (the merge), `lib/selection-match.js`, and inline in `fetch-news-api.js`.
  const merge = (title) => title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40)
  const match = (title) => (title || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50)
  const api = (title) => title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30)
  for (const title of HEADLINES) {
    assert.equal(fingerprint(title), merge(title), title)
    assert.equal(fingerprint(title, 50), match(title), title)
    assert.equal(fingerprint(title, 30), api(title), title)
  }
  assert.equal(fingerprint(null, 50), match(null))
  assert.equal(fingerprint(undefined, 50), match(undefined))
})

test('a fingerprint is letters and digits only, and no headline is the empty one', () => {
  assert.equal(fingerprint('Fed Raises Rates!'), 'fedraisesrates')
  assert.equal(fingerprint('FED raises rates'), fingerprint('Fed Raises Rates'))
  assert.equal(fingerprint('Russia-Ukraine war: List of key events, day 1,323', 30), 'russiaukrainewarlistofkeyevent')
  assert.equal(fingerprint(undefined), '', 'where the merge used to throw')
  assert.equal(fingerprint('…'), '')
})

// The four are on the site, under the slug in the comment beside each.
test('a headline is cut at a word, not at the sixtieth character', () => {
  assert.equal(
    slugify('Two Latvian men arrested inside UK military base after breach', '2026-10-09T02:12:00Z'),
    '2026-10-09-two-latvian-men-arrested-inside-uk-military-base-after', // …-base-after-breac
  )
  assert.equal(
    slugify('Co-creator of Empire Market dark web marketplace given 40-year sentence', '2026-10-09T10:00:25Z'),
    '2026-10-09-co-creator-of-empire-market-dark-web-marketplace-given-40', // …-given-40-ye
  )
})

test('a letter keeps its place without its mark, so a name is one word', () => {
  assert.equal(
    slugify('Medellín went green to stay cool – heat rose faster', '2026-10-08T09:00:00Z'),
    '2026-10-08-medellin-went-green-to-stay-cool-heat-rose-faster', // medell-n-went-green-…
  )
  assert.equal(
    slugify('Former Venezuelan President Nicolás Maduro expected to face more charges this week', '2026-10-07T15:00:00Z'),
    '2026-10-07-former-venezuelan-president-nicolas-maduro-expected-to-face', // …-nicol-s-maduro-…
  )
  assert.equal(slugify('Støre, Wałęsa and Kılıçdaroğlu meet on Königstraße in São Paulo', '2026-10-08'), '2026-10-08-store-walesa-and-kilicdaroglu-meet-on-konigstrasse-in-sao')
})

test('a headline that fits is all there, as it was', () => {
  assert.equal(slugify('ICE agent shoots man in New York City', '2026-10-09T04:54:25Z'), '2026-10-09-ice-agent-shoots-man-in-new-york-city')
  assert.equal(slugify("India's TCS rises on AI revenue", '2026-10-09T05:10:11Z'), '2026-10-09-india-s-tcs-rises-on-ai-revenue')
  // Exactly sixty, and sixty ending where a word does.
  const sixty = 'abcde '.repeat(10).trim() // 59 characters as a slug
  assert.equal(slugify(`${sixty}f`, '2026-10-09'), `2026-10-09-${'abcde-'.repeat(9)}abcdef`)
  assert.equal(slugify(`${sixty} next`, '2026-10-09'), `2026-10-09-${'abcde-'.repeat(9)}abcde`)
})

test('a word longer than the limit is cut where the limit falls, and an unreadable date is today', () => {
  assert.equal(slugify('x'.repeat(80), '2026-10-09'), `2026-10-09-${'x'.repeat(60)}`)
  assert.equal(slugify('A headline', 'not a date'), `${new Date().toISOString().slice(0, 10)}-a-headline`)
  assert.match(slugify('…', '2026-10-09'), /^2026-10-09-$/)
})
