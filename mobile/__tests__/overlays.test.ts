import {
  conflictScale,
  famineAlpha,
  famineBlocks,
  famineBox,
  thermalAlpha,
  thermalBox,
} from '../lib/overlays';
import { isFamineSnapshot, isGenocideSnapshot, isThermalSnapshot } from '../lib/validate';

// Shapes copied from the live payloads on 2026-09-12, trimmed to one row.
const IPC = {
  generated: '2026-09-12T17:16:20.892Z',
  source: 'IPC',
  areas: [
    {
      id: 'DJI:Ali Addeh Camp',
      area: 'Ali Addeh Camp',
      level1: '',
      iso3: 'DJI',
      iso2: 'DJ',
      phase: 4,
      phaseName: 'Emergency',
      confidence: 2,
      lat: 11.0728,
      lng: 42.8776,
      vintage: 'Jun 2026',
      ageMonths: 3.4,
      from: '2026-05-01',
      to: '2026-06-30',
      pop: { total: 18768, p3plus: 9384, p4: 4692, p5: 0 },
    },
  ],
};

const FIRMS_EMPTY = {
  generated: '2026-09-12T17:16:20.892Z',
  source: 'VIIRS_SNPP_NRT',
  events: [],
};

const FIRMS = {
  events: [
    {
      id: 'f1',
      lat: 10,
      lng: 20,
      t: 1,
      tEnd: 2,
      frp: 120,
      frpPeak: 60,
      pixels: 3,
      confidence: 'high',
      daynight: 'N',
      relatedArticles: ['a-story'],
    },
  ],
};

const GENOCIDE = {
  situations: [
    {
      id: 'gaza',
      name: 'Gaza',
      iso2: 'PS',
      profile: 'Palestine',
      lat: 31.42,
      lng: 34.36,
      finding: 'determination',
      body: 'UN Independent International Commission of Inquiry',
      document: 'A/HRC/60/CRP.3',
      date: '2025-09-16',
      summary: 'The Commission concluded that genocide has been and is being committed in Gaza.',
      url: 'https://www.ohchr.org/',
      since: '2023-10',
    },
  ],
};

describe('overlay validators', () => {
  it('accept the live payload shapes, extra fields included', () => {
    expect(isFamineSnapshot(IPC)).toBe(true);
    expect(isThermalSnapshot(FIRMS_EMPTY)).toBe(true);
    expect(isThermalSnapshot(FIRMS)).toBe(true);
    expect(isGenocideSnapshot(GENOCIDE)).toBe(true);
  });

  it('reject a snapshot with a malformed row', () => {
    expect(isFamineSnapshot({ areas: [{ ...IPC.areas[0], lat: 'x' }] })).toBe(false);
    expect(isThermalSnapshot({ events: [{ ...FIRMS.events[0], confidence: 'sure' }] })).toBe(false);
    expect(
      isGenocideSnapshot({ situations: [{ ...GENOCIDE.situations[0], finding: 'alleged' }] }),
    ).toBe(false);
    expect(isFamineSnapshot(null)).toBe(false);
  });
});

describe('overlay encodings', () => {
  it('fades a famine analysis as it ages, and fills blocks by phase', () => {
    expect(famineAlpha(0)).toBe(1);
    expect(famineAlpha(12)).toBeCloseTo(0.55);
    expect(famineAlpha(40)).toBeCloseTo(0.55);
    expect([famineBlocks(3), famineBlocks(4), famineBlocks(5)]).toEqual([1, 2, 3]);
    expect(famineBlocks(9)).toBe(3);
    expect(famineBlocks(1)).toBe(0);
  });

  it("draws a famine column at the web's 10–14pt, never the glyph family's 22", () => {
    expect([famineBox(1), famineBox(2), famineBox(3)]).toEqual([10, 12, 14]);
    // An unreadable phase is an empty frame at the smallest size.
    expect(famineBox(0)).toBe(10);
  });

  it("sizes thermal marks at the web's 7–18pt on a log scale and fades them by confidence", () => {
    expect(thermalBox(0)).toBeCloseTo(6.72);
    expect(thermalBox(5000)).toBeCloseTo(17.6);
    expect(thermalBox(50_000)).toBeCloseTo(17.6);
    expect(thermalBox(100)).toBeGreaterThan(thermalBox(10));
    expect([thermalAlpha('high'), thermalAlpha('nominal'), thermalAlpha('low')]).toEqual([
      0.95, 0.8, 0.5,
    ]);
  });
});

describe('conflictScale', () => {
  it('grows with the death toll on a log scale, between 0.8 and 1.4', () => {
    expect(conflictScale(0)).toBeCloseTo(0.8);
    expect(conflictScale(9)).toBeCloseTo(1.1);
    expect(conflictScale(99)).toBeCloseTo(1.4);
    expect(conflictScale(5000)).toBeCloseTo(1.4);
    expect(conflictScale(10)).toBeGreaterThan(conflictScale(1));
  });

  it('draws an unknown count at the minimum rather than guessing', () => {
    expect(conflictScale(undefined)).toBeCloseTo(0.8);
    expect(conflictScale(Number.NaN)).toBeCloseTo(0.8);
    expect(conflictScale(-3)).toBeCloseTo(0.8);
  });
});
