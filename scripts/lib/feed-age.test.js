// Run: node --test scripts/lib/feed-age.test.js
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { MAX_FEED_AGE_MS, MAX_WIDENED_AGE_MS, feedItemAgeMs, isFreshFeedItem, poolAgeCapMs } from './feed-age.js'

const HOUR = 60 * 60 * 1000
// The 10:01 cycle of 2026-09-26, which published two stories 21 h after
// their events and put them 36 places deep in the app's river.
const NOW = Date.parse('2026-09-26T10:02:06Z')

test('the cap outlasts the longest gap between cycles, and stays inside a day', () => {
  // 22:00 → 05:00 UTC: an item published overnight still reaches a cycle.
  assert.ok(MAX_FEED_AGE_MS > 7 * HOUR)
  assert.ok(MAX_FEED_AGE_MS < 24 * HOUR, 'past a day, a story arrives outside the river')
})

test('drops the late pickups the 10:01 cycle published', () => {
  assert.equal(isFreshFeedItem('2026-09-25T12:53:43Z', NOW), false) // EU peace facility, 21 h
  assert.equal(isFreshFeedItem('2026-09-25T18:49:40Z', NOW), false) // Latvia Barracuda, 15 h
  assert.equal(isFreshFeedItem('2026-09-25T20:37:08Z', NOW), false) // Blackbeard, 13 h
})

test('keeps what arrived since the cycles before it', () => {
  assert.equal(isFreshFeedItem('2026-09-26T09:16:09Z', NOW), true)
  assert.equal(isFreshFeedItem('2026-09-26T01:03:12Z', NOW), true) // 9 h
  assert.equal(isFreshFeedItem('2026-09-25T22:30:00Z', NOW), true) // after the 22:00 run
})

test('ages a date-only item from the end of its day, never from midnight', () => {
  // Today's: it may have happened a minute ago.
  assert.equal(feedItemAgeMs('2026-09-26T00:00:00Z', NOW), 0)
  assert.equal(isFreshFeedItem('2026-09-26', NOW), true)
  // Yesterday's, in the morning: at most ten hours ago.
  assert.equal(feedItemAgeMs('2026-09-25T00:00:00Z', NOW), NOW - Date.parse('2026-09-26T00:00:00Z'))
  assert.equal(isFreshFeedItem('2026-09-25T00:00:00Z', NOW), true)
  // Yesterday's, in the evening: at least fourteen.
  assert.equal(isFreshFeedItem('2026-09-25T00:00:00Z', Date.parse('2026-09-26T14:00:00Z')), false)
})

test('reads the RSS date formats the feeds send', () => {
  assert.equal(isFreshFeedItem('Sat, 26 Sep 2026 08:17:04 GMT', NOW), true)
  assert.equal(isFreshFeedItem('Fri, 25 Sep 2026 12:53:43 +0000', NOW), false)
})

test('an undated item is never fresh', () => {
  assert.equal(isFreshFeedItem('', NOW), false)
  assert.equal(isFreshFeedItem(undefined, NOW), false)
  assert.equal(isFreshFeedItem('not a date', NOW), false)
})

test('a full pool keeps the 12 h cut', () => {
  const ages = Array.from({ length: 80 }, (_, i) => (i / 80) * 11 * HOUR)
  assert.equal(poolAgeCapMs(ages), MAX_FEED_AGE_MS)
})

test('a thin pool reaches back exactly as far as it takes to hold sixty', () => {
  // 40 in the last 12 h, then one every half hour out to 32 h.
  const ages = [
    ...Array.from({ length: 40 }, (_, i) => (i / 40) * 11 * HOUR),
    ...Array.from({ length: 40 }, (_, i) => 12 * HOUR + i * 0.5 * HOUR),
  ]
  const cap = poolAgeCapMs(ages)
  assert.ok(cap > MAX_FEED_AGE_MS && cap < MAX_WIDENED_AGE_MS)
  assert.equal(ages.filter((a) => a < cap).length, 60)
})

test('never past a day, however thin: the 18:00 cycle of 2026-09-26', () => {
  // 39 usable at 12 h and 54 at 24 h, measured on that cycle's feed.
  const ages = [
    ...Array.from({ length: 39 }, (_, i) => (i / 39) * 11.9 * HOUR),
    ...Array.from({ length: 15 }, (_, i) => 12.5 * HOUR + i * 0.7 * HOUR),
    ...Array.from({ length: 30 }, (_, i) => 25 * HOUR + i * HOUR),
  ]
  assert.equal(poolAgeCapMs(ages), MAX_WIDENED_AGE_MS)
  assert.equal(ages.filter((a) => a < MAX_WIDENED_AGE_MS).length, 54)
  assert.equal(poolAgeCapMs([Number.NaN, HOUR]), MAX_WIDENED_AGE_MS, 'undated items do not count')
})
