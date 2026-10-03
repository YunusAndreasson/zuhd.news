import type { ConflictEvent } from '@shared/types';
import {
  conflictNameBeside,
  conflictToll,
  conflictWeekByCountry,
  conflictWeekOf,
  countryWeekFor,
  countryWeekLine,
  weekLine,
  weekWindow,
} from '../lib/conflict-week';

const event = (over: Partial<ConflictEvent>): ConflictEvent => ({
  id: 'e',
  eventDate: '2026-08-31',
  family: 'kinetic',
  subEvent: 'armed_clash',
  actor1: 'Group A',
  country: 'Ukraine',
  iso3: 'UKR',
  location: '',
  lat: 0,
  lng: 0,
  fatalities: 1,
  notes: '',
  source: '',
  ...over,
});

const EVENTS = [
  event({ id: 'a', country: 'Ukraine', fatalities: 38, deathsCivilians: 35 }),
  event({ id: 'b', country: 'Pakistan', fatalities: 12, eventDate: '2026-08-26' }),
  event({ id: 'c', country: 'Ukraine', fatalities: 2, eventDate: '2026-08-25' }),
  event({
    id: 'd',
    country: 'Pakistan',
    fatalities: 12,
    eventDate: '2026-08-29',
    deathsCivilians: 12,
  }),
  event({ id: 'e', country: 'Yemen', fatalities: 40 }),
];
const WEEK = { windowStart: '2026-08-25', windowEnd: '2026-08-31', events: EVENTS };

describe('the conflict week', () => {
  it('is null for an empty or missing snapshot', () => {
    expect(conflictWeekOf(null)).toBeNull();
    expect(
      conflictWeekOf({ generated: '', windowStart: '', windowEnd: '', events: [] }),
    ).toBeNull();
  });

  it('names its dates, within a month and across one', () => {
    expect(weekWindow(WEEK)).toBe('Aug 25–31');
    expect(weekWindow({ windowStart: '2026-08-29', windowEnd: '2026-09-04' })).toBe(
      'Aug 29 – Sep 4',
    );
    expect(weekWindow({ windowStart: '2026-08-31', windowEnd: '2026-08-31' })).toBe('Aug 31');
  });

  it('puts the country with the most killed first, and its deadliest event first', () => {
    const rows = conflictWeekByCountry(EVENTS);
    expect(rows.map((r) => [r.name, r.killed, r.civilians, r.events.map((e) => e.id)])).toEqual([
      ['Ukraine', 40, 35, ['a', 'c']],
      ['Yemen', 40, 0, ['e']],
      // Equal tolls: the newer event leads.
      ['Pakistan', 24, 12, ['d', 'b']],
    ]);
  });

  it('prints a country’s week, and leaves civilians out where none were counted', () => {
    const [ukraine, yemen] = conflictWeekByCountry(EVENTS);
    expect(countryWeekLine(ukraine!)).toBe('2 events · 40 killed · 35 civilians');
    expect(countryWeekLine(yemen!)).toBe('1 event · 40 killed');
    expect(weekLine(WEEK)).toBe('5 events · 104 killed · 47 civilians');
  });

  it('finds a country’s week by its name, and nothing for a country at peace', () => {
    expect(countryWeekFor('Pakistan', WEEK)?.killed).toBe(24);
    expect(countryWeekFor('Sweden', WEEK)).toBeUndefined();
    expect(countryWeekFor('Pakistan', null)).toBeUndefined();
  });
});

describe('conflictToll', () => {
  it('says who the dead were, how far the reports disagree, and how many there are', () => {
    expect(
      conflictToll(
        event({
          fatalities: 38,
          fatalitiesLow: 27,
          fatalitiesHigh: 38,
          deathsCivilians: 35,
          numSources: 3,
        }),
      ),
    ).toEqual(['35 civilians among them', 'reports say 27 to 38', '3 reports']);
  });

  it('says all, not a count, when every death was a civilian', () => {
    expect(conflictToll(event({ fatalities: 6, deathsCivilians: 6 }))).toEqual(['all civilians']);
    expect(conflictToll(event({ fatalities: 1, deathsCivilians: 1, numSources: 1 }))).toEqual([
      'a civilian',
      'one report',
    ]);
  });

  it('is empty where the source gave no breakdown, and agrees on the count', () => {
    expect(conflictToll(event({ fatalities: 7, fatalitiesLow: 7, fatalitiesHigh: 7 }))).toEqual([]);
  });
});

describe('conflictNameBeside', () => {
  it('names the conflict where the actors do not already say it', () => {
    expect(
      conflictNameBeside(
        event({ conflictName: 'Israel: Palestine' }),
        'Government of Israel vs Hamas',
      ),
    ).toBe('Israel: Palestine');
    expect(
      conflictNameBeside(
        event({ conflictName: 'Russia - Ukraine' }),
        'Government of Russia (Soviet Union) vs Government of Ukraine',
      ),
    ).toBe('');
    expect(conflictNameBeside(event({}), 'Group A')).toBe('');
  });
});
