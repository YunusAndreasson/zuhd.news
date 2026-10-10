// Run: node --test scripts/lib/blocks.test.js
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import { BLOCKS_MAX, BLOCKS_MIN, countBlocks, countedBlocks, splitBlocks } from './blocks.js'
import { splitFrontmatter } from './frontmatter.js'

const count = countBlocks

test('three paragraphs split into three blocks', () => {
  const body = `Tehran — Iran linked Lebanon to its nuclear terms.

5 European governments confirmed tissue samples contained epibatidine.

Britain referred Russia to the chemical weapons watchdog within 40 days.`
  assert.equal(count(body), 3)
})

// A block may legitimately carry two short sentences. Both stay inside
// the same block — the splitter only fires on paragraph breaks.
test('multi-sentence paragraph stays one block', () => {
  const body = `Hanoi — 20 million unconnected Vietnamese gained broadband.

The radio authority licensed 4 gateways. 600,000 terminals ship next month.

State carriers face a February 2027 tariff decision.`
  assert.equal(count(body), 3)
})

// Multiple blank lines collapse to one block boundary (writers occasionally
// drop an extra newline; the splitter should tolerate it).
test('extra blank lines collapse to one block break', () => {
  const body = `Block one.



Block two.

Block three.`
  assert.equal(count(body), 3)
})

// What counts as a block, and the range: one spelling for the validator, the
// article contract, the weekly scan and the editor's probe.
test('a block is longer than five characters, and an article ships with two to five', () => {
  const body = 'One block here.\n\n---\n\nab\n\nAnother after a rule.\n'
  assert.deepEqual(splitBlocks(body), ['One block here.', '---', 'ab', 'Another after a rule.'])
  assert.deepEqual(countedBlocks(body), ['One block here.', 'Another after a rule.'])
  assert.equal(countBlocks(body), 2)
  assert.equal(countBlocks('12345\n\n123456'), 1, 'five is not longer than five')
  assert.equal(countBlocks(''), 0)
  assert.deepEqual([BLOCKS_MIN, BLOCKS_MAX], [2, 5])
})

// Pipeline invariant: the editor only accepts 2..5 blocks per article.
// 3,281 articles already shipped through the 2026-05-17 backfill into
// paragraph format. If a splitter change silently shifts counts, at least
// one previously-valid article will flip out of range — catch it here
// before it ships a wave of .bad files.
// Accepted exception: 2026-04-06 North Korea piece, which the historical
// punctuation splitter could not break apart (quote-after-period pattern);
// re-verified by 2026-05-17 backfill and now in paragraph form.
test('corpus invariant: all published articles produce 2-5 blocks', () => {
  const dir = 'content/articles/'
  const files = readdirSync(dir).filter(f => f.endsWith('.md'))
  const outOfRange = []
  for (const f of files) {
    const raw = readFileSync(dir + f, 'utf8')
    // The cut every reader makes. This one stopped at the first `---` anywhere,
    // as the validator's did, and so agreed with it about two articles that
    // were five blocks and counted as six.
    const split = splitFrontmatter(raw)
    if (!split) continue
    const n = count(split.body)
    if (n < BLOCKS_MIN || n > BLOCKS_MAX) outOfRange.push(`${n} blocks: ${f}`)
  }
  assert.deepEqual(outOfRange, [], `out-of-range articles:\n  ${outOfRange.join('\n  ')}`)
})
