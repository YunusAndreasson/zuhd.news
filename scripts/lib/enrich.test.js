// Run: node --test scripts/lib/enrich.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { THIN_BODY } from './dedup.js'
import { attachSources, dropUnwritable, fillThinSources, thinSourcesOf, unionSources } from './enrich.js'

const long = (about) => `${about} `.repeat(Math.ceil((THIN_BODY + 50) / (about.length + 1)))
const src = (name, url, body) => ({ name, url, country: null, ...(body === undefined ? {} : { body }) })

/**
 * A feed of three stories, each with only what the matching reads; the
 * selector saw them without the bodies.
 *
 * @returns {any}
 */
function feed() {
  return {
    multiSourceStories: [
      {
        title: 'Geneva trade body doubles its growth forecast',
        link: 'https://feed.example/wto',
        suggestedSlug: '2026-10-08-wto-forecast',
        sources: [src('Dawn', 'https://dawn.example/wto', long('Geneva trade body doubles growth forecast')), src('Reuters', 'https://reuters.example/wto', long('trade forecast'))],
      },
    ],
    nicheStories: [
      {
        title: 'Lunar hopper demonstrator booked for a 2027 test',
        link: 'https://feed.example/hopper',
        suggestedSlug: '2026-10-08-lunar-hopper',
        sources: [src('European Spaceflight', 'https://esf.example/hopper', long('lunar hopper demonstrator test'))],
      },
      {
        title: 'Angolan fishermen blame offshore spill for empty nets',
        link: 'https://feed.example/spill',
        suggestedSlug: '2026-10-08-angola-spill',
        sources: [src('Declassified UK', 'https://declassified.example/spill', 'A teaser.')],
      },
    ],
  }
}

test('a pick is given its story\'s sources, text included', () => {
  const selection = [{ title: 'Trade body doubles forecast', link: 'https://feed.example/wto', sources: [src('Dawn', 'https://dawn.example/wto')] }]
  const out = attachSources(selection, feed())
  assert.deepEqual(out, { enriched: 1, layers: { link: 1, slug: 0, sourceUrl: 0, fingerprint: 0, keyword: 0 }, missing: [], notes: [] })
  assert.deepEqual(selection[0].sources.map((s) => [s.name, s.body.length > THIN_BODY]), [['Dawn', true], ['Reuters', true]])
})

test('each layer is counted, and the heuristic one says what it matched on', () => {
  const selection = [
    { title: 'A', link: 'https://feed.example/wto' },
    { title: 'B', suggestedSlug: '2026-10-08-lunar-hopper' },
    { title: 'C', link: 'https://reuters.example/wto' },
    { title: 'ANGOLAN FISHERMEN BLAME OFFSHORE SPILL FOR EMPTY NETS' },
    { title: 'Test booked for demonstrator of lunar hopper in 2027' },
  ]
  const out = attachSources(selection, feed())
  assert.deepEqual(out.layers, { link: 1, slug: 1, sourceUrl: 1, fingerprint: 1, keyword: 1 })
  assert.equal(out.enriched, 5)
  assert.equal(out.notes.length, 1)
  assert.match(out.notes[0], /^ {2}⚠ KEYWORD fallback: "Test booked for demonstrator of lunar hopper in 2027" → "Lunar hopper demonstrator booked for a 2027 test" \(\d+% of title, \d+ rare: /)
})

test('a pick with no story is named by its slug, or by its title, and keeps what it came with', () => {
  const own = [src('Example', 'https://example.org/own')]
  const selection = [
    { title: 'Zeppelin regatta returns to the Bodensee', suggestedSlug: '2026-10-08-zeppelin' },
    { title: 'Short Title' },
    { title: 'Quokka census finds marsupial numbers steady', sources: own },
  ]
  const out = attachSources(selection, feed())
  assert.equal(out.enriched, 0)
  assert.deepEqual(out.missing, ['2026-10-08-zeppelin', 'Short Title', 'Quokka census finds marsupial numbers steady'])
  assert.equal(selection[0].sources, undefined)
  assert.equal(selection[2].sources, own)
})

test('a keyword match two different stories could claim is refused, and said so', () => {
  /** @type {any} */
  const two = {
    nicheStories: [
      { title: 'Quillfeather harbour ferry fleet grows', link: 'https://x.example/a', sources: [src('X', 'https://x.example/a', long('ferry'))] },
      { title: 'Brindlewood tunnel railway opens early', link: 'https://x.example/b', sources: [src('X', 'https://x.example/b', long('railway'))] },
    ],
  }
  const selection = [{ title: 'Quillfeather harbour ferry Brindlewood tunnel railway' }]
  const out = attachSources(selection, two)
  assert.deepEqual(out.notes, ['  ⚠ keyword candidate rejected (ambiguous): "Quillfeather harbour ferry Brindlewood tunnel railway" → "Quillfeather harbour ferry fleet grows"'])
  assert.deepEqual(out.missing, ['Quillfeather harbour ferry Brindlewood tunnel railway'])
})

test('a source the selector merged in is kept with the feed\'s copy of it', () => {
  /** @type {any[]} */
  const selection = [{
    title: 'Trade body doubles forecast',
    link: 'https://feed.example/wto',
    sources: [
      src('Dawn', 'https://dawn.example/wto'),
      { name: 'ESF', url: 'https://esf.example/hopper', note: 'merged by the selector' },
      { name: 'Nowhere', url: 'https://nowhere.example/x' },
    ],
  }]
  const out = attachSources(selection, feed())
  assert.deepEqual(out.notes, ['  + kept 1 selector-merged source(s) on "Trade body doubles forecast"'])
  assert.deepEqual(selection[0].sources.map((s) => s.name), ['Dawn', 'Reuters', 'European Spaceflight'])
  assert.equal(selection[0].sources[2].note, 'merged by the selector', 'what the selector said of it stays')
})

test('unionSources adds only what the feed has text for, once', () => {
  const dawn = src('Dawn', 'https://dawn.example/a', 'text')
  const byUrl = new Map([
    ['https://dawn.example/a', dawn],
    ['https://b.example/b', src('B', 'https://b.example/b', 'more text')],
    ['https://c.example/c', src('C', 'https://c.example/c')],
  ])
  const out = unionSources([dawn], [
    { name: 'Dawn again', url: 'https://dawn.example/a' },
    { name: 'b', url: 'https://b.example/b', sentiment: 0.2 },
    { name: 'b twice', url: 'https://b.example/b' },
    { name: 'C, which the feed holds without text', url: 'https://c.example/c' },
    { name: 'Not in the feed', url: 'https://d.example/d' },
    { name: 'No address' },
    null,
  ], byUrl)
  assert.deepEqual(out, [dawn, { name: 'B', url: 'https://b.example/b', country: null, body: 'more text', sentiment: 0.2 }])
  assert.deepEqual(unionSources([dawn], undefined, byUrl), [dawn])
})

test('a thin source is one with an address and less text than an article has', () => {
  const selection = [
    { sources: [src('A', 'https://a.example/1', 'A teaser.'), src('B', 'https://b.example/1', long('full text'))] },
    { sources: [src('C', 'https://c.example/1'), { name: 'No address', body: '' }, null] },
    { title: 'no sources at all' },
  ]
  assert.deepEqual(thinSourcesOf(selection).map((s) => s.url), ['https://a.example/1', 'https://c.example/1'])
})

test('a thin source takes the fetched page when it is longer, four fetches at a time', async () => {
  const sources = Array.from({ length: 9 }, (_, i) => ({ url: `https://x.example/${i}`, body: 'A teaser of forty characters, give or take.' }))
  let open = 0
  let most = 0
  /** @type {string[]} */
  const asked = []
  const filled = await fillThinSources(sources, async (url) => {
    asked.push(url)
    most = Math.max(most, ++open)
    await new Promise((r) => setTimeout(r, 2))
    open--
    const i = Number(url.at(-1))
    return i % 3 === 0 ? long('the page') : i % 3 === 1 ? null : 'Shorter.'
  })
  assert.equal(filled, 3)
  assert.deepEqual(asked.toSorted(), sources.map((s) => s.url))
  assert.equal(most, 4)
  assert.deepEqual(sources.map((s) => s.body.length > THIN_BODY), [true, false, false, true, false, false, true, false, false])
  assert.equal(sources[2].body, 'A teaser of forty characters, give or take.', 'a shorter page does not replace the teaser')
})

test('what the writer could not write is taken out, with the reason', () => {
  const selection = [
    { title: 'Geneva trade body doubles its growth forecast', sources: [src('Dawn', 'https://dawn.example/wto', long('Geneva trade body doubles growth forecast'))] },
    { title: 'Dutch government adopts NixOS across its ministries', sources: [src('Group', 'https://group.example/about', long('We are a community that meets monthly to share open source'))] },
    { title: 'Uzbek security official acquired a second citizenship', sources: [src('OCCRP', 'https://occrp.example/uz', 'A teaser.'), src('Other', 'https://other.example/uz')] },
    { title: 'Zeppelin regatta returns to the Bodensee' },
    { title: 'Nothing came back for this one either', sources: [] },
    { title: 'Oil Up', sources: [src('Dawn', 'https://dawn.example/oil', long('Something else entirely'))] },
    { title: 'Angolan fishermen blame offshore spill for empty nets', sources: [src('D', 'https://d.example/spill', 'A teaser.')] },
  ]
  const { kept, dropped } = dropUnwritable(selection)
  assert.deepEqual(kept.map((e) => e.title), ['Geneva trade body doubles its growth forecast', 'Oil Up'], 'a title of two words is not judged against its text')
  assert.deepEqual(dropped.map((d) => [d.entry.title.split(' ')[0], d.why]), [
    ['Uzbek', `still under ${THIN_BODY} characters of source text after the page fetch`],
    ['Angolan', `still under ${THIN_BODY} characters of source text after the page fetch`],
    ['Dutch', 'its source text matches 0/6 title words — not about this story'],
  ], 'the thin ones first, then the ones about something else; a pick that never had a source gets no line')
  assert.deepEqual(selection[2].sources, [], 'a dropped pick is left without sources')
})

test('two title words in the text are not enough when they are under a third of the title', () => {
  const title = 'Regional lenders agree currency swap lines across seven central banks'
  const entry = (text) => ({ title, sources: [src('X', 'https://x.example/1', long(text))] })
  // All ten words of the title count: each is over three letters and none is a connective.
  const { dropped: under } = dropUnwritable([entry('regional lenders met')])
  assert.equal(under[0].why, 'its source text matches 2/10 title words — not about this story')
  assert.deepEqual(dropUnwritable([entry('regional lenders agree on something')]).dropped, [])
})
