import {
  areaCaseload,
  famineTotalFor,
  famineTotalsOf,
  formatPeople,
  hungerLine,
  hungerRows,
  hungerTotal,
} from '../lib/famine-totals';
import type { FamineCountryTotal } from '../lib/overlays';

// Sums of the raw IPC file on 2026-08-09, as the build's `countryTotals` makes
// them: Sudan with a Catastrophe caseload, Gaza with no area over the bar.
const SUDAN: FamineCountryTotal = {
  iso3: 'SDN',
  iso2: 'SD',
  vintage: 'Jan 2026',
  phase: 4,
  areas: 195,
  analysed: 47_535_794,
  p3plus: 19_466_533,
  p4: 5_015_231,
  p5: 134_808,
};
const GAZA: FamineCountryTotal = {
  iso3: 'PSE',
  iso2: 'PS',
  vintage: 'May 2026',
  phase: 3,
  areas: 5,
  analysed: 2_118_215,
  p3plus: 1_239_657,
  p4: 211_821,
  p5: 0,
};

describe('famineTotalsOf', () => {
  it('is empty for a site from before the totals, never a failure', () => {
    expect(famineTotalsOf(undefined)).toEqual([]);
    expect(famineTotalsOf({})).toEqual([]);
  });

  it('drops a row that does not hold together and keeps the rest, largest first', () => {
    const rows = famineTotalsOf([
      GAZA,
      { ...SUDAN, p3plus: 'many' },
      { ...SUDAN, iso3: 'XXX', analysed: 10, p3plus: 20 },
      { ...SUDAN, iso3: 'KEN', p3plus: 0 },
      SUDAN,
      null,
    ]);
    expect(rows.map((r) => r.iso3)).toEqual(['SDN', 'PSE']);
  });
});

describe('hungerTotal', () => {
  it('adds every country’s people in crisis or worse, and is null with none', () => {
    expect(hungerTotal([SUDAN, GAZA])).toEqual({ people: 20_706_190, countries: 2 });
    expect(hungerTotal([])).toBeNull();
  });
});

describe('formatPeople', () => {
  it('is exact under a million and a decimal of a million above it', () => {
    expect(formatPeople(134_808)).toBe('134,808');
    expect(formatPeople(1_239_657)).toBe('1.2 million');
    expect(formatPeople(19_466_533)).toBe('19.5 million');
    expect(formatPeople(5_015_231)).toBe('5 million');
    expect(formatPeople(217_933_705)).toBe('218 million');
  });
});

describe('areaCaseload', () => {
  it('says how many are in the graver phases, gravest first', () => {
    expect(areaCaseload({ total: 80_000, p3plus: 52_000, p4: 30_000, p5: 12_683 })).toEqual([
      '52,000 people in crisis or worse, of 80,000 analysed.',
      'Of them, 12,683 in catastrophe and 30,000 in emergency.',
    ]);
  });

  it('leaves out a phase the analysis counts nobody in, or did not publish', () => {
    expect(areaCaseload({ total: 18_768, p3plus: 9_384, p4: 4_692, p5: 0 })).toEqual([
      '9,384 people in crisis or worse, of 18,768 analysed.',
      'Of them, 4,692 in emergency.',
    ]);
    expect(areaCaseload({ total: null, p3plus: 9_384, p4: null, p5: null })).toEqual([
      '9,384 people in crisis or worse.',
    ]);
  });

  it('says nothing where there is no caseload', () => {
    expect(areaCaseload(undefined)).toEqual([]);
    expect(areaCaseload({ total: 500, p3plus: null })).toEqual([]);
  });
});

describe('a country’s hunger', () => {
  it('prints the people, the share of those analysed, and the analysis month', () => {
    expect(hungerLine(SUDAN)).toEqual({
      title: '19.5 million people in crisis or worse',
      detail: '41% of the 47.5 million analysed · 134,808 in catastrophe · IPC, Jan 2026',
    });
    expect(hungerLine(GAZA)).toEqual({
      title: '1.2 million people in crisis or worse',
      detail: '59% of the 2.1 million analysed · IPC, May 2026',
    });
  });

  it('is found by the name the country page opens under', () => {
    expect(famineTotalFor('Palestine', [SUDAN, GAZA])).toBe(GAZA);
    expect(famineTotalFor('Sweden', [SUDAN, GAZA])).toBeUndefined();
    expect(famineTotalFor(null, [SUDAN])).toBeUndefined();
  });

  it('lists a country with no area on the globe, and skips a code with no country', () => {
    const rows = hungerRows([SUDAN, GAZA, { ...GAZA, iso3: 'ZZZ', iso2: undefined }]);
    expect(rows.map((r) => [r.country, r.detail, r.phase])).toEqual([
      ['Sudan', '19.5 million in crisis or worse · 134,808 in catastrophe · Jan 2026', 4],
      ['Palestine', '1.2 million in crisis or worse · May 2026', 3],
    ]);
  });
});
