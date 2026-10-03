import type { ConflictEvent, GdacsAlert } from '@shared/types';
import { type HazardLayers, hazardLead } from '../lib/hazard-leaders';
import type { FamineArea, GenocideSituation, ThermalEvent } from '../lib/overlays';
import { leadNames } from '../lib/row-leaders';
import { settingsSummary } from '../lib/settings-summary';

const layers = (over: Partial<HazardLayers>): HazardLayers => ({
  disasters: [],
  conflict: [],
  famine: [],
  genocide: [],
  fires: [],
  ...over,
});

const alert = (
  eventtype: GdacsAlert['eventtype'],
  alertlevel: GdacsAlert['alertlevel'],
  name: string,
) => ({ eventtype, alertlevel, name }) as GdacsAlert;

describe('leadNames', () => {
  it('keeps up to three whole names, in order, without repeats or blanks', () => {
    expect(leadNames(['a', '', 'a', null, 'b', 'c', 'd'])).toEqual(['a', 'b', 'c']);
  });

  it('stops before the name that would run past the line, but always keeps the first', () => {
    expect(leadNames(['Central African Republic', 'Chad', 'x'.repeat(30)])).toEqual([
      'Central African Republic',
      'Chad',
    ]);
    expect(leadNames(['x'.repeat(60), 'Chad'])).toEqual(['x'.repeat(60)]);
  });
});

describe('hazardLead', () => {
  it('names the genocide determinations', () => {
    const genocide = [{ name: 'Gaza' }, { name: 'Rakhine' }] as GenocideSituation[];
    expect(hazardLead('genocide', layers({ genocide }))).toBe('Gaza · Rakhine');
  });

  it('names famine by country: the gravest phase first, then the most areas in it', () => {
    const famine = [
      { area: 'Bay Urban IDPs (Baydhaba)', iso2: 'SO', phase: 4 },
      { area: 'El Fasher', iso2: 'SD', phase: 4 },
      { area: 'Kadugli', iso2: 'SD', phase: 4 },
      { area: 'Hajjah', iso2: 'YE', phase: 3 },
      { area: 'Gaza Governorate', iso2: 'PS', phase: 5 },
    ] as FamineArea[];
    expect(hazardLead('famine', layers({ famine }))).toBe('Palestine · Sudan · Somalia');
  });

  it('falls back to area names where no area carries a country', () => {
    const famine = [
      { area: 'North', phase: 3 },
      { area: 'Darfur', phase: 5 },
    ] as FamineArea[];
    expect(hazardLead('famine', layers({ famine }))).toBe('Darfur · North');
  });

  it('names the deadliest conflict countries once each, and says how old the data is', () => {
    const conflict = [
      { country: 'Nigeria', fatalities: 30, eventDate: '2026-08-28' },
      { country: 'Ukraine', fatalities: 38, eventDate: '2026-08-28' },
      { country: 'Nigeria', fatalities: 26, eventDate: '2026-08-31' },
      { country: 'Yemen', fatalities: 29, eventDate: '2026-08-29' },
    ] as ConflictEvent[];
    expect(hazardLead('conflict', layers({ conflict }))).toBe(
      'Ukraine · Nigeria · Yemen · as of Aug 31',
    );
  });

  it('names Red and Orange alerts, gravest first', () => {
    const disasters = [
      alert('WF', 'Green', 'Forest fires in Brazil'),
      alert('EQ', 'Orange', 'Earthquake in Peru'),
      alert('TC', 'Red', 'Cyclone Ragasa'),
    ];
    expect(hazardLead('disasters', layers({ disasters }))).toBe(
      'Cyclone Ragasa · Earthquake in Peru',
    );
  });

  it('counts the kinds on a day of minor alerts, the most first', () => {
    const disasters = [
      alert('EQ', 'Green', 'Earthquake in Chile'),
      alert('WF', 'Green', 'Forest fires in Brazil'),
      alert('WF', 'Green', 'Forest fires in Brazil'),
    ];
    expect(hazardLead('disasters', layers({ disasters }))).toBe('2 wildfires · 1 earthquake');
  });

  it('names where the largest fires are, and is empty where nothing can be named', () => {
    const fires = [
      { frp: 4, near: 'Ilsky' },
      { frp: 11, near: 'Fort McMurray' },
      { frp: 90 },
    ] as ThermalEvent[];
    expect(hazardLead('fires', layers({ fires }))).toBe('Fort McMurray · Ilsky');
    expect(hazardLead('fires', layers({ fires: [{ frp: 90 }] as ThermalEvent[] }))).toBe('');
    expect(hazardLead('conflict', layers({}))).toBe('');
  });
});

describe('settingsSummary', () => {
  it('says what the settings are', () => {
    expect(settingsSummary({ fontSize: 'large', appearance: 'dark', notifications: true })).toBe(
      'Large text · dark · notifications on',
    );
    expect(
      settingsSummary({ fontSize: 'default', appearance: 'system', notifications: false }),
    ).toBe('Default text · system theme · notifications off');
  });
});
