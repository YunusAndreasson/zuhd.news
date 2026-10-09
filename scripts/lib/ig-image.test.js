// Run: node --test scripts/lib/ig-image.test.js
//
// What a card is drawn from. How its type is fitted is `share-card-type.test.js`,
// which reads the corpus; this reads nothing.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { smartQuotes } from './html.js'
import { igCardInputs, igLead } from './ig-image.js'

test('the dek is the opening two blocks as a reader sees them, without the dateline', () => {
  assert.equal(igLead('Washington — [Microsoft](company:MSFT)\'s shares fell *7.5%*.\n\nWhy it `matters`.\n\nA third block.', 'Washington'), 'Microsoft\'s shares fell 7.5%. Why it matters.')
  assert.equal(igLead('No dateline here.\n\nSecond.'), 'No dateline here. Second.')
  assert.equal(igLead(undefined), '')
})

// Three of the last 99 cards posted to Instagram opened their dek with
// `Brasília — `, over BRASÍLIA at the foot (2026-10-02, 10-04, 10-05).
test('a dateline comes off by the article\'s location, whatever alphabet it is in', () => {
  assert.equal(igLead('Brasília — Brazil\'s final debate was cancelled two days before the vote.', 'Brasília'), 'Brazil\'s final debate was cancelled two days before the vote.')
  assert.equal(igLead('São Paulo — The court ruled.'), 'The court ruled.', 'and without one, by the shape of a dateline')
  assert.equal(igLead('Andøya — The launch — the third this year — failed.', 'Andøya'), 'The launch — the third this year — failed.')
})

test('a long dek ends at a sentence, and is never cut on an ellipsis', () => {
  const sentence = 'The committee voted to extend the measure for another year. '
  assert.equal(igLead(`Geneva — ${sentence.repeat(8)}`, 'Geneva'), sentence.repeat(4).trim(), 'the last full stop before 260 characters')
  const one = `${'word '.repeat(80).trim()}. Then a second sentence.`
  assert.equal(igLead(one), `${'word '.repeat(80).trim()}.`, 'with none inside the budget, the first sentence whole')
})

const META = { title: 'US Bars "Microsoft" From Green Card Scheme', date: '2026-10-08T17:27:44Z', category: 'tech', location: 'Washington', lat: 38.9, lng: '-77.04' }
const BODY = 'Washington — Microsoft\'s shares fell 7.5%.\n\nWhy it matters.'

test('a card is drawn from the headline with its quotes curled, the dek, and where and when', () => {
  assert.deepEqual(igCardInputs(META, BODY), {
    headline: 'US Bars “Microsoft” From Green Card Scheme',
    summary: 'Microsoft\'s shares fell 7.5%. Why it matters.',
    category: 'tech',
    date: '2026-10-08T17:27:44Z',
    location: 'Washington',
    lat: 38.9,
    lng: -77.04,
  })
  assert.equal(igCardInputs({ ...META, socialTitle: 'Microsoft\'s shares fall 7.5%' }, BODY).headline, 'Microsoft’s shares fall 7.5%', 'the headline written for the card wins')
  assert.deepEqual(igCardInputs({}, 'Prose.'), { headline: 'Untitled', summary: 'Prose.', category: null, date: undefined, location: null, lat: null, lng: null })
})

// The build hashes `{ v, ...inputs }` as written out, and the hash is the
// name of the cached card. This is what `build.js` spelled before the inputs
// had one home: the same bytes, or every card of a cycle is rendered again.
test('the build\'s cache key reads the inputs in the order it always wrote them', () => {
  const article = { meta: META, body: BODY, title: smartQuotes(META.title) }
  const asTheBuildWroteIt = {
    v: 'v7',
    headline: article.meta.socialTitle ? smartQuotes(article.meta.socialTitle) : article.title,
    summary: 'Microsoft\'s shares fell 7.5%. Why it matters.',
    category: article.meta.category || null,
    date: article.meta.date,
    location: article.meta.location || null,
    lat: article.meta.lat != null ? Number(article.meta.lat) : null,
    lng: article.meta.lng != null ? Number(article.meta.lng) : null,
  }
  assert.equal(JSON.stringify({ v: 'v7', ...igCardInputs(META, BODY) }), JSON.stringify(asTheBuildWroteIt))
})

test('quotes are curled by where they stand', () => {
  assert.equal(smartQuotes('He said "no" and \'never\'.'), 'He said “no” and ‘never’.')
  assert.equal(smartQuotes('Microsoft\'s shares, the miners\' strike'), 'Microsoft’s shares, the miners’ strike')
  assert.equal(smartQuotes('("Quoted" at the start)\n"And on a new line"'), '(“Quoted” at the start)\n“And on a new line”')
  assert.equal(smartQuotes('Nothing to curl: $150 billion'), 'Nothing to curl: $150 billion')
})
