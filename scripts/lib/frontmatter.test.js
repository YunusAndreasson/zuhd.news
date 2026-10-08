import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseFrontmatter, replaceFrontmatterKey, setFrontmatterLine } from './frontmatter.js'

const doc = `---
title: "A"
sources:
  - name: "Old"
    url: "https://x"

concepts:
  - "c"
---
Body.
`

test('replaces a block in place, children and blank lines included', () => {
  const out = replaceFrontmatterKey(doc, 'sources', ['sources:', '  - name: "New"'], { before: /^concepts:/ })
  assert.equal(out, `---\ntitle: "A"\nsources:\n  - name: "New"\nconcepts:\n  - "c"\n---\nBody.\n`)
  assert.deepEqual(parseFrontmatter(out).meta.sources, [{ name: 'New' }])
})

test('an absent key is appended, and other keys are untouched', () => {
  const out = replaceFrontmatterKey(doc, 'entities', ['entities: []'])
  assert.ok(out.includes('  - "c"\nentities: []\n---\nBody.\n'))
  assert.equal(parseFrontmatter(out).meta.title, 'A')
})

test('a key is matched whole, not by prefix of another', () => {
  const out = replaceFrontmatterKey('---\nsourcesNote: "keep"\n---\n', 'sources', ['sources: []'])
  assert.equal(out, '---\nsourcesNote: "keep"\nsources: []\n---\n')
})

test('no frontmatter, no change', () => {
  assert.equal(replaceFrontmatterKey('just text', 'x', ['x: 1']), 'just text')
})

// The block of 2026-09-28 22:22, which published nothing: `$1` in the headline
// was read as the captured `title:` line.
test('a dollar figure in a set line is text, not a back-reference', () => {
  const title = 'Nvidia Authorizes Record $150 Billion Share Buyback'
  const block = `title: "Nvidia's Record Share Buyback"\ndate: "2026-09-28T21:00:00Z"`
  const out = setFrontmatterLine(block, 'socialTitle', JSON.stringify(title), { after: 'title' })
  assert.equal(out, `title: "Nvidia's Record Share Buyback"\nsocialTitle: ${JSON.stringify(title)}\ndate: "2026-09-28T21:00:00Z"`)
  assert.equal(parseFrontmatter(`---\n${out}\n---\nBody.\n`).meta.socialTitle, title)
})

test('no replacement pattern is read, inserting or replacing in place', () => {
  for (const title of ['$1', "$& and $' and $`", '$$5 and $<name>', 'US Jet Worth $30M Downed By $100K Missile']) {
    const value = JSON.stringify(title)
    const inserted = setFrontmatterLine('title: "T"', 'socialTitle', value, { after: 'title' })
    assert.equal(parseFrontmatter(`---\n${inserted}\n---\n`).meta.socialTitle, title)
    const replaced = setFrontmatterLine('title: "T"\nsocialTitle: "old"\ndate: "d"', 'socialTitle', value)
    assert.equal(replaced, `title: "T"\nsocialTitle: ${value}\ndate: "d"`)
  }
})

test('a set line with no anchor goes last', () => {
  assert.equal(setFrontmatterLine('date: "d"', 'socialTitle', '"S"', { after: 'title' }), 'date: "d"\nsocialTitle: "S"')
})
