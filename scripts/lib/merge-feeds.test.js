// Run: node --test scripts/lib/merge-feeds.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergeFeeds, stripBodies } from './merge-feeds.js'

const NOW = Date.parse('2026-10-08T18:05:10Z')
const hoursAgo = (h) => new Date(NOW - h * 3_600_000).toISOString()
const src = (name, body = 'text') => ({ name, url: `https://${name.toLowerCase().replace(/\W/g, '')}.example/1`, country: null, body })

/** A feed story with `n` sources, published `h` hours before now. */
const story = (title, h, n = 1) => ({
  title,
  description: '',
  link: 'https://example.org/1',
  pubDate: hoursAgo(h),
  category: 'politics',
  source: 'Dawn',
  suggestedSlug: `2026-10-08-${title.toLowerCase().replace(/\W+/g, '-')}`,
  eventUri: null,
  eventCoverage: null,
  sources: ['Dawn', 'Reuters', 'BBC'].slice(0, n).map((s) => src(s)),
  concepts: [],
  origin: /** @type {'rss'} */ ('rss'),
})

/** Sixty fresh single-source stories: a pool full enough that the cut stays at twelve hours. */
const full = Array.from({ length: 60 }, (_, i) => story(`Filler ${String(i).padStart(2, '0')} xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx${i}`, 1))

test('a story both feeds carry is the API copy, with its panel of sources', () => {
  const api = [story('Fed Raises Rates', 2, 3)]
  const rss = [story('Fed raises rates', 1, 1), story('Hormuz Traffic Dips', 1, 1)]
  const m = mergeFeeds(api, [...rss, ...full], NOW)
  assert.deepEqual(m.multiSourceStories.map((s) => s.title), ['Fed Raises Rates'])
  assert.ok(m.nicheStories.some((s) => s.title === 'Hormuz Traffic Dips'))
  assert.ok(!m.nicheStories.some((s) => s.title === 'Fed raises rates'), 'the same headline is the same story, whatever its case')
  assert.equal(m.counts.api, 1)
  assert.equal(m.counts.rss, 62)
})

test('with a full pool the cut is twelve hours', () => {
  const m = mergeFeeds([], [story('Half A Day Old And More', 13), story('Just Inside The Cut Today', 11), ...full], NOW)
  assert.equal(m.capMs, 12 * 3_600_000)
  assert.ok(m.nicheStories.some((s) => s.title === 'Just Inside The Cut Today'))
  assert.ok(!m.nicheStories.some((s) => s.title === 'Half A Day Old And More'))
  assert.equal(m.counts.stale, 1)
})

// 2026-09-26 18:00, a Saturday evening: 39 usable stories for a target of 15.
test('a thin pool reaches back for more, and never past a day', () => {
  const m = mergeFeeds([], [story('Thirteen Hours Old Story', 13), story('Twenty Three Hours Old', 23), story('Twenty Five Hours Old One', 25)], NOW)
  assert.equal(m.capMs, 24 * 3_600_000)
  assert.deepEqual(m.nicheStories.map((s) => s.title), ['Thirteen Hours Old Story', 'Twenty Three Hours Old'])
  assert.equal(m.counts.stale, 1)
})

test('a headline with no source is counted and left out, and does not size the cut', () => {
  const m = mergeFeeds([story('A Headline And Nothing Else', 1, 0)], full, NOW)
  assert.equal(m.counts.headlineOnly, 1)
  assert.equal(m.counts.usable, 60)
  assert.equal(m.multiSourceStories.length + m.nicheStories.length, 60)
  assert.equal(m.capMs, 12 * 3_600_000, 'sixty usable stories under twelve hours, the headline not among them')
})

test('an undated story is never fresh', () => {
  const m = mergeFeeds([], [{ ...story('No Date On This One At All', 1), pubDate: 'yesterday-ish' }, ...full], NOW)
  assert.ok(!m.nicheStories.some((s) => s.title === 'No Date On This One At All'))
  assert.equal(m.counts.stale, 1)
})

test('nothing fetched is an empty pool, not an error', () => {
  const m = mergeFeeds([], [], NOW)
  assert.deepEqual(m.counts, { api: 0, rss: 0, multi: 0, niche: 0, headlineOnly: 0, stale: 0, usable: 0 })
  assert.equal(m.capMs, 24 * 3_600_000)
})

test('the selector\'s copy loses the source text and nothing else', () => {
  const [slim] = stripBodies([story('Fed Raises Rates', 2, 2)])
  assert.deepEqual(slim.sources, [
    { name: 'Dawn', url: 'https://dawn.example/1', country: null },
    { name: 'Reuters', url: 'https://reuters.example/1', country: null },
  ])
  assert.equal(slim.title, 'Fed Raises Rates')
  assert.equal(slim.suggestedSlug, '2026-10-08-fed-raises-rates')
})
