// Run: node --test scripts/lib/cycle-tally.test.js
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { test } from 'node:test'
import { apiStats, feedStats, rssStats, selectionCount, tally } from './cycle-tally.js'
import { ROOT } from './paths.js'

/** A reader over a set of files, by catalog name; one not in the set is not there. */
const files = (/** @type {Record<string, string>} */ set) => (/** @type {string} */ name) => {
  if (!(name in set)) throw new Error(`ENOENT: ${name}`)
  return set[name]
}

test('each count reads the shape its stage writes', () => {
  assert.equal(apiStats({ stories: [1, 2, 3], events: 50 }), '3 stories from 50 events')
  assert.equal(rssStats({ stories: [1, 2] }), 2)
  assert.equal(rssStats({ freshItems: 7 }), 0, 'a file with no list of stories holds none')
  assert.equal(rssStats({ stories: [] }), 0)
  assert.equal(feedStats({ multiSourceStories: [1], nicheStories: [1, 2] }), '1 multi + 2 niche')
  assert.equal(feedStats({}), '0 multi + 0 niche')
  assert.equal(selectionCount([{}, {}, {}]), 3)
  assert.equal(selectionCount({ length: 5 }), 0, 'what is not a list holds no stories')
})

test('by kind, from the named file', () => {
  const read = files({ feedApi: '{"stories":[1,2,3],"events":50}', feedRss: '{"stories":[1,2]}', feed: '{"multiSourceStories":[1],"nicheStories":[1,2]}', selection: '[{},{}]' })
  assert.equal(tally('feed-api', read), '3 stories from 50 events')
  assert.equal(tally('feed-rss', read), 2)
  assert.equal(tally('feed', read), '1 multi + 2 niche')
  assert.equal(tally('selection', read), 2)
})

// Three fallbacks, each as the script's inline program had it: one goes into a
// log line, one into a figure, and the selection's is bash's (`|| echo 0`).
test('a file that is missing or is not what the count expects gets that count\'s own answer', () => {
  for (const read of [files({}), files({ feedApi: 'not json', feedRss: '', feed: 'null' }), files({ feedApi: '{}', feedRss: 'null', feed: '[' })]) {
    assert.equal(tally('feed-api', read), 'failed')
    assert.equal(tally('feed-rss', read), '0')
    assert.equal(tally('feed', read), 'failed')
  }
  assert.equal(tally('feed-api', files({ feedApi: '{"stories":[1]}' })), '1 stories from undefined events', 'a figure the file does not carry is printed as it reads')
  assert.throws(() => tally('selection', files({})), /ENOENT/)
  assert.throws(() => tally('selection', files({ selection: '[{"title": "cut' })), SyntaxError)
})

test('a count nobody defined is an error, not a zero', () => {
  assert.throws(() => tally('selections', files({})), /no count named "selections"/)
})

// The harness runs the orchestrator against a stand-in for `node`, so nothing
// there starts this file. If it could not load, the script's `|| echo 0` would
// read every selection as empty and the cycle would publish nothing, quietly.
// Asked for a count that does not exist, it fails before it opens any file.
test('the entry script itself loads and runs', () => {
  const res = spawnSync(process.execPath, [join(ROOT, 'scripts/cycle/tally.js'), 'no-such-count'], { encoding: 'utf8' })
  assert.equal(res.status, 1)
  assert.equal(res.stdout, '')
  assert.match(res.stderr, /no count named "no-such-count"/)
})
