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
import { seriesEchoes, validateNumbers, validateProperNouns, validateGrounding } from './grounding.js'

const bundle = (...titles) => ({ coverage: titles.map((title) => ({ title })) })

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
