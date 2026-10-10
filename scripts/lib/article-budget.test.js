// The article's length budget is written down in four places, and three of them
// cannot see each other.
//
// `write-prompt.md` tells the writer the target and the ceiling. `check-prompt.md`
// tells the editor the same two numbers in prose. `run-cycle.sh` computes each
// body's visible length and labels it OVER — that label is the only form of the
// ceiling that reaches the editor as *data*, and it is what the editor acts on.
// `mobile/lib/deck-layout.ts` sizes the app's open sheet from the ceiling before
// it has measured a single card.
//
// They drifted. The probe in `run-cycle.sh` said 400 while both prompts said 440,
// for months, and nothing caught it — because a ceiling set too low only makes
// the editor shorten articles that were already inside budget, which looks
// exactly like an editor doing its job. This test is the thing that would have
// caught it.
import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ARTICLE_CEILING } from './article.js'
import { bodyLengthLine } from './body-lengths.js'
import { SCHEMA, qualitySnapshot } from './quality-metrics.js'
import { flagsOf } from './rvs.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

/** The one place a human edits these. Everything else is checked against it. */
const TARGET_LO = 400
const TARGET_HI = 480
const CEILING = 560

test('write-prompt states the target window and the ceiling', () => {
  const s = read('scripts/write-prompt.md')
  assert.match(
    s,
    new RegExp(`${TARGET_LO}-${TARGET_HI} visible characters is the target, ${CEILING} the hard ceiling`),
    'write-prompt.md <format> no longer states the budget in the expected words',
  )
  assert.match(s, new RegExp(`over ${CEILING} get rewritten shorter`))
})

test('check-prompt enforces the same two numbers', () => {
  const s = read('scripts/check-prompt.md')
  assert.match(s, new RegExp(`targets ${TARGET_LO}-${TARGET_HI} visible characters`))
  assert.match(s, new RegExp(`hard ceiling of ${CEILING}`))
  assert.match(s, new RegExp(`\\(>${CEILING} chars\\)`), 'the OVER threshold quoted to the editor must be the ceiling')
})

test('the run-cycle probe flags at the ceiling, not below it', () => {
  // This is the number that actually reaches the editor, so it is the one that
  // matters most and the one that drifted.
  // The probe left run-cycle.sh for `scripts/body-lengths.js`; its ceiling is
  // the article module's, and the probe is asked directly where it turns.
  assert.equal(ARTICLE_CEILING, CEILING, 'the probe\'s ceiling disagrees with the prompts')
  const line = (chars) => bodyLengthLine('a.md', `---\ntitle: "T"\n---\n\n${'x'.repeat(chars)}\n`)
  assert.equal(line(CEILING), `ok ${CEILING} chars  1 blocks  a.md`)
  assert.equal(line(CEILING + 1), `OVER ${CEILING + 1} chars  1 blocks  a.md`)
  assert.match(read('scripts/lib/cycle-steps.js'), /\['node', 'scripts\/body-lengths\.js'\]/, 'the editor step no longer takes <body-lengths> from the probe')
})

test('the app sizes its open sheet from the same ceiling', () => {
  // STORY_LINES stands in for a measured card on the first frame. Keyed to the
  // ceiling at ~43 characters a line, plus one line for the paragraph break
  // between the hook and the rest.
  const s = read('mobile/lib/deck-layout.ts')
  const lines = Number(s.match(/const STORY_LINES = (\d+);/)?.[1])
  assert.ok(Number.isFinite(lines), 'deck-layout.ts no longer declares STORY_LINES')
  assert.match(s, new RegExp(`${CEILING} visible characters`), 'deck-layout.ts cites a different ceiling')

  const expected = Math.ceil(CEILING / 43) + 1
  assert.equal(
    lines,
    expected,
    `STORY_LINES is ${lines}; a ${CEILING}-character ceiling at ~43 chars a line needs ${expected}`,
  )
})

test('the quality metrics measure the current budget', () => {
  // The metric KEYS are historical names on an append-only series; the
  // thresholds inside them are what must track the budget. A bump to either
  // without a SCHEMA bump makes a redefinition read as a quality win.
  // Asked of the scan itself, now that it can be: a body one character either
  // side of each threshold.
  const over = (chars) =>
    qualitySnapshot([{ file: 'a.md', title: '', body: 'x'.repeat(chars), location: '', category: '', sourceNames: [], sourceCountries: [] }], 0).metrics
  assert.equal(over(TARGET_HI).charOver350Pct, 0)
  assert.equal(over(TARGET_HI + 1).charOver350Pct, 100, `charOver350Pct no longer turns at ${TARGET_HI}`)
  assert.equal(over(CEILING).charOver400Pct, 0)
  assert.equal(over(CEILING + 1).charOver400Pct, 100, `charOver400Pct no longer turns at ${CEILING}`)
  // Schema 3 is where the budget last changed definition; 4 is the title echo's and 5 the acronyms' (`lib/quality-metrics.js`).
  assert.equal(SCHEMA, 5, 'the budget changed definition at schema 3 — bump SCHEMA if it changes again')
})

test('the RVS writing scorer measures against the same ceiling', () => {
  // It said 350 for eleven days after the budget rose, and the dashboard showed
  // the writing score halving overnight. The scorer takes the article module's
  // ceiling now, and is asked where it turns rather than read as text.
  const inRange = (chars) => flagsOf({ title: '', body: 'x'.repeat(chars), sourceNames: [] }).charInRange
  assert.equal(inRange(CEILING), true)
  assert.equal(inRange(CEILING + 1), false, `charInRange no longer turns at ${CEILING}`)
})
