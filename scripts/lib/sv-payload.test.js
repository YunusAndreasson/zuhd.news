// Run: node --test scripts/lib/sv-payload.test.js
//
// These pin the contract between the Swedish desk and islam.se. The client
// script that renders this payload does no parsing and no repair, so every
// rule below is one that would otherwise fail on the page rather than here.
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  KATEGORI,
  articleFingerprint,
  countryTargets,
  eventTime,
  registerFault,
  svFeedItem,
  translationFault,
} from './sv-payload.js'

const EN = {
  blocks: [
    'Tehran — Insiders name [Bulgaria](country:BG) and [Cyprus](country:CY) as targets.',
    'Both are EU territory, which turns a Gulf war into an Article 42.7 question.',
    'No timeline has been set.',
  ],
}

const SV = {
  titel: 'Iran väger anfall mot mål i Europa',
  plats: 'Teheran',
  stycken: [
    'Teheran — Insiders pekar ut [Bulgarien](country:BG) och [Cypern](country:CY) som mål.',
    'Båda är EU-territorium, vilket gör ett Gulfkrig till en fråga om artikel 42.7.',
    'Någon tidplan har inte satts.',
  ],
}

test('a well-formed translation has no fault', () => {
  assert.equal(translationFault(EN, SV), null)
})

// A merged pair of paragraphs is the most common way a translation comes back
// subtly wrong, and it is invisible downstream — the article simply reads as
// though a beat is missing. Block count is therefore checked, not trusted.
test('merging two paragraphs is rejected', () => {
  const merged = { ...SV, stycken: [SV.stycken[0], `${SV.stycken[1]} ${SV.stycken[2]}`] }
  assert.match(
    translationFault(EN, merged),
    /block count 2 != 3/,
    'a 3-block article translated into 2 blocks must be dropped, not published short',
  )
})

// islam.se strips the dateline by exact-matching `plats` against the head of
// block 1, exactly as zuhd's own readers strip the English one. A translation
// whose city name and whose opening disagree renders the city twice.
test('block 1 must open with the dateline it declares', () => {
  const drifted = { ...SV, plats: 'Teheran', stycken: ['Iran — något hände.', ...SV.stycken.slice(1)] }
  assert.match(
    translationFault(EN, drifted),
    /does not open with "Teheran — "/,
    'plats and the opening of block 1 must agree, or the reader sees the city twice',
  )
})

test('a translated dateline city is accepted when both sides move together', () => {
  assert.equal(translationFault(EN, SV), null, 'Tehran → Teheran is the point of the field')
})

// The label is translated; the target never is. Dropping a link loses the
// map affordance; swapping two relabels a country.
test('dropped country markup is rejected', () => {
  const stripped = {
    ...SV,
    stycken: ['Teheran — Insiders pekar ut Bulgarien och Cypern som mål.', ...SV.stycken.slice(1)],
  }
  assert.match(translationFault(EN, stripped), /country markup \(none\) != BG,CY/)
})

test('reordered country markup is rejected', () => {
  const swapped = {
    ...SV,
    stycken: [
      'Teheran — Insiders pekar ut [Bulgarien](country:CY) och [Cypern](country:BG) som mål.',
      ...SV.stycken.slice(1),
    ],
  }
  assert.match(
    translationFault(EN, swapped),
    /country markup CY,BG != BG,CY/,
    'same codes in the wrong order means the labels have been attached to the wrong countries',
  )
})

test('missing or empty fields are rejected', () => {
  assert.match(translationFault(EN, { ...SV, titel: '   ' }), /missing titel/)
  assert.match(translationFault(EN, { ...SV, plats: undefined }), /missing plats/)
  assert.match(translationFault(EN, { ...SV, stycken: 'inte en array' }), /not an array/)
  assert.match(
    translationFault(EN, { ...SV, stycken: [SV.stycken[0], '', SV.stycken[2]] }),
    /empty block/,
  )
  assert.match(translationFault(EN, null), /no object/)
})

test('an article with no country markup on either side is fine', () => {
  const en = { blocks: ['Washington — En domstol beslutade.', 'Inget datum är satt.'] }
  const sv = { titel: 'Domstol beslutade', plats: 'Washington', stycken: en.blocks }
  assert.equal(translationFault(en, sv), null)
})

test('countryTargets reads codes in order and upper-cases them', () => {
  assert.deepEqual(countryTargets('[a](country:se) x [b](country:NO)'), ['SE', 'NO'])
  assert.deepEqual(countryTargets('no markup here'), [])
})

// The fingerprint is what makes a re-run free. It must move when the English a
// reader would see moves, and only then.
test('the fingerprint tracks the English, not the run', () => {
  const a = articleFingerprint('Title', 'Body text')
  assert.equal(a, articleFingerprint('Title', 'Body text'), 'same input, same fingerprint')
  assert.notEqual(a, articleFingerprint('Title', 'Body text edited'))
  assert.notEqual(a, articleFingerprint('Title edited', 'Body text'))
})

test('svFeedItem projects the fields islam.se reads', () => {
  const item = svFeedItem(
    {
      slug: '2026-08-19-iran-europe-basing-targets',
      meta: { category: 'politics', date: '2026-08-19T00:00:00Z', lat: 35.6892, lng: 51.389 },
      sources: [
        { name: 'The Times of Israel', url: 'https://example.test/a', country: 'il' },
        { name: 'KyivPost', url: 'https://example.test/b', country: 'UA' },
        { name: 'Dup', url: 'https://example.test/c', country: 'il' },
      ],
      addedAt: 1787142129588,
    },
    SV,
    'https://zuhd.news/s/2026-08-19-iran-europe-basing-targets',
  )
  assert.equal(item.titel, SV.titel)
  assert.equal(item.kategori, 'politik')
  assert.equal(item.kalla, 'The Times of Israel', 'the first source is the credited one')
  assert.deepEqual(item.lander, ['IL', 'UA'], 'country codes are upper-cased and de-duplicated')
  assert.equal(item.region, 'ME')
  assert.equal(item.kartaUrl, 'https://zuhd.news/s/2026-08-19-iran-europe-basing-targets')
  assert.ok(!('title' in item), 'no English title may travel in a Swedish payload')
  assert.ok(!('sentences' in item), 'no English body may travel in a Swedish payload')
})

test('svFeedItem tolerates an article with no sources and no coordinates', () => {
  const item = svFeedItem(
    { slug: 's', meta: { category: 'tech', date: null }, sources: [], addedAt: 1 },
    SV,
    'https://zuhd.news/s/s',
  )
  assert.equal(item.kalla, null)
  assert.deepEqual(item.lander, [])
  assert.equal(item.region, null, 'no coordinate is null, not a continent guess')
  assert.equal(item.lat, null)
})

test('every zuhd category has a Swedish name', () => {
  assert.deepEqual(Object.keys(KATEGORI).sort(), ['economy', 'politics', 'science', 'tech'])
})

// `addedAt` is the file mtime, which resets whenever an article is rewritten.
// The window has to mean "when it happened", or an edited article jumps back
// to the top of islam.se's list.
test('eventTime prefers the frontmatter date and falls back to mtime', () => {
  assert.equal(eventTime({ date: '2026-08-19T00:00:00Z' }, 999), Date.parse('2026-08-19T00:00:00Z'))
  assert.equal(eventTime({ date: 'not a date' }, 999), 999)
  assert.equal(eventTime({}, 999), 999)
})

// ── The register gate ──────────────────────────────────────────────────────
//
// Every case below is a line this stage actually published to islam.se on
// 2026-08-24, at the same model, prompt and effort that produced clean Swedish
// on the reruns. They are pinned because the defect was never a bad prompt —
// it was a bad draw that nothing checked.

const svWith = (...blocks) => ({ titel: 'Rubrik', plats: 'Teheran', stycken: blocks })

test('idiomatic Swedish trips nothing', () => {
  assert.equal(registerFault(EN, SV), null)
})

test('"credited" rendered as the bookkeeping verb is caught', () => {
  const en = { blocks: ["Moody's credited reserves and rollovers, not new exports."] }
  assert.match(
    registerFault(en, svWith("Moody's krediterade valutareserver och omläggningar.")),
    /krediterade/,
  )
  // …and »tillskrev« is what it should have said, so that must pass.
  assert.equal(registerFault(en, svWith("Moody's tillskrev höjningen valutareserverna.")), null)
})

test('billion→biljon is caught, but trillion→biljon is correct', () => {
  const billion = { blocks: ['The deficit reached 3 billion dollars.'] }
  const trillion = { blocks: ['The deficit reached 3 trillion dollars.'] }
  const sv = svWith('Underskottet nådde 3 biljoner dollar.')
  assert.match(registerFault(billion, sv), /faktor 1000/)
  assert.equal(registerFault(trillion, sv), null, 'en svensk biljon ÄR en trillion')
})

test('»strök« is ordinary Swedish and only wrong against "scrapped"', () => {
  const scrapped = { blocks: ['Washington scrapped next month exercise.'] }
  const painted = { blocks: ['The painter coated the hull twice.'] }
  const sv = svWith('Washington strök nästa månads övning.')
  assert.match(registerFault(scrapped, sv), /ställde in/)
  assert.equal(registerFault(painted, sv), null, 'ingen engelsk trigger, ingen anmärkning')
})

test('the source-independent traps need no English at all', () => {
  assert.match(registerFault(EN, svWith('Detta omprisar firmans partnerskap.')), /omprisar/)
  assert.match(registerFault(EN, svWith('Hongkongs stabila mynt lanseras.')), /stablecoin/)
  assert.match(registerFault(EN, svWith('B3 är djupt spekulativ klass.')), /kreditvärdighet/)
  assert.match(registerFault(EN, svWith('nära de övergivna brunnhuvudena.')), /foge-s/)
  assert.match(registerFault(EN, svWith('Ett tillsynsorgan, inte en vakthund.')), /tillsynsorgan/)
})

test('a malformed translation is the other gate\'s problem, not this one', () => {
  // registerFault runs after translationFault in the stage, but it must not
  // throw on the shapes that one rejects — it is called on retry paths too.
  assert.equal(registerFault(EN, null), null)
  assert.equal(registerFault(EN, { titel: 'x' }), null)
  assert.equal(registerFault(undefined, SV), null)
})
