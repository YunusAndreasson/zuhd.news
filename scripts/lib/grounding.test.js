// The grounding validator, pinned against the sentences it actually deleted.
//
// This check exists to catch an *invented* actor — a person, company or place
// the desk never mentioned. Its failure mode has never been letting one
// through; it has twice been deleting good prose for being more specific,
// better spelled, or a different part of speech than its source. Every
// `accept` case below is a real paragraph a production run threw away, quoted
// from the cycle log that dropped it.

import test from 'node:test'
import assert from 'node:assert/strict'
import { promptEcho, promptExamples, seriesEchoes, validateNumbers, validateProperNouns, validateGrounding } from './grounding.js'

const bundle = (...titles) => ({ coverage: titles.map((title) => ({ title })) })

// ── promptEcho ────────────────────────────────────────────────────────────
//
// Every case here is quoted from the 2026-09-05 dispatch, which shipped the
// prompt's own examples as live prose on four cards.

test('promptExamples reads the blockquotes and skips the short ones', () => {
  const prompt = [
    '## Rules', 'Say what it is.', '',
    '> The price of a tonne of thermal coal loaded at Newcastle, Australia, and',
    '> the benchmark Asian power stations buy against.', '',
    'More rules.', '', '> too short', '',
  ].join('\n')
  const ex = promptExamples(prompt)
  assert.equal(ex.length, 1)
  assert.match(ex[0], /^The price of a tonne of thermal coal/)
  assert.ok(!ex.some((e) => e.includes('too short')), 'a three-word quote is not an example')
})

test('promptEcho catches the verbatim copy that shipped as the Brent definition', () => {
  const example = "The price of a barrel of North Sea crude, and the benchmark most of the world's oil is sold against. It moves on supply — a strike, a sanction, a strait — and fuel, freight and fertiliser move after it."
  // What `content/.indicator-dispatch.json` actually carried for `brent`.
  assert.equal(promptEcho(example, [example]).frac, 1)
})

test('promptEcho catches the shared paragraph three FOMC cards shipped', () => {
  const example = 'An oil shock has turned the question from a cut to a hike, and the committee has to decide whether a supply-driven price rise gets the same answer as a demand-driven one — Warsh has said the Fed will have work to do if inflation does not fade.'
  const shipped = 'An oil shock has turned the question from a cut to a hike, and the committee has to decide whether a supply-driven price rise deserves the same answer as a demand-driven one. A payroll surge pushed hike odds to two-in-three.'
  const echo = promptEcho(shipped, [example])
  assert.ok(echo.frac >= 0.5, `expected a copy, got ${echo.frac}`)
})

test('a genuine sentence written against an example does not trip the gate', () => {
  // The exchange standings written on 2026-09-05 against Warsaw/Doha examples.
  const examples = [
    "The 20 largest companies on the Warsaw Stock Exchange, Poland's main market. State-controlled banks and energy firms dominate it.",
    'The 20 most traded companies on the Qatar Stock Exchange in Doha, and the deepest equity market in the Gulf outside Saudi Arabia.',
  ]
  const written = [
    "The 100 largest companies on Borsa İstanbul, Türkiye's only stock exchange. Priced in lira, so its index level carries the country's inflation as much as its earnings — read the direction, not the number.",
    'The Swiss Market Index, the 20 largest and most traded companies on the SIX Swiss Exchange in Zurich. Nestlé, Roche and Novartis carry it, which makes it defensive when the world turns risk-off.',
  ]
  for (const w of written) {
    const echo = promptEcho(w, examples)
    assert.ok(echo.frac < 0.5, `false positive at ${echo.frac} on: ${w.slice(0, 60)}`)
  }
})

test('promptEcho is null on text too short to shingle, and survives no examples', () => {
  assert.equal(promptEcho('too short', ['a b c d e f g h']), null)
  assert.equal(promptEcho('a b c d e f g h i j', []), null)
})

test('a fuller name is an elaboration, not an invention', () => {
  // 2026-08-29, both FOMC meetings: the corpus wrote "Warsh", the sentence
  // wrote "Kevin Warsh", and the two most important events on the calendar
  // lost their entire explanation over a first name.
  const b = bundle('Warsh Jackson Hole dollar rate signal')
  assert.equal(
    validateProperNouns("The meeting follows Kevin Warsh's Jackson Hole debut.", b),
    null,
  )
})

test('a country written out is the country the bundle abbreviated', () => {
  // g20-2026-miami: input said `US`, the sentence said "United States".
  const b = bundle('Wang Yi tells Washington to remove disruptions')
  assert.equal(validateProperNouns('The United States holds the presidency.', b), null)
})

test('a demonym is the place as an adjective, not a second place', () => {
  // mkt:hkex and mkt:sse died on "Chinese" against a bundle saying China;
  // mkt:jse on "African" against South Africa. Three exchange cards in one run.
  assert.equal(
    validateProperNouns('Chinese EV makers absorbed EU tariffs.', bundle('China EV makers and tariffs')),
    null,
  )
  assert.equal(
    validateProperNouns('Nothing in the South African news explains it.', bundle('South Africa unclaimed pensions')),
    null,
  )
})

test('an actor the bundle never mentions is still caught', () => {
  // The case the check is for. Neither token appears anywhere in the input.
  assert.match(
    String(validateProperNouns('The rise followed a bid from Aban Tether.', bundle('Bitcoin open interest'))),
    /Aban/,
  )
  assert.match(
    String(validateProperNouns('Analysts at Ridgeback Kettleman disagreed.', bundle('Oil prices ease'))),
    /Ridgeback/,
  )
})

test('an adjectival shape alone does not ground a name', () => {
  // "Iranian" ends in a demonym suffix, which is exactly why the suffix test
  // cannot stand on its own: the stem has to be in the bundle too.
  assert.match(
    String(validateProperNouns('Iranian Revolutionary Guard vessels shadowed it.', bundle('Wheat prices ease in Chicago'))),
    /Iranian/,
  )
})

test('numbers are still held to the bundle, proportionally', () => {
  const b = { series: { latest: 88.9, changePctOverSeries: -15.62 } }
  // Rounding a published figure is not a new claim.
  assert.equal(validateNumbers('Brent sits at $88.90, down 15.6% over the window.', b), null)
  // A figure the bundle does not carry is.
  assert.match(String(validateNumbers('Brent sits at $42.10.', b)), /42/)
})

test('the combined check runs numbers first and proper nouns only on request', () => {
  const b = bundle('Brent crude eases in the North Sea')
  // `standing` is definitional and draws on general knowledge by design, so it
  // opts out of the name scan — "North Sea" must not sink a definition.
  assert.equal(validateGrounding('Brent is priced in the North Sea basin.', b), null)
})

test('a recent that reads the chart aloud is measured, value by value', () => {
  // mkt:sse, 2026-09-04 dispatch: the whole first sentence is the series block,
  // under a chart that draws exactly it. The factory gauge is from the coverage.
  const series = {
    windowDays: 66,
    latest: 3956.4,
    changePctOverSeries: -2.47,
    extremes: { high: { value: 4163, on: 'Jun 22' }, low: { value: 3764, on: 'Jul 17' } },
    asOf: '2026-09-04',
  }
  assert.deepEqual(
    seriesEchoes(
      'The index sits near 3,956, down about 2.5% over the window from its 4,163 high on Jun 22, with the low of 3,764 on Jul 17. August’s factory gauge rose to 51.5.',
      series,
    ),
    ['3,956', '2.5', '4,163', '3,764'],
  )
})

test('a figure from the coverage is not an echo, and a date is not a reading', () => {
  // A strait averaging 11 ships a day whose low fell on the 11th: the date must
  // not count as the level, and a contract's size is the coverage's number.
  const series = { latest: 11, extremes: { high: { value: 22, on: 'Jul 11' }, low: { value: 5.6, on: 'Aug 2' } } }
  assert.deepEqual(
    seriesEchoes(
      'Sweden signed a €4.3 billion deal on 31 August for four frigates; the low came on Jul 11, and 2026 has been quiet.',
      series,
    ),
    [],
  )
  assert.deepEqual(seriesEchoes('Nothing here.', null), [])
})
