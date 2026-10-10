// Run: node --test scripts/lib/gdacs-narrations.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { staleKeys } from './dispatch.js'
import { narrativeFor } from './gdacs-narrations.js'

test('a narrative is applied only at the level it was written for', () => {
  // TC:1001335, 2026-10-09: "…no population is recorded in the hurricane wind
  // zone. The Red alert re…". Downgraded, the storm is no longer narrated, and
  // the entry was applied to it whatever its level.
  const entry = { narrative: 'No country is listed in the storm path. The Red alert reflects the wind field.', alertlevel: 'Red' }
  assert.equal(narrativeFor(entry, { alertlevel: 'Red' }), entry.narrative)
  assert.equal(narrativeFor(entry, { alertlevel: 'Orange' }), null, 'a rewrite that failed leaves no paragraph, not the old level’s')
  assert.equal(narrativeFor(entry, { alertlevel: 'Green' }), null)
})

test('an entry from before the level was recorded was written at Orange or Red', () => {
  const entry = { narrative: 'Taal is erupting in a densely settled country.' }
  assert.equal(narrativeFor(entry, { alertlevel: 'Orange' }), entry.narrative)
  assert.equal(narrativeFor(entry, { alertlevel: 'Red' }), entry.narrative)
  assert.equal(narrativeFor(entry, { alertlevel: 'Green' }), null)
})

test('no entry, or one with no text, is no narrative', () => {
  assert.equal(narrativeFor(undefined, { alertlevel: 'Red' }), null)
  assert.equal(narrativeFor({ narrative: '', alertlevel: 'Red' }, { alertlevel: 'Red' }), null)
})

test('the prune holds every narrative when the snapshot carries no alert', () => {
  // The narrator prunes with `staleKeys`, one source. A snapshot with no
  // alerts is a feed that did not load (GDACS always has the month's green
  // earthquakes), and it used to empty the cache to match.
  const cached = ['TC:1001335', 'EQ:1570077', 'VO:1000151']
  assert.deepEqual(staleKeys(cached, []), { drop: [], held: { '': 3 } })
  assert.deepEqual(staleKeys(cached, ['EQ:1570077', 'EQ:1']).drop, ['TC:1001335', 'VO:1000151'], 'an alert that left the feed still goes')
})
