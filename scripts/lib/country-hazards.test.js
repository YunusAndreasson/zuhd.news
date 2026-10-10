// What the hazard sources count inside one country, and the sentences for it.
//
// The join is on codes and on where a thing happened. Both were chosen against
// a failure that throws nothing: a name join that silently finds no alerts for
// the United States, and a filing that counts Gaza's dead on another country's
// page.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { bundleIsland, scratchDir } from './island-bundle.js'
import { countryHazards, iso2OfCountryName } from './country-hazards.js'
import { ROOT } from './paths.js'

const dir = scratchDir('country-hazards')
const FACTS = await import(await bundleIsland(dir, 'shared/countries/country-facts.ts', 'facts.mjs'))

/** A resolver over three boxes, standing in for the 1:50m polygons. */
const resolve = {
  iso2At: (lat, lng) => {
    if (lat > 31 && lat < 32 && lng > 34 && lng < 34.6) return 'PS' // Gaza
    if (lat > 12 && lat < 22 && lng > 22 && lng < 38) return 'SD'
    return null
  },
  iso2OfName: (name) => ({ 'Papua New Guinea': 'PG', Indonesia: 'ID', Panama: 'PA' })[name],
}

test('an alert is found by its country code, and touches every country it names', () => {
  const byCountry = countryHazards(
    {
      alerts: [
        // GDACS spells it "United States"; a profile is keyed "United States of
        // America". The code is what matches.
        { alertlevel: 'Orange', name: 'Tropical Cyclone ISAIAS-26', country: 'United States', iso3: 'USA', affectedCountries: ['United States'] },
        { alertlevel: 'Green', name: 'Earthquake in Papua New Guinea', iso3: 'PNG', affectedCountries: ['Papua New Guinea', 'Indonesia'] },
        { alertlevel: 'Red', name: 'Flood in Indonesia', iso3: 'IDN', affectedCountries: ['Indonesia'] },
        // At sea: no code and no country named. It is on no page.
        { alertlevel: 'Orange', name: 'Tropical Cyclone at sea', iso3: '', affectedCountries: [] },
      ],
    },
    resolve,
  )
  assert.deepEqual(byCountry.get('US').alerts, [{ level: 'Orange', name: 'Tropical Cyclone ISAIAS-26' }])
  assert.equal(byCountry.get('PG').lowerAlerts, 1)
  assert.deepEqual(byCountry.get('PG').alerts, [])
  // Indonesia: its own Red alert, and the neighbour's Green one that names it.
  assert.deepEqual(byCountry.get('ID').alerts, [{ level: 'Red', name: 'Flood in Indonesia' }])
  assert.equal(byCountry.get('ID').lowerAlerts, 1)
  assert.equal(byCountry.size, 3)
})

test('a country an alert reaches is found in whichever spelling the alert uses', () => {
  // `affectedCountries` is names and nothing else, and the profiles' own table
  // is Natural Earth's spellings. Off the snapshot of 2026-10-10 it resolved
  // neither "United States" nor "Russian Federation", and two entries were two
  // names in one string.
  const profile = (name) => ({ 'United States of America': 'US', Russia: 'RU', Mongolia: 'MN', China: 'CN' })[name]
  assert.deepEqual(iso2OfCountryName('United States', profile), ['US'], 'the standard name')
  assert.deepEqual(iso2OfCountryName('Russian Federation', profile), ['RU'], 'the UN’s formal one')
  assert.deepEqual(iso2OfCountryName('Mongolia, China', profile), ['MN', 'CN'], 'a border, written as one string')
  assert.deepEqual(iso2OfCountryName('Northern Mariana Is.', profile), ['MP'])
  assert.deepEqual(iso2OfCountryName('Tonga', profile), ['TO'])
  // A stretch of sea is no country.
  assert.deepEqual(iso2OfCountryName('Northern Molucca Sea', profile), [])
  assert.deepEqual(iso2OfCountryName('South Of Fiji Islands', profile), [])

  // And so a cyclone filed under Mexico that also reaches the United States is
  // on both pages, which it was not when only the alert's own code was read.
  const byCountry = countryHazards(
    { alerts: [{ alertlevel: 'Red', name: 'Tropical Cyclone', iso3: 'MEX', affectedCountries: ['Mexico', 'United States'] }] },
    { iso2At: () => null, iso2OfName: profile },
  )
  assert.deepEqual([...byCountry.keys()].sort(), ['MX', 'US'])
})

test('a conflict event counts where it happened, not where the source files it', () => {
  const event = (over) => ({ iso3: 'ISR', country: 'Israel', fatalities: 0, ...over })
  const byCountry = countryHazards(
    {
      conflict: {
        windowStart: '2026-08-25',
        windowEnd: '2026-08-31',
        events: [
          event({ lat: 31.5, lng: 34.45, fatalities: 12, deathsCivilians: 9 }),
          event({ lat: 31.3, lng: 34.3, fatalities: 4 }),
          // Outside every polygon: the source's own filing is all there is.
          event({ lat: 0, lng: 0, fatalities: 1 }),
          event({ lat: 15.5, lng: 32.5, iso3: 'SDN', fatalities: 40, deathsCivilians: 33 }),
        ],
      },
    },
    resolve,
  )
  assert.deepEqual(byCountry.get('PS').conflict, { events: 2, killed: 16, civilians: 9, windowStart: '2026-08-25', windowEnd: '2026-08-31' })
  assert.equal(byCountry.get('IL').conflict.events, 1, 'the fallback, for an event no polygon holds')
  assert.equal(byCountry.get('SD').conflict.killed, 40)
  // A snapshot with no week stated has no week to attribute a count to.
  assert.equal(countryHazards({ conflict: { events: [event({ lat: 31.5, lng: 34.45 })] } }, resolve).size, 0)
})

test('a hunger total is a row only when the sentence can be written from it', () => {
  const byCountry = countryHazards(
    {
      totals: [
        { iso3: 'SDN', iso2: 'SD', vintage: 'Jan 2026', analysed: 47_535_794, p3plus: 19_466_533, p5: 134_808 },
        { iso3: 'PSE', vintage: 'May 2026', analysed: 2_100_000, p3plus: 1_240_000, p5: 0 },
        // Nobody in crisis, and more in crisis than analysed: not statements.
        { iso3: 'KEN', iso2: 'KE', vintage: 'Feb 2026', analysed: 1000, p3plus: 0 },
        { iso3: 'SOM', iso2: 'SO', vintage: 'Feb 2026', analysed: 10, p3plus: 20 },
      ],
    },
    resolve,
  )
  assert.deepEqual([...byCountry.keys()].sort(), ['PS', 'SD'])
  assert.equal(byCountry.get('PS').hunger.p5, undefined)

  assert.deepEqual(FACTS.hungerLine(byCountry.get('SD').hunger), {
    title: '19.5 million people in crisis or worse',
    detail: '41% of the 47.5 million analysed · 134,808 in catastrophe · IPC, Jan 2026',
  })
  assert.equal(FACTS.hungerLine(byCountry.get('PS').hunger).detail, '59% of the 2.1 million analysed · IPC, May 2026')
})

test('the counts are worded as a reader would say them', () => {
  assert.equal(FACTS.formatPeople(999_999), '999,999')
  assert.equal(FACTS.formatPeople(1_240_000), '1.2 million')
  assert.equal(FACTS.formatPeople(142_000_000), '142 million')
  assert.equal(FACTS.conflictLine({ events: 18, killed: 31, civilians: 1 }), '18 events · 31 killed · 1 civilian')
  assert.equal(FACTS.conflictLine({ events: 1, killed: 0, civilians: 0 }), '1 event · 0 killed')
  assert.equal(FACTS.weekWindow('2026-08-25', '2026-08-31'), 'Aug 25–31')
  assert.equal(FACTS.weekWindow('2026-08-28', '2026-09-03'), 'Aug 28 – Sep 3')
  assert.equal(FACTS.weekWindow('2026-08-31', '2026-08-31'), 'Aug 31')
})

test('a built country page says what is counted there, or nothing at all', (t) => {
  const pages = join(ROOT, 'dist/country')
  const conflictPath = join(ROOT, 'dist/api/conflict.json')
  if (!existsSync(pages) || !existsSync(conflictPath)) {
    t.skip('dist/country or dist/api/conflict.json not built')
    return
  }
  const files = readdirSync(pages).filter((f) => f.endsWith('.html'))
  if (files.length === 0) {
    t.skip('dist/country is empty: a build in progress')
    return
  }
  let withFacts = 0
  for (const f of files) {
    const html = readFileSync(join(pages, f), 'utf8')
    assert.doesNotMatch(html, /\{\{/, `${f} still carries a placeholder`)
    const facts = html.match(/<section class="country-facts"[\s\S]*?<\/section>/)
    if (!facts) continue
    withFacts++
    // Never a heading over nothing, and never the lowest alert level alone.
    assert.match(facts[0], /country-fact-title/, `${f}: an empty facts section`)
  }
  const { events } = JSON.parse(readFileSync(conflictPath, 'utf8'))
  if (events.length) assert.ok(withFacts > 0, 'a week of conflict is on no country page')
  assert.ok(withFacts < files.length, 'every country has a hazard block: the empty case is not empty')
})
