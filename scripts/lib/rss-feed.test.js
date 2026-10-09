// Run: node --test scripts/lib/rss-feed.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bodiesFirst } from './rss-feed.js'

// --- Hacker News: five pages fetched for three stories ----------------------
const hn = (title, bodyText = null) => ({ title, bodyText })

test('the three stories used are the ones whose page gave a body', () => {
  // The 10:00 fetch of 2026-10-09: 3 of 5 pages gave a body, and the first and
  // third by comments were not among them.
  const byComments = [hn('green card'), hn('deepseek', 'I have been using…'), hn('math 2.0'), hn('fourth', 'text'), hn('fifth', 'text'), hn('sixth'), hn('seventh')]
  const taken = bodiesFirst(byComments, 5)
  assert.deepEqual(taken.slice(0, 3).map((s) => s.title), ['deepseek', 'fourth', 'fifth'])
  assert.deepEqual(taken.map((s) => s.title), ['deepseek', 'fourth', 'fifth', 'green card', 'math 2.0', 'sixth', 'seventh'], 'no story is lost, and the rest keep their order')
})

test('with every page fetched, or none, the order is by comments as it was', () => {
  const all = [hn('a', 'x'), hn('b', 'x'), hn('c', 'x'), hn('d', 'x'), hn('e', 'x'), hn('f')]
  assert.deepEqual(bodiesFirst(all, 5), all)
  const none = [hn('a'), hn('b'), hn('c'), hn('d')]
  assert.deepEqual(bodiesFirst(none, 5), none)
  assert.deepEqual(bodiesFirst([], 5), [])
})
