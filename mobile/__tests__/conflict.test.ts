import type { ConflictEvent } from '@shared/types';
import {
  collapseConflictVisuals,
  conflictChooserDetails,
  displayConflictSource,
  eventAgeDays,
  parseConflictHero,
} from '../lib/conflict';

describe('conflict visual clustering', () => {
  it('collapses nearby painted glows while retaining cluster size', () => {
    const clusters = collapseConflictVisuals([
      { x: 100, y: 100, recencyAlpha: 0.5, scale: 0.8 },
      { x: 103, y: 102, recencyAlpha: 0.9, scale: 0.7 },
      { x: 180, y: 180, recencyAlpha: 1, scale: 1.1 },
    ]);
    expect(clusters).toHaveLength(2);
    expect(clusters[0]).toMatchObject({ count: 2, recencyAlpha: 0.9, scale: 0.8 });
    expect(clusters[0]?.x).toBeCloseTo(101.5);
    expect(clusters[0]?.y).toBeCloseTo(101);
    expect(clusters[1]).toMatchObject({ count: 1, x: 180, y: 180 });
  });

  it('merges transitive neighbours into one theatre cluster', () => {
    const clusters = collapseConflictVisuals([
      { x: 0, y: 0, recencyAlpha: 1, scale: 1 },
      { x: 10, y: 0, recencyAlpha: 0.8, scale: 0.9 },
      { x: 20, y: 0, recencyAlpha: 0.7, scale: 0.8 },
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.count).toBe(3);
  });
});

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

describe('conflict chooser descriptions', () => {
  it('distinguishes otherwise identical casualties and event types by locality and date', () => {
    const rows = conflictChooserDetails([
      { ...baseEvent, id: 'a', location: 'Az-Zawayda', country: 'Israel' },
      { ...baseEvent, id: 'b', location: 'Gaza City', country: 'Israel' },
    ]);
    expect(rows.get('a')).toContain('2026-03-31 · Az-Zawayda');
    expect(rows.get('b')).toContain('Gaza City');
    expect(rows.get('a')).not.toBe(rows.get('b'));
  });

  it('distinguishes same-place reports by actors, then report position if necessary', () => {
    const rows = conflictChooserDetails([
      { ...baseEvent, id: 'a' },
      { ...baseEvent, id: 'b' },
      { ...baseEvent, id: 'c', actor1: 'Group B' },
    ]);
    expect(rows.get('a')).toContain('Group A · report 1 of 2');
    expect(rows.get('b')).toContain('Group A · report 2 of 2');
    expect(rows.get('c')).toContain('Group B');
    expect(new Set(rows.values()).size).toBe(3);
  });
});

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
  it('passes a real source through verbatim', () => {
    expect(displayConflictSource('Reuters')).toBe('Reuters');
  });

  it('falls back to UCDP when source is empty', () => {
    expect(displayConflictSource('')).toBe('UCDP');
  });
});
