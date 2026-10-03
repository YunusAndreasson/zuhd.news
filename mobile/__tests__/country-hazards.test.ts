import type { ConflictEvent, GdacsAlert } from '@shared/types';
import { alertsInCountry, countryFacts, marksInCountry } from '../lib/country-hazards';
import type { FamineArea, GenocideSituation } from '../lib/overlays';

const alert = (eventid: string, alertlevel: GdacsAlert['alertlevel'], country: string) =>
  ({ eventid, alertlevel, country, affectedCountries: [] as string[] }) as GdacsAlert;

describe('alertsInCountry', () => {
  it('keeps the alerts that touch the country, gravest first', () => {
    const alerts = [
      alert('g', 'Green', 'Sudan'),
      alert('r', 'Red', 'Sudan'),
      alert('x', 'Red', 'Chad'),
      { ...alert('o', 'Orange', 'Chad'), affectedCountries: ['Sudan'] },
    ];
    expect(alertsInCountry('Sudan', alerts).map((a) => a.eventid)).toEqual(['r', 'o', 'g']);
  });
});

describe('marksInCountry', () => {
  it('lists genocide determinations, then famine areas gravest first, each with what it opens', () => {
    const genocide = [{ id: 'gaza', name: 'Gaza', profile: 'Palestine' } as GenocideSituation];
    const famine = [
      { id: 'a', area: 'North', iso2: 'SD', phase: 3, phaseName: 'Crisis' },
      { id: 'b', area: 'Darfur', iso2: 'SD', phase: 5, phaseName: 'Famine' },
    ] as FamineArea[];
    expect(marksInCountry('Palestine', genocide, famine).map((m) => m.key)).toEqual([
      'genocide-gaza',
    ]);
    const sudan = marksInCountry('Sudan', genocide, famine);
    expect(sudan.map((m) => m.key)).toEqual(['famine-b', 'famine-a']);
    expect(sudan[0]?.selection).toEqual({ kind: 'famine', area: famine[1] });
  });
});

describe('countryFacts', () => {
  const gaza = {
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
  const week = {
    windowStart: '2026-08-25',
    windowEnd: '2026-08-31',
    events: [
      { country: 'Pakistan', fatalities: 12, deathsCivilians: 5, eventDate: '2026-08-26' },
      { country: 'Pakistan', fatalities: 3, eventDate: '2026-08-30' },
    ] as ConflictEvent[],
  };

  it('says a country’s hunger with no mark on the globe, with its source and month', () => {
    expect(countryFacts('Palestine', [gaza], null)).toEqual([
      {
        key: 'hunger',
        heading: 'hunger',
        title: '1.2 million people in crisis or worse',
        detail: '59% of the 2.1 million analysed · IPC, May 2026',
      },
    ]);
  });

  it('says a country’s week of conflict with the week’s dates', () => {
    expect(countryFacts('Pakistan', [gaza], week)).toEqual([
      {
        key: 'conflict',
        heading: 'conflict',
        title: '2 events · 15 killed · 5 civilians',
        detail: 'Aug 25–31, the latest week from UCDP',
      },
    ]);
  });

  it('is empty for a country neither source counts', () => {
    expect(countryFacts('Sweden', [gaza], week)).toEqual([]);
  });
});
