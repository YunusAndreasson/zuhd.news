// Run: node --test scripts/lib/utils.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { slugify } from './utils.js'

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
