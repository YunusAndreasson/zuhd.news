import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseFrontmatter, replaceFrontmatterKey } from './frontmatter.js'

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
