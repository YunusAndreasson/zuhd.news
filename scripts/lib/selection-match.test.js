import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createMatcher } from './selection-match.js'

// Fixtures for the 2026-08-30 04:00 cycle, where the keyword fallback matched
// three unrelated selections to the same marathon report and a climate study to
// a brokerage piece. The selection titles are the real ones from the cycle log;
// the feed bodies are reconstructions, tuned so each pairing still clears the
// old `overlap >= 3` rule — otherwise these tests would pin nothing. Verified:
// each case false-matches under the old rule and is rejected under the new one.
const MARATHON = {
  title: 'Kenya, Ethiopia dominate 2026 Enugu International Marathon',
  link: 'https://example.com/marathon',
  description:
    'Kenyan and Ethiopian athletes swept the podium at the Enugu International Marathon on Sunday, ' +
    'with the men\'s race decided in a sprint finish. Organisers said the federal government backed ' +
    'the event as part of a wider system of regional sports investment, and that military bands ' +
    'opened the ceremony. Runners arrived from across the border, and officials from Kenya, ' +
    'Ethiopia and Nigeria attended.',
  concepts: ['Kenya', 'Ethiopia', 'Athletics'],
  sources: [{ url: 'https://example.com/marathon', body: 'x'.repeat(600) }],
}

const BROKERAGE = {
  title: 'Robinhood and Interactive Brokers Both Ride Retail Volume. Only One Earns on Idle Cash.',
  link: 'https://example.com/brokers',
  description:
    'Retail trading volume rose across both platforms this quarter, with more than a million ' +
    'funded accounts added. Interactive Brokers earns materially more on idle customer cash, ' +
    'exposing a change in the revenue mix as rates move. Analysts said the days of pure volume ' +
    'growth are over for the sector.',
  concepts: ['Robinhood', 'Interactive Brokers'],
  sources: [{ url: 'https://example.com/brokers', body: 'x'.repeat(600) }],
}

const ICELAND = {
  title: 'Iceland referendum: voters reject reopening EU accession talks',
  link: 'https://example.com/iceland',
  description:
    'Icelandic voters rejected reopening European Union accession talks by 52.5 percent, keeping ' +
    'fisheries quotas and sovereignty over territorial waters out of Brussels\' hands.',
  concepts: ['Iceland', 'European Union'],
  sources: [{ url: 'https://example.com/iceland', body: 'x'.repeat(600) }],
}

// Filler so document frequency and the rare-word threshold behave like a real feed.
const FILLER = Array.from({ length: 20 }, (_, i) => ({
  title: `Unrelated wire story number ${i} about markets and policy`,
  link: `https://example.com/filler-${i}`,
  description: 'Officials described a policy change affecting markets across several countries.',
  concepts: [],
  sources: [{ url: `https://example.com/filler-${i}`, body: 'x'.repeat(600) }],
}))

const FEED = [MARATHON, BROKERAGE, ICELAND, ...FILLER]

test('rejects the marathon report for the Ethiopia selection (2026-08-30 regression)', () => {
  const match = createMatcher(FEED)
  const hit = match({
    title: 'Once bitter enemies Amhara, Tigray reach understandings in fight against Ethiopian govt',
    suggestedSlug: 'ethiopia-fano-tplf-alliance-federal-system-red-sea',
    link: '',
  })
  assert.notEqual(hit?.story, MARATHON, 'Ethiopia selection must not match a Nigerian marathon report')
})

test('rejects the marathon report for the Sudan selection', () => {
  const match = createMatcher(FEED)
  const hit = match({
    title: 'Sudan Nashra: Military strikes RSF convoy inside Chadian territory, sparks regional concerns',
    suggestedSlug: 'sudan-drone-war-cross-border-strike-arms-embargo',
    link: '',
  })
  assert.notEqual(hit?.story, MARATHON, 'Sudan selection must not match a Nigerian marathon report')
})

test('rejects the brokerage piece for the child heat-stress study', () => {
  const match = createMatcher(FEED)
  const hit = match({
    title: 'Climate change exposes 580 million children to 20 extra heat-stress days every year',
    suggestedSlug: 'wet-bulb-heat-stress-days-children-attribution',
    link: '',
  })
  assert.notEqual(hit?.story, BROKERAGE, 'heat-stress study must not match a brokerage earnings piece')
})

test('still matches a genuinely paraphrased title', () => {
  const match = createMatcher(FEED)
  const hit = match({
    title: 'Iceland rejects EU accession talks in referendum',
    suggestedSlug: 'iceland-referendum-eu-accession-fisheries-sovereignty',
    link: '',
  })
  assert.equal(hit?.story, ICELAND)
  assert.equal(hit.layer, 'keyword')
})

test('one feed story cannot source two different selections', () => {
  const match = createMatcher(FEED)
  const a = match({
    title: 'Iceland rejects EU accession talks in referendum',
    suggestedSlug: 'iceland-referendum-eu-accession-fisheries-sovereignty',
    link: '',
  })
  const b = match({
    title: 'Iceland referendum result keeps fisheries sovereignty out of EU accession',
    suggestedSlug: 'iceland-fisheries-quota-eu-accession-sovereignty',
    link: '',
  })
  assert.equal(a?.story, ICELAND)
  assert.notEqual(b?.story, ICELAND, 'the second selection must not reuse the already-claimed story')
})

test('an empty link is a miss, never a universal hit', () => {
  // A link-less story in the feed must not become the match for every
  // link-less selection entry.
  const linkless = {
    title: 'Some event with no medoid article',
    link: '',
    description: 'An event that arrived from the API with no info article attached.',
    concepts: [],
    sources: [{ url: '', body: 'x'.repeat(600) }],
  }
  const match = createMatcher([linkless, ...FILLER])
  const hit = match({ title: 'Completely different subject about naval logistics', suggestedSlug: 'naval-logistics-refit', link: '' })
  assert.notEqual(hit?.story, linkless)
})

test('an empty title is a miss, never a universal fingerprint hit', () => {
  const titleless = {
    title: '',
    link: 'https://example.com/titleless',
    description: 'A story that arrived with no title at all.',
    concepts: [],
    sources: [{ url: 'https://example.com/titleless', body: 'x'.repeat(600) }],
  }
  const match = createMatcher([titleless, ...FILLER])
  const hit = match({ title: '', suggestedSlug: 'some-unrelated-slug-entirely', link: '' })
  assert.notEqual(hit?.story, titleless)
})

test('exact layers still win, and in priority order', () => {
  const match = createMatcher(FEED)
  assert.equal(match({ link: 'https://example.com/iceland' })?.layer, 'link')
  assert.equal(match({ link: '', suggestedSlug: 'iceland-slug' })?.layer, undefined)
})

// `allStories` is multiSourceStories concatenated with nicheStories, so the same
// event routinely appears twice. Measuring the runner-up blindly made the feed's
// commonest shape — one event carried twice — score a near-tie against itself,
// and the correct match was discarded as ambiguous.
test('an event the feed carries twice is not a rival to itself', () => {
  const second = { ...ICELAND, link: 'https://example.com/iceland-2', sources: [{ url: 'https://example.com/iceland-2', body: 'y'.repeat(600) }] }
  const match = createMatcher([ICELAND, second, ...FILLER])
  const hit = match({
    title: 'Iceland rejects EU accession talks in referendum',
    suggestedSlug: 'iceland-referendum-eu-accession-fisheries-sovereignty',
    link: '',
  })
  assert.equal(hit?.layer, 'keyword')
  assert.ok(hit?.story, 'a duplicated feed entry must not reject the correct match')
})

test('a genuinely different story scoring close still rejects as ambiguous', () => {
  // Same entry, two unrelated feed stories that each share the threshold
  // vocabulary — this is what the margin exists for and must keep catching.
  const a = {
    title: 'Reykjavik harbour fisheries quota accession sovereignty referendum vote',
    link: 'https://example.com/a', description: 'One story.', concepts: [],
    sources: [{ url: 'https://example.com/a', body: 'x'.repeat(600) }],
  }
  const b = {
    title: 'Iceland accession sovereignty fisheries referendum quota talks',
    link: 'https://example.com/b', description: 'A different story entirely.', concepts: [],
    sources: [{ url: 'https://example.com/b', body: 'y'.repeat(600) }],
  }
  const match = createMatcher([a, b, ...FILLER])
  const hit = match({ title: 'Iceland fisheries quota referendum', suggestedSlug: 'iceland-fisheries-quota-referendum-accession-sovereignty', link: '' })
  // Either a confident pick or an explicit ambiguity rejection — never a silent
  // wrong answer with no signal.
  assert.ok(hit === null || hit.rejected === 'ambiguous' || hit.layer === 'keyword')
})
