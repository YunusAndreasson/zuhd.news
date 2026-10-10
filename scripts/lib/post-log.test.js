// Run: node --test scripts/lib/post-log.test.js
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { postLog } from './post-log.js'

const dir = mkdtempSync(join(tmpdir(), 'post-log-'))
const at = (/** @type {string} */ name) => join(dir, name)

test('a log that is not there is empty, and the first entry makes it', () => {
  const path = at('first.json')
  const log = postLog('tweetLog', { path })
  assert.deepEqual(log.entries, [])
  assert.equal(log.has('2026-10-09-a'), false)
  log.add({ slug: '2026-10-09-a', sent: true })
  assert.equal(readFileSync(path, 'utf8'), '[\n  {\n    "slug": "2026-10-09-a",\n    "sent": true\n  }\n]\n')
  assert.deepEqual(readdirSync(dir), ['first.json'], 'written beside itself and renamed: no tmp file is left')
})

test('a story has gone out when an entry for its slug says sent, and only then', () => {
  const path = at('has.json')
  writeFileSync(path, JSON.stringify([{ slug: 'a', sent: false, error: 'credits depleted' }, { slug: 'b', sent: true }, { slug: 'a' }]))
  const log = postLog('tweetLog', { path })
  assert.equal(log.has('a'), false, 'a refusal is not a post')
  assert.equal(log.has('b'), true)
  assert.equal(log.has('c'), false)
})

test('the log keeps its newest hundred entries', () => {
  const path = at('cap.json')
  writeFileSync(path, JSON.stringify(Array.from({ length: 100 }, (_, i) => ({ slug: `s${i}`, sent: true }))))
  const log = postLog('pushLog', { path })
  log.add({ slug: 'newest', sent: false })
  const kept = JSON.parse(readFileSync(path, 'utf8'))
  assert.deepEqual([kept.length, kept[0].slug, kept.at(-1).slug], [100, 's1', 'newest'])
  postLog('pushLog', { path, cap: 3 }).add({ slug: 'x' })
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')).map((/** @type {any} */ e) => e.slug), ['s99', 'newest', 'x'])
})

test('an entry changed in place is written by save', () => {
  const path = at('amend.json')
  const log = postLog('instagramLog', { path })
  const entry = log.add({ slug: 'a', mediaId: '1', sent: true })
  Object.assign(entry, { commentId: '2', storyMediaId: '3' })
  log.save()
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), [{ slug: 'a', mediaId: '1', sent: true, commentId: '2', storyMediaId: '3' }])
})

// Read as empty, a log that does not parse says nothing was ever posted: the
// story goes out again and the next write replaces the log with one entry.
test('a log that does not parse, or is not a list, stops its reader and is left as it was', () => {
  for (const [name, text] of [['cut.json', '[\n  {"slug": "a", "sent": tr'], ['empty.json', ''], ['object.json', '{"a": 1}'], ['conflict.json', '<<<<<<< HEAD\n[]\n=======\n[]\n>>>>>>> x\n']]) {
    const path = at(name)
    writeFileSync(path, text)
    assert.throws(() => postLog('tweetLog', { path }), /it is not read as empty$/, name)
    assert.equal(readFileSync(path, 'utf8'), text)
  }
})
