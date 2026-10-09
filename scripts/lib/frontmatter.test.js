import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseFrontmatter, removeFrontmatterKey, replaceFrontmatterKey, setFrontmatterLine, splitFrontmatter, yamlString } from './frontmatter.js'

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

const WITH_CHART = `---
title: "Trade Body Doubles Its Forecast"
chart: "brent"
sources:
  - name: "Dawn"
    url: "https://www.dawn.com/news/1"
---

Geneva — Body, with a line that starts like a key:
chart: not this one
`

test('removeFrontmatterKey takes out the key\'s line and leaves every other byte', () => {
  assert.equal(removeFrontmatterKey(WITH_CHART, 'chart'), WITH_CHART.replace('chart: "brent"\n', ''))
  assert.equal(removeFrontmatterKey(WITH_CHART, 'missing'), WITH_CHART)
  assert.equal(removeFrontmatterKey('Just prose.\nchart: x\n', 'chart'), 'Just prose.\nchart: x\n', 'a file with no frontmatter is left alone')
})

test('removeFrontmatterKey finds the key first or last in the block', () => {
  const last = WITH_CHART.replace('chart: "brent"\n', '').replace('\n---\n\nGeneva', '\nchart: "brent"\n---\n\nGeneva')
  const first = WITH_CHART.replace('chart: "brent"\n', '').replace('---\ntitle', '---\nchart: "brent"\ntitle')
  const none = WITH_CHART.replace('chart: "brent"\n', '')
  assert.equal(removeFrontmatterKey(last, 'chart'), none)
  assert.equal(removeFrontmatterKey(first, 'chart'), none)
})

test('removeFrontmatterKey takes what is indented under the key with it', () => {
  assert.equal(removeFrontmatterKey(WITH_CHART, 'sources'), WITH_CHART.replace('sources:\n  - name: "Dawn"\n    url: "https://www.dawn.com/news/1"\n', ''))
  assert.equal(parseFrontmatter(removeFrontmatterKey(WITH_CHART, 'sources')).meta.chart, 'brent')
})

// The two articles this cost were sound: five blocks each, and a `---` inside
// a source URL and an image URL.
test('the frontmatter ends at a line that is `---`, not at a `---` inside a value', () => {
  const raw = [
    '---',
    'title: "A"',
    'sources:',
    '  - name: "HT"',
    '    url: "https://example.org/Minute-by-minute---HT-Immersive-1/"',
    '    image: "https://example.org/2026/09/--------------2026-09-27---15_24.png"',
    '---',
    'Dubai — One.',
    '',
    'Two.',
    '',
  ].join('\n')
  const split = splitFrontmatter(raw)
  assert.equal(split?.body, 'Dubai — One.\n\nTwo.')
  assert.ok(split?.yaml.endsWith('15_24.png"'))
  assert.deepEqual(parseFrontmatter(raw).body, split?.body)
  assert.equal(parseFrontmatter(raw).meta.sources[0].url, 'https://example.org/Minute-by-minute---HT-Immersive-1/')
})

test('a file with no frontmatter has no split', () => {
  assert.equal(splitFrontmatter('Just prose.\n'), null)
  assert.deepEqual(parseFrontmatter('Just prose.\n'), { meta: {}, body: 'Just prose.\n' })
})

// Two stages wrapped a value in quotes and escaped only the quotes inside it.
// For a plain value that is these bytes; for one with a backslash or a line
// break it is a block that does not parse.
test('yamlString writes a value the parser reads back as it was, whatever is in it', () => {
  const byHand = (/** @type {string} */ x) => `"${x.replace(/"/g, '\\"')}"`
  for (const plain of ['Nvidia', 'stocks:2330.TW', 'L’Oréal', 'São Paulo', 'He said "no"', 'fx-pkr', '']) {
    assert.equal(yamlString(plain), byHand(plain), `the same bytes as before for ${plain}`)
  }
  for (const value of ['AT&T', 'C:\\Users', 'two\nlines', 'tab\there', 'colon: and # hash', '- dash', 'yes', '007', 'a \\"quoted\\" slash']) {
    assert.equal(parseFrontmatter(`---\nmention: ${yamlString(value)}\n---\nBody.`).meta.mention, value)
  }
  assert.throws(() => parseFrontmatter(`---\nmention: ${byHand('C:\\Users')}\n---\nBody.`), 'which is what the hand-written quoting did with a backslash')
})
