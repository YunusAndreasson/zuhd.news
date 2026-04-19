// Run: node --test scripts/lib/sentences.test.js
//
// Each assertion here pins a real bug the splitter has had in production.
// If a future change reintroduces any of them, the matching test fails.
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync, readdirSync } from 'fs'
import { splitSentences } from './sentences.js'

const count = s => splitSentences(s).filter(x => x.length > 5).length

// 2026-04-19: country-tags feature made the writer emit `[Country](country:XX)`.
// Old regex `(?=[A-Z])` refused to split before `[`, so 3-sentence articles
// whose every boundary fell before a country link collapsed to 1 sentence
// and the validator moved them to .bad. See .bad files dated 2026-04-19.
test('splits before a country markdown link', () => {
  const body = 'Tehran — The ceasefire expires Wednesday. [Iran](country:IR) said progress. [US](country:US) demands uranium.'
  assert.equal(count(body), 3)
})

// 2026-04-13 pope-leo-africa.md.bad: the ABBREVS `[A-Z]\.` alternative
// masked the trailing letter of any 2-letter acronym (US./UK./EU./UN.)
// as if it were an initial, collapsing real sentence boundaries.
test('two-letter acronym at sentence end is a real boundary', () => {
  assert.equal(count('Before the US. Africa responded. The UK agreed.'), 3)
  assert.equal(count('Signed in the UK. The EU disagreed.'), 2)
})

// Counter-case for the 2-letter-acronym fix: real initials must still be
// masked, otherwise "J. K. Rowling" becomes three sentences and every
// "Dr. Smith" splits mid-sentence. The fix uses a negative lookbehind so
// only *isolated* capitals (not runs) are treated as initials.
test('single-letter initials do not split', () => {
  assert.equal(count('Written by J. K. Rowling. The book sold well.'), 2)
  assert.equal(count('Dr. Smith met Mr. Jones in St. Louis. They talked.'), 2)
})

// Dotted acronyms like U.N. / p.m. / U.S. would otherwise look like a
// string of single-letter initials and split on every dot.
test('dotted acronyms stay intact', () => {
  assert.equal(count('The U.N. voted. Russia abstained.'), 2)
  assert.equal(count('At 3 p.m. he left.'), 1)
})

// Pipeline invariant: the editor only accepts 2..5 sentences per article,
// and 1,790 articles already shipped. If a splitter change silently shifts
// counts, at least one previously-valid article will flip out of range —
// catch it here before it ships a wave of .bad files.
// Known pre-existing failure: 2026-04-06-north-korea-... (1 sentence, genuinely short).
test('corpus invariant: published articles stay within validator range', () => {
  const dir = 'content/articles/'
  const files = readdirSync(dir).filter(f => f.endsWith('.md'))
  const outOfRange = []
  for (const f of files) {
    const raw = readFileSync(dir + f, 'utf8')
    if (!/^---\n/.test(raw)) continue
    const body = raw.replace(/^---[\s\S]*?---\s*/, '').trim()
    const n = count(body)
    if (n < 2 || n > 5) outOfRange.push(`${n} sents: ${f}`)
  }
  // Accept the one historically-short article; fail on anything else.
  const known = '2026-04-06-north-korea-conciliation-seoul-drone-regret.md'
  const unexpected = outOfRange.filter(x => !x.endsWith(known))
  assert.deepEqual(unexpected, [], `new out-of-range articles:\n  ${unexpected.join('\n  ')}`)
})

// Pipeline invariant: every .bad file on disk today is .bad for a known
// reason (frontmatter/content issue). If a splitter change makes one of
// them suddenly "valid", either we've rescued it (good, remove .bad) or
// the splitter is newly wrong. Either way: surface it.
test('no previously-bad file silently becomes valid', () => {
  const dir = 'content/articles/'
  const bads = readdirSync(dir).filter(f => f.endsWith('.bad'))
  const knownRescues = new Set([
    // These .bad files are bad only because of frontmatter/content, not
    // sentence count; passing the splitter check is expected and fine.
    '2026-03-24-grab-buys-delivery-hero-taiwan-600m-southeast-asia.md.bad',
    '2026-03-24-ukraine-drones-cripple-russia-largest-oil-port-primorsk.md.bad',
    // Rescued by fix 1b (ABBREVS no longer masks 2-letter acronyms):
    '2026-03-31-claude-code-source-leaked-npm-map-file.md.bad',       // NPM.
    '2026-03-31-thomson-reuters-ice-palantir-surveillance-data.md.bad', // ICE.
    '2026-04-13-lafarge-guilty-financing-isis-nusra-syria.md.bad',     // ISIS.
    '2026-04-13-pope-leo-africa-voyage-four-countries.md.bad',         // US.
    // Rescued by fix 1 (lookahead allows `[` after a period):
    '2026-04-19-hormuz-reopen-economic-aftermath-insurance-shipping.md.bad',
    '2026-04-19-iran-us-talks-progress-uranium-rejection-stalemate.md.bad',
  ])
  const surprises = []
  for (const f of bads) {
    if (knownRescues.has(f)) continue
    const body = readFileSync(dir + f, 'utf8').replace(/^---[\s\S]*?---\s*/, '').trim()
    const n = count(body)
    if (n >= 2 && n <= 5) surprises.push(`${n} sents: ${f}`)
  }
  assert.deepEqual(surprises, [], `.bad files unexpectedly now valid:\n  ${surprises.join('\n  ')}`)
})
