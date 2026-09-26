import type { GdacsAlert } from '@shared/types';
import { alertsInCountry, marksInCountry } from '../lib/country-hazards';
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
