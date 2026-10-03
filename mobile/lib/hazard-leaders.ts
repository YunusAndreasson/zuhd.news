import { topojsonNameFromCode } from '@shared/countries/iso';
import type { ConflictEvent, GdacsAlert } from '@shared/types';
import { observationDate } from './data-freshness';
import type { FamineArea, GenocideSituation, ThermalEvent } from './overlays';
import { displayCountryName } from './place-names';
import { LEADERS_LINE, LEADERS_SEPARATOR, leadNames } from './row-leaders';

/** The hazard layers, in the arrays the globe draws. */
export interface HazardLayers {
  disasters: readonly GdacsAlert[];
  conflict: readonly ConflictEvent[];
  famine: readonly FamineArea[];
  genocide: readonly GenocideSituation[];
  fires: readonly ThermalEvent[];
}

/** A kind of alert, counted: `1 flood`, `27 earthquakes`. */
const ALERT_KIND: Readonly<Record<GdacsAlert['eventtype'], readonly [string, string]>> = {
  EQ: ['earthquake', 'earthquakes'],
  TC: ['cyclone', 'cyclones'],
  FL: ['flood', 'floods'],
  VO: ['volcano', 'volcanoes'],
  DR: ['drought', 'droughts'],
  WF: ['wildfire', 'wildfires'],
};

const GRAVITY: Readonly<Record<GdacsAlert['alertlevel'], number>> = { Red: 0, Orange: 1, Green: 2 };

/**
 * The Red and Orange alerts by name, gravest first. On a day with none — most
 * days — the names would be `Forest fires in Brazil` three times over, so the
 * line counts what the list holds instead: `67 wildfires · 27 earthquakes`.
 */
function disasterLead(alerts: readonly GdacsAlert[]): string[] {
  const serious = alerts
    .filter((a) => a.alertlevel !== 'Green')
    .sort((a, b) => GRAVITY[a.alertlevel] - GRAVITY[b.alertlevel]);
  if (serious.length > 0) {
    return leadNames(serious.map((a) => (a.name.length > 0 ? a.name : ALERT_KIND[a.eventtype][0])));
  }
  const counts = new Map<GdacsAlert['eventtype'], number>();
  for (const a of alerts) counts.set(a.eventtype, (counts.get(a.eventtype) ?? 0) + 1);
  return leadNames(
    [...counts]
      .sort((a, b) => b[1] - a[1])
      .map(([type, n]) => `${n} ${ALERT_KIND[type][n === 1 ? 0 : 1]}`),
  );
}

/**
 * The countries with the gravest classification, and among those the ones
 * with the most areas in it. Countries, not areas: an area is `Bakool Urban
 * IDPs (Ceel Barde, Rab Dhuure, Tayeeglow and Wajid)`, and ninety of them are
 * four countries.
 */
function famineLead(areas: readonly FamineArea[]): string[] {
  const byCountry = new Map<string, { phase: number; count: number }>();
  for (const area of areas) {
    const country = area.iso2 ? topojsonNameFromCode(area.iso2) : undefined;
    if (!country) continue;
    const seen = byCountry.get(country);
    if (!seen || area.phase > seen.phase) byCountry.set(country, { phase: area.phase, count: 1 });
    else if (area.phase === seen.phase) seen.count += 1;
  }
  const countries = [...byCountry].sort(
    (a, b) => b[1].phase - a[1].phase || b[1].count - a[1].count,
  );
  if (countries.length > 0) return leadNames(countries.map(([name]) => displayCountryName(name)));
  return leadNames([...areas].sort((a, b) => b.phase - a.phase).map((a) => a.area));
}

/**
 * Where the deadliest events were, and the last day the source has. UCDP
 * publishes weeks behind, so the day stays on the row: without it the line
 * reads as today's.
 */
function conflictLead(events: readonly ConflictEvent[]): string[] {
  let latest = '';
  for (const e of events) if (e.eventDate > latest) latest = e.eventDate;
  const day = observationDate(latest);
  const asOf = day ? `as of ${day}` : '';
  const countries = leadNames(
    [...events]
      .sort((a, b) => b.fatalities - a.fatalities)
      .map((e) => displayCountryName(e.country) ?? e.country),
    LEADERS_LINE - (asOf ? asOf.length + LEADERS_SEPARATOR.length : 0),
  );
  return countries.length > 0 && asOf ? [...countries, asOf] : countries;
}

/**
 * A hazard layer's row in the menu: what leads its list, in the list's own
 * order. Empty where the layer has nothing a line can name, and the row keeps
 * its standing sentence.
 */
export function hazardLead(key: keyof HazardLayers, hazards: HazardLayers): string {
  const parts = ((): string[] => {
    switch (key) {
      case 'genocide':
        return leadNames(hazards.genocide.map((g) => g.name));
      case 'conflict':
        return conflictLead(hazards.conflict);
      case 'famine':
        return famineLead(hazards.famine);
      case 'disasters':
        return disasterLead(hazards.disasters);
      case 'fires':
        // The place of the story a fire was joined to; the page says how far.
        return leadNames([...hazards.fires].sort((a, b) => b.frp - a.frp).map((e) => e.near));
    }
  })();
  return parts.join(LEADERS_SEPARATOR);
}
