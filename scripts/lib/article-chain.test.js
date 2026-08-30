// The two things an article says about itself after the prose stops.
//
// Both of these implement a sentence the site publishes about itself, which is
// what makes them worth pinning: a defect here does not look like a bug, it
// looks like the page working while the claim on the about page quietly stops
// being true. That is exactly how the unlinked source chain survived for
// months — `Sources: A, B, C` renders perfectly.

import test from 'node:test'
import assert from 'node:assert/strict'
import { loadShared } from '../build/shared-ts.js'
import {
  parseCorrections,
  renderCorrections,
  renderIsnad,
  STATE_OUTLETS,
} from './article-chain.js'

const src = (name, country, url = `https://example.com/${name}`) => ({ name, country, url })

// --- the isnad -------------------------------------------------------------

test('the chain is linked, because the about page says it is', () => {
  // The defect this replaces. `about.md`: "isnad — Every article ends with its
  // chain of sources, named and linked." The article page printed the names as
  // flat text with no anchors at all, while the map's story card linked them —
  // so the claim was false on the canonical page and true on the derived one.
  const html = renderIsnad([src('Dawn', 'PK'), src('Reuters', 'GB')], 'Story about [Pakistan](country:PK).')
  assert.match(html, /<a href="https:\/\/example\.com\/Dawn"[^>]*>Dawn<\/a>/)
  assert.match(html, /<a href="https:\/\/example\.com\/Reuters"[^>]*>Reuters<\/a>/)
  assert.match(html, /rel="noopener nofollow"/)

  // A source with no URL is still named. A dead anchor would imply it could be
  // followed, which is a smaller lie than dropping it but still one.
  const noUrl = renderIsnad([{ name: 'Wire copy', country: 'PK' }], '')
  assert.match(noUrl, /<span>Wire copy<\/span>/)
  assert.doesNotMatch(noUrl, /<a /)

  assert.equal(renderIsnad([], 'body'), '')
  assert.equal(renderIsnad(null, 'body'), '')
})

test('the chain ranks by proximity to the event, not by publication order', () => {
  // An isnad is ranked, and what ranks it is how close the transmitter stood.
  // For a newsroom that reads as jurisdiction: an outlet inside the country
  // where it happened is closer than a wire desk elsewhere.
  const sources = [src('The New York Times', 'US'), src('France 24', 'FR'), src('Dawn', 'PK')]
  const html = renderIsnad(sources, 'Reported from [Pakistan](country:PK).')
  const order = [...html.matchAll(/>([^<]+)<\/a>/g)].map((m) => m[1])
  assert.deepEqual(order, ['Dawn', 'The New York Times', 'France 24'])
})

test('a chain it cannot rank keeps the order it was published in', () => {
  // Roughly half the corpus carries no inline country tag. There the pipeline's
  // own order stands, and the sort must be stable enough not to disturb it —
  // an unstable sort would reshuffle those chains for no reason at all.
  const sources = [src('Reuters', 'GB'), src('AFP', 'FR'), src('AP', 'US')]
  const order = (body) => [...renderIsnad(sources, body).matchAll(/>([^<]+)<\/a>/g)].map((m) => m[1])
  assert.deepEqual(order('No country tags at all.'), ['Reuters', 'AFP', 'AP'])
  // And where a tag exists but nothing matches it, likewise.
  assert.deepEqual(order('About [Japan](country:JP).'), ['Reuters', 'AFP', 'AP'])
})

test('adalah outranks nearness: a state organ does not lead a story about its own state', () => {
  // The flaw proximity-alone introduces, and the reason `about.md` names two
  // principles rather than one. Its source policy: "State media is included to
  // carry a government's position, never as a substitute for independent
  // reporting." Ranked on nearness alone, TASS leads every Russia story — which
  // makes it precisely that substitute.
  const sources = [src('The New York Times', 'US'), src('Meduza', 'RU'), src('TASS', 'RU')]
  const html = renderIsnad(sources, 'Reported from [Russia](country:RU).')
  const order = [...html.matchAll(/>([^<]+)<\/a>/g)].map((m) => m[1])

  // Meduza is Russian and independent, so nearness promotes it. TASS is
  // Russian and a state agency, so it holds its published position.
  assert.deepEqual(order, ['Meduza', 'The New York Times', 'TASS'])

  // Withheld promotion is the *only* sanction. It is still in the chain, still
  // named, still linked — carrying the government's position, which is what it
  // is published for.
  assert.match(html, /<a href="[^"]*"[^>]*>TASS<\/a>/)
})

test('the state-outlet list stays narrow, and applies the same rule to allies', () => {
  const has = (n) => STATE_OUTLETS.has(n.toLowerCase())
  // State-owned agencies functioning as government organs.
  for (const n of ['TASS', 'RT', 'Xinhua', 'Global Times', 'Mehr News Agency', 'IRNA']) {
    assert.ok(has(n), `${n} should be treated as a state outlet`)
  }
  // Anadolu is on the list for the same reason TASS is. Leaving it off because
  // Turkey is an ummah state would be the double standard this site refuses
  // everywhere else — it is the same test that keeps Western Sahara's name as
  // it is rather than taking the convenient side.
  assert.ok(has('Anadolu Ajansı') && has('Anadolu Agency'))
  // State-*funded* with editorial independence is a different thing, and the
  // list must not creep into it. This is the boundary, asserted.
  for (const n of ['BBC', 'Al Jazeera', 'Deutsche Welle', 'NPR', 'France 24', 'TRT World']) {
    assert.ok(!has(n), `${n} must not be treated as a state organ`)
  }
})

// --- corrections -----------------------------------------------------------

test('a correction is parsed, dated, and ordered oldest first', () => {
  const parsed = parseCorrections({
    corrections: [
      { date: '2026-07-26T10:00:00Z', note: 'Second' },
      { date: '2026-07-24T10:00:00Z', note: 'First' },
    ],
  })
  assert.deepEqual(parsed.map((c) => c.note), ['First', 'Second'])
})

test('a correction that cannot be published is dropped rather than half-rendered', () => {
  // Both fields are load-bearing: without a note it corrects nothing, and
  // without a date it cannot be placed against the version it applies to — and
  // the date drives `dateModified` and the feed's `<updated>`. Dropping is the
  // right runtime behaviour inside a live pipeline; `corpus.test.js` is what
  // makes the drop loud, by failing the build on any correction shaped like
  // these.
  const parsed = parseCorrections({
    corrections: [
      { date: '2026-07-26T10:00:00Z', note: '' },
      { date: 'sometime last week', note: 'A real note' },
      { note: 'No date at all' },
      { date: '2026-07-26T10:00:00Z', note: 'Keeps' },
    ],
  })
  assert.deepEqual(parsed.map((c) => c.note), ['Keeps'])

  assert.deepEqual(parseCorrections({}), [])
  assert.deepEqual(parseCorrections({ corrections: 'not a list' }), [])
  assert.deepEqual(parseCorrections(null), [])
})

test('the corrections block is dated, labelled, and escaped', () => {
  const html = renderCorrections(
    parseCorrections({
      corrections: [{ date: '2026-07-26T10:00:00Z', note: 'The toll is 14, not 40 & rising.' }],
    }),
  )
  assert.match(html, /id="corrections"/, 'the kicker mark links to it by id')
  assert.match(html, />Correction</, 'singular for one')
  assert.match(html, /<time datetime="2026-07-26T10:00:00Z">26 July 2026<\/time>/)
  assert.match(html, /14, not 40 &amp; rising/, 'the note is escaped, not injected')

  const many = renderCorrections(
    parseCorrections({
      corrections: [
        { date: '2026-07-24T10:00:00Z', note: 'One' },
        { date: '2026-07-26T10:00:00Z', note: 'Two' },
      ],
    }),
  )
  assert.match(many, />Corrections</, 'plural for more than one')

  // An article with no corrections must render nothing at all — not an empty
  // block, which would put a "Correction" heading on a story that has never
  // been corrected.
  assert.equal(renderCorrections([]), '')
})


// --- the framing block -----------------------------------------------------
//
// The pipeline wrote a per-source `angle` and `sentiment` for months while the
// article page showed a comma-separated list of names. These pin the three
// rules that make the block worth having rather than noise.

// The REAL shared module, not a stub of it. A hand-written copy here would
// assert against thresholds that could drift from the ones the page and the app
// actually use — which is the whole reason the module exists.
const FRAMING = await loadShared('source-framing.ts')

const withAngle = (name, angle, sentiment = 0) => ({ name, country: 'GB', url: `https://example.com/${name}`, angle, sentiment })

test('the isnad stays last — about.md says every article ends with its chain', () => {
  const html = renderIsnad([withAngle('The Guardian', 'foregrounds the setback')], '', FRAMING, {})
  assert.ok(html.includes('article-framing'), 'framing should render')
  assert.ok(
    html.indexOf('article-framing') < html.indexOf('article-sources-flat'),
    'the source chain must be the last thing on the page',
  )
})

test('nothing is drawn when no source carried an angle', () => {
  // Half the corpus predates angle extraction. A disclosure over a list of bare
  // names promises an expansion that opens onto nothing — the mistake
  // SourceRow.tsx had to unlearn.
  const html = renderIsnad([src('Reuters', 'GB'), src('AP', 'US')], '', FRAMING, {})
  assert.ok(!html.includes('article-framing'))
  assert.ok(html.includes('article-sources-flat'), 'the chain itself still renders')
})

test('only a framing that stands out is labelled', () => {
  // 64.3% of source sentiments are neutral; labelling all of them buries the
  // third that means something.
  const html = renderIsnad(
    [withAngle('Neutral Desk', 'reports the vote count', 0.05), withAngle('Critical Desk', 'questions the mandate', -0.6)],
    '', FRAMING, {},
  )
  assert.ok(!html.includes('>neutral<'), 'a neutral outlet carries no tone label')
  assert.ok(html.includes('leans critical'), 'a critical outlet does')
})

test('coverage is rounded and divergence only speaks when unusual', () => {
  const two = [withAngle('A', 'x'), withAngle('B', 'y')]
  const loud = renderIsnad(two, '', FRAMING, { eventCoverage: 91, sentimentDivergence: 0.6 })
  assert.ok(loud.includes('drawn from 90+ reports worldwide'), 'exact counts imply false precision')
  assert.ok(loud.includes('very differently'))
  const quiet = renderIsnad(two, '', FRAMING, { eventCoverage: 4, sentimentDivergence: 0.2 })
  assert.ok(!quiet.includes('framing-note'), 'an ordinary story says nothing about divergence or coverage')
})

test('one source cannot diverge from itself', () => {
  // Divergence *between outlets* is not a quantity one outlet can have, and the
  // sentence is plural. The app guarded this; the first web version did not.
  const solo = renderIsnad([withAngle('A', 'x')], '', FRAMING, { sentimentDivergence: 0.9 })
  assert.ok(!solo.includes('differently'), 'a single-source article makes no claim about outlets disagreeing')
})

test('angles are escaped, not injected', () => {
  const html = renderIsnad([withAngle('Outlet', '<script>alert(1)</script>')], '', FRAMING, {})
  assert.ok(!html.includes('<script>'))
  assert.ok(html.includes('&lt;script&gt;'))
})

test('no framing module means the page renders exactly as before', () => {
  const before = renderIsnad([withAngle('Outlet', 'an angle')], '')
  assert.ok(before.includes('article-sources-flat'))
  assert.ok(!before.includes('article-framing'))
})
