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
  const m = read('scripts/run-cycle.sh').match(/const CEILING = (\d+);/)
  assert.ok(m, 'run-cycle.sh <body-lengths> probe no longer declares a CEILING')
  assert.equal(Number(m[1]), CEILING, 'run-cycle.sh probe ceiling disagrees with the prompts')
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
  const s = read('scripts/measure-quality.js')
  assert.match(s, new RegExp(`charOver350Pct: pct\\(charLengths\\.filter\\(c => c > ${TARGET_HI}\\)`))
  assert.match(s, new RegExp(`charOver400Pct: pct\\(visibleLengths\\.filter\\(c => c > ${CEILING}\\)`))
  assert.match(s, /const SCHEMA = 3/, 'the budget changed definition at schema 3 — bump SCHEMA if it changes again')
})
