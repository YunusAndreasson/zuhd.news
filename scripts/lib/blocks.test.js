// Run: node --test scripts/lib/blocks.test.js
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync, readdirSync } from 'fs'
import { splitBlocks } from './blocks.js'

const count = s => splitBlocks(s).filter(x => x.length > 5).length

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
    if (!/^---\n/.test(raw)) continue
    const body = raw.replace(/^---[\s\S]*?---\s*/, '').trim()
    const n = count(body)
    if (n < 2 || n > 5) outOfRange.push(`${n} blocks: ${f}`)
  }
  assert.deepEqual(outOfRange, [], `out-of-range articles:\n  ${outOfRange.join('\n  ')}`)
})
