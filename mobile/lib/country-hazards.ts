import { topojsonNameFromCode } from '@shared/countries/iso';
import type { GdacsAlert } from '@shared/types';
import type { FamineArea, GenocideSituation, OverlaySelection } from './overlays';

/**
 * What the globe marks inside one country, for the country's page — the
 * country sheet opened from the globe, and the same content as a page in the
 * menu, opened from a ranking. One module, so the two list the same things.
 */

/** The alerts touching a country, gravest first. */
export function alertsInCountry(name: string, alerts: readonly GdacsAlert[]): GdacsAlert[] {
  const score = (l: GdacsAlert['alertlevel']) => (l === 'Red' ? 2 : l === 'Orange' ? 1 : 0);
  return alerts
    .filter((a) => a.country === name || a.affectedCountries.includes(name))
    .sort((a, b) => score(b.alertlevel) - score(a.alertlevel));
}

export interface CountryMark {
  key: string;
  title: string;
  detail: string;
  /** What the row opens. */
  selection: OverlaySelection;
}

/**
 * The hazard marks in a country, as rows: genocide determinations, then
 * famine areas, gravest phase first — a list of places, not a tally. Thermal
 * anomalies carry no country, only the stories they were joined to, so they
 * are reachable from those stories rather than from here.
 */
export function marksInCountry(
  name: string,
  genocide: readonly GenocideSituation[],
  famine: readonly FamineArea[],
): CountryMark[] {
  const rows: CountryMark[] = [];
  for (const situation of genocide) {
    const country = situation.profile ?? (situation.iso2 && topojsonNameFromCode(situation.iso2));
    if (country !== name) continue;
    rows.push({
      key: `genocide-${situation.id}`,
      title: `Genocide · ${situation.name}`,
      detail: 'as determined by the UN',
      selection: { kind: 'genocide', situation },
    });
  }
  const areas = famine.filter((a) => a.iso2 && topojsonNameFromCode(a.iso2) === name);
  areas.sort((a, b) => b.phase - a.phase);
  for (const area of areas) {
    rows.push({
      key: `famine-${area.id}`,
      title: area.area,
      detail: `${area.phaseName.toLowerCase()} · IPC phase ${area.phase}`,
      selection: { kind: 'famine', area },
    });
  }
  return rows;
}
