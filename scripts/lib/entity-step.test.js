// The figure beside an indicator's level, on `/e/{id}` and in the story card's
// panel: the last step's move, named for the step it is.

import test from 'node:test'
import assert from 'node:assert/strict'
import { stepMoveLabel, stepOf } from '../build/entity-pages.js'

test('a step is named for its cadence, and a rate moves in points', () => {
  // Every series said `day`, and a rate reported a percentage of itself: the
  // Fed's quarter point was `+6.67% day`.
  assert.deepEqual(stepMoveLabel({ last: 4, prev: 3.75, unit: '%', cadence: 'monthly' }), {
    label: '+0.25 pts month',
    tone: 'pos',
  })
  assert.equal(stepMoveLabel({ last: 14473.06, prev: 14331.26, unit: '$/mt', cadence: 'monthly' }).label, '+0.99% month')
  assert.equal(stepMoveLabel({ last: 5.22, prev: 5.28, unit: '%', cadence: 'daily' }).label, '−0.06 pts day')
  // The points are the difference of the readings as printed, trimmed.
  assert.equal(stepMoveLabel({ last: 4.2, prev: 4.1, unit: '%', cadence: 'monthly' }).label, '+0.1 pts month')
  // A fall takes a true minus, not the hyphen `toFixed` writes.
  assert.deepEqual(stepMoveLabel({ last: 125.44, prev: 125.51, unit: '$/bbl', cadence: 'daily' }), {
    label: '−0.06% day',
    tone: 'neg',
  })
})

test('a rise from a negative base is a rise', () => {
  // Divided by the base as it stood, −10 to −5 read `−50.00%` in the red of a
  // fall, beside a chart table that said `+50.0%`.
  assert.deepEqual(stepMoveLabel({ last: -5, prev: -10, unit: 'index', cadence: 'daily' }), {
    label: '+50.00% day',
    tone: 'pos',
  })
  assert.equal(stepMoveLabel({ last: -15, prev: -10, unit: 'index', cadence: 'daily' }).label, '−50.00% day')
})

test('a move with no figure prints none, and no move takes no tone', () => {
  // Two days with no ships through a strait divided nothing by nothing, and the
  // page said `−NaN% day` in the red of a fall.
  assert.deepEqual(stepMoveLabel({ last: 0, prev: 0, unit: 'vessels/day', cadence: 'daily' }), {
    label: '0.00% day',
    tone: '',
  })
  // The first ship after none is not `+Infinity%`.
  assert.deepEqual(stepMoveLabel({ last: 4, prev: 0, unit: 'vessels/day', cadence: 'daily' }), { label: '—', tone: '' })
  assert.deepEqual(stepMoveLabel({ last: 4, prev: null, unit: '$', cadence: 'daily' }), { label: '—', tone: '' })
  assert.deepEqual(stepMoveLabel({ last: Number.NaN, prev: 3, unit: '$', cadence: 'daily' }), { label: '—', tone: '' })
  // From nothing, a rate still has a difference: it does not divide.
  assert.equal(stepMoveLabel({ last: 2, prev: 0, unit: '%', cadence: 'daily' }).label, '+2 pts day')
  // A move that rounds away is not set in green.
  assert.deepEqual(stepMoveLabel({ last: 3.30402, prev: 3.30386, unit: '%', cadence: 'monthly' }), {
    label: '0 pts month',
    tone: '',
  })
  // An unknown cadence names no step rather than the wrong one.
  assert.equal(stepMoveLabel({ last: 11, prev: 10, unit: 'index', cadence: 'quarterly' }).label, '+10.00%')
})

test('a series carried as daily is named for the step its own dates keep', () => {
  // US petrol is published each Monday and the 30-year mortgage each Thursday.
  // Both are `daily` in the registry, because the app in the stores accepts two
  // cadences, and their week's move was printed `−2.49% day`.
  const petrol = { cadence: 'daily', asOf: '2026-10-05', periods: ['Aug 31', 'Sep 7', 'Sep 14', 'Sep 21', 'Sep 28', 'Oct 5'] }
  assert.equal(stepOf(petrol), 'weekly')
  assert.equal(stepMoveLabel({ last: 3.13, prev: 3.21, unit: '$/gal', cadence: stepOf(petrol) }).label, '−2.49% week')

  // A weekend is not a week: a daily close is still a day's.
  const brent = { cadence: 'daily', asOf: '2026-10-06', periods: ['Sep 29', 'Sep 30', 'Oct 1', 'Oct 2', 'Oct 5', 'Oct 6'] }
  assert.equal(stepOf(brent), 'daily')
  // Nor is the turn of a year, across which a label carries no year.
  const newYear = { cadence: 'daily', asOf: '2027-01-04', periods: ['Dec 28', 'Dec 29', 'Dec 30', 'Dec 31', 'Jan 1', 'Jan 4'] }
  assert.equal(stepOf(newYear), 'daily')
  const weeklyOverNewYear = { cadence: 'daily', asOf: '2027-01-11', periods: ['Dec 7', 'Dec 14', 'Dec 21', 'Dec 28', 'Jan 4', 'Jan 11'] }
  assert.equal(stepOf(weeklyOverNewYear), 'weekly')

  // What the cadence does say is kept, and too short a series decides nothing.
  assert.equal(stepOf({ cadence: 'monthly', asOf: '2026-09-01', periods: ['Jul 2026', 'Aug 2026', 'Sep 2026'] }), 'monthly')
  assert.equal(stepOf({ cadence: 'daily', asOf: '2026-10-05', periods: ['Sep 28', 'Oct 5'] }), 'daily')
  assert.equal(stepOf({}), '')
})
