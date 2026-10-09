// Run: node --test scripts/lib/prefilter.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildTitleSets, buildWordSets, normalizeUrl } from './dedup.js'
import { prefilterFeed, reasonCounts } from './prefilter.js'

const LONG = 'x'.repeat(900)
/** A feed story; `body` is what its one or two sources carry. */
const story = (slug, { title = slug, url = `https://example.org/${slug}`, body = LONG, sources = 1 } = {}) => ({
  title,
  description: '',
  link: url,
  pubDate: '2026-10-08T17:00:00Z',
  category: 'politics',
  source: 'Dawn',
  suggestedSlug: `2026-10-08-${slug}`,
  eventUri: null,
  eventCoverage: null,
  sources: Array.from({ length: sources }, (_, i) => ({ name: i ? 'Reuters' : 'Dawn', url: i ? `${url}?wire=1` : url, country: null, body })),
  concepts: [],
  origin: /** @type {'rss'} */ ('rss'),
})
const slimOf = (feed) => JSON.parse(JSON.stringify(feed, (k, v) => (k === 'body' ? undefined : v)))

/** What has been published: one article, by slug, title and source URL. */
const ctx = {
  recentSlugs: ['2026-10-07-kramatorsk-bus-attack-kills-dozens-ukraine'],
  ledgerEventUris: new Map(),
  recentWordSets: buildWordSets(['2026-10-07-kramatorsk-bus-attack-kills-dozens-ukraine']),
  recentTitleSets: buildTitleSets([{ slug: '2026-10-07-kramatorsk-bus-attack-kills-dozens-ukraine', title: 'Russian Bomb Kills Dozens On Kramatorsk Bus', date: Date.parse('2026-10-07T10:00:00Z') }]),
  ledgerLabelSets: [],
  recentUrls: new Map([[normalizeUrl('https://kyivindependent.example/kramatorsk'), '2026-10-07-kramatorsk-bus-attack-kills-dozens-ukraine']]),
}

test('a story already published is taken out of both copies of the feed', () => {
  const feed = {
    fetchedAt: '2026-10-08T18:05:10.000Z',
    multiSourceStories: [story('same-link-new-headline-entirely', { url: 'https://kyivindependent.example/kramatorsk', sources: 2 }), story('quasicrystal-nephology-wombat-theorem', { sources: 2 })],
    nicheStories: [story('kramatorsk-bus-attack-kills-dozens'), story('zebrafish-quorum-sensing-paradox')],
  }
  const out = prefilterFeed(feed, slimOf(feed), ctx)
  assert.deepEqual(out.removed, [
    { slug: '2026-10-08-same-link-new-headline-entirely', reason: 'url', match: '2026-10-07-kramatorsk-bus-attack-kills-dozens-ukraine' },
    { slug: '2026-10-08-kramatorsk-bus-attack-kills-dozens', reason: 'fuzzy', match: '2026-10-07-kramatorsk-bus-attack-kills-dozens-ukraine' },
  ], 'in the order the selector would have met them: multi-source first')
  assert.deepEqual(out.feed.multiSourceStories.map((s) => s.suggestedSlug), ['2026-10-08-quasicrystal-nephology-wombat-theorem'])
  assert.deepEqual(out.feed.nicheStories.map((s) => s.suggestedSlug), ['2026-10-08-zebrafish-quorum-sensing-paradox'])
  assert.deepEqual(out.slim?.multiSourceStories?.map((s) => s.suggestedSlug), ['2026-10-08-quasicrystal-nephology-wombat-theorem'])
  assert.deepEqual(out.slim?.nicheStories?.map((s) => s.suggestedSlug), ['2026-10-08-zebrafish-quorum-sensing-paradox'])
  assert.equal(out.feed.fetchedAt, '2026-10-08T18:05:10.000Z', 'what else the feed carries is left alone')
})

// 2026-09-25: the selector picked 12 teasers out of 60, because it could not see them.
test('a story with no real source text is flagged where the selector reads, and only there', () => {
  const feed = { multiSourceStories: [], nicheStories: [story('zebrafish-quorum-sensing-paradox', { body: 'A teaser.' }), story('quasicrystal-nephology-wombat-theorem')] }
  const out = prefilterFeed(feed, slimOf(feed), ctx)
  assert.equal(out.thin, 1)
  assert.deepEqual(out.slim?.nicheStories?.map((s) => s.thin), [true, undefined])
  assert.ok(!out.feed.nicheStories.some((s) => 'thin' in s), 'the full feed carries the text itself')
})

test('with no selector copy there is nothing to bring into line', () => {
  const feed = { multiSourceStories: [], nicheStories: [story('zebrafish-quorum-sensing-paradox', { body: 'A teaser.' })] }
  const out = prefilterFeed(feed, null, ctx)
  assert.equal(out.slim, null)
  assert.equal(out.thin, 0)
  assert.equal(out.feed.nicheStories.length, 1)
})

test('a feed with a section missing is a feed with that section empty', () => {
  const out = prefilterFeed({}, {}, ctx)
  assert.deepEqual(out.feed, { multiSourceStories: [], nicheStories: [] })
  assert.deepEqual(out.removed, [])
})

test('the tally counts a reason it was not told of, and never to NaN', () => {
  const removed = ['url', 'url', 'recap', 'a-layer-added-later', 'a-layer-added-later'].map((reason) => ({ reason }))
  assert.deepEqual(reasonCounts(removed), { exact: 0, url: 2, eventUri: 0, fuzzy: 0, recap: 1, 'a-layer-added-later': 2 })
  // What the stage prints: every count above zero, which a NaN never was.
  const total = Object.values(reasonCounts(removed)).filter((n) => n > 0).reduce((a, b) => a + b, 0)
  assert.equal(total, removed.length)
  assert.deepEqual(reasonCounts([]), { exact: 0, url: 0, eventUri: 0, fuzzy: 0, recap: 0 })
})
