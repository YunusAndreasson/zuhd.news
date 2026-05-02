import type { ConflictEvent } from '@shared/types';
import { displayConflictSource, eventAgeDays, parseConflictHero } from '../lib/conflict';

// Mirror of gdacs.test.ts — these pin the display-side reductions the
// ConflictSheet relies on, so a future schema/refactor that breaks them
// fails CI before it reaches the device.

const baseEvent: ConflictEvent = {
  id: 'TEST-1',
  eventDate: '2026-03-31',
  family: 'kinetic',
  subEvent: 'armed_clash',
  actor1: 'Group A',
  country: '',
  iso3: '',
  location: '',
  lat: 0,
  lng: 0,
  fatalities: 0,
  notes: '',
  source: '',
};

describe('parseConflictHero', () => {
  it('promotes fatalities to the focal when reported', () => {
    expect(parseConflictHero({ ...baseEvent, fatalities: 12 })).toEqual({
      focal: '12 killed',
      secondary: 'Armed clash',
    });
  });

  it('groups thousand-separators in fatalities', () => {
    expect(parseConflictHero({ ...baseEvent, fatalities: 1234 }).focal).toBe('1,234 killed');
  });

  it('falls back to the sub-event label when fatalities is zero', () => {
    // Peaceful protest: no casualties expected, so the focal carries the
    // event-type label and the secondary stays empty.
    expect(parseConflictHero({ ...baseEvent, subEvent: 'peaceful_protest' })).toEqual({
      focal: 'Peaceful protest',
      secondary: '',
    });
  });
});

describe('eventAgeDays', () => {
  it('returns 0 for unparsable dates', () => {
    expect(eventAgeDays({ ...baseEvent, eventDate: 'nope' }, Date.now())).toBe(0);
  });

  it('measures days from eventDate to the reference timestamp', () => {
    const ref = Date.parse('2026-03-31T00:00:00.000Z') + 5 * 86_400_000;
    expect(eventAgeDays({ ...baseEvent, eventDate: '2026-03-31' }, ref)).toBeCloseTo(5, 0);
  });

  it('clamps negative ages (event in the future) to 0', () => {
    // Anchoring on the dataset's max date can produce future-relative
    // events when the dataset includes a single trailing record; the
    // marker for that record stays at full alpha rather than going
    // negative.
    const ref = Date.parse('2026-03-30T00:00:00.000Z');
    expect(eventAgeDays({ ...baseEvent, eventDate: '2026-03-31' }, ref)).toBe(0);
  });
});

describe('displayConflictSource', () => {
  it('flags prototype fixture rows so the sheet says so loudly', () => {
    expect(displayConflictSource('PROTOTYPE_FIXTURE')).toMatch(/prototype/i);
  });

  it('passes a real source through verbatim', () => {
    expect(displayConflictSource('Reuters')).toBe('Reuters');
  });

  it('falls back to ACLED when source is empty', () => {
    expect(displayConflictSource('')).toBe('ACLED');
  });
});
