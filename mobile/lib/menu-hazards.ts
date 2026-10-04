import type { ConflictEvent, GdacsAlert } from '@shared/types';
import { formatCount } from './cards/format';
import { conflictChooserDetails } from './conflict';
import {
  type ConflictWeek,
  conflictWeekByCountry,
  countryWeekLine,
  weekLine,
  weekWindow,
} from './conflict-week';
import { observationDate } from './data-freshness';
import { hungerRows } from './famine-totals';
import {
  conflictMarkRow,
  famineMarkRow,
  gdacsMarkRow,
  genocideMarkRow,
  type MarkRowData,
  thermalMarkRow,
} from './mark-rows';
import {
  type FamineArea,
  type FamineCountryTotal,
  famineBlocks,
  type GenocideSituation,
  type OverlaySelection,
  type ThermalEvent,
} from './overlays';
import { LEADERS_SEPARATOR } from './row-leaders';
import { countryTap, markTap, type TapResult } from './tap-result';

/**
 * The menu's hazard lists, as data: which layers there are, what each list
 * holds and under which headings, and the page a row opens.
 */

/** The hazard layers the globe draws, each a list under `world hazards`. */
export type HazardKey = 'disasters' | 'conflict' | 'famine' | 'genocide' | 'fires';

export const HAZARD_TITLES: Readonly<Record<HazardKey, string>> = {
  disasters: 'disasters',
  conflict: 'conflict',
  famine: 'famine',
  genocide: 'genocide',
  fires: 'fires',
};

/** The page a hazard row opens. */
export type MarkDetail =
  | { kind: 'alert'; alert: GdacsAlert }
  | { kind: 'conflict'; event: ConflictEvent }
  | { kind: 'overlay'; overlay: OverlaySelection }
  | { kind: 'country'; name: string; leadingFact?: string };

/** A heading between a list's rows; `note` is what the source counts under
 *  it, in plain type. */
export type ListLabel = { key: string; label: string; note?: string };
export type HazardItem = MarkRowData | ListLabel;
export const isListLabel = (item: HazardItem): item is ListLabel => 'label' in item;

/**
 * Disasters split by GDACS's own level. A feed of a hundred alerts is mostly
 * Green — small quakes, local floods — and the few Orange and Red ones were
 * rows among them, told apart only by a ring on their glyph.
 */
function withAlertHeadings(rows: MarkRowData[]): HazardItem[] {
  const serious = rows.filter((r) => r.alertlevel && r.alertlevel !== 'Green');
  const minor = rows.filter((r) => !r.alertlevel || r.alertlevel === 'Green');
  const items: HazardItem[] = [];
  if (serious.length > 0) {
    items.push({ key: 'label-serious', label: 'red and orange alerts' }, ...serious);
  }
  if (minor.length > 0) items.push({ key: 'label-minor', label: 'minor alerts' }, ...minor);
  return items;
}

/** The hazard layers, in the arrays the globe draws. */
export interface MenuHazards {
  disasters: GdacsAlert[];
  conflict: ConflictEvent[];
  famine: FamineArea[];
  genocide: GenocideSituation[];
  fires: ThermalEvent[];
  /** Each country's caseload, which is not a mark: the famine list leads with
   *  it. Empty on a site that publishes none. */
  famineTotals: FamineCountryTotal[];
  /** The source's whole week. `conflict` is its last day, which is all the
   *  globe draws; the conflict list holds the week. Null until it loads. */
  conflictWeek: ConflictWeek | null;
}

function hazardRows(key: HazardKey, hazards: MenuHazards): MarkRowData[] {
  switch (key) {
    case 'disasters':
      // Gravest last on the globe, so they paint on top; first here.
      return [...hazards.disasters]
        .reverse()
        .map((a) => gdacsMarkRow(a, markTap({ gdacsEventId: a.eventid })));
    case 'conflict': {
      // The chooser's place-and-actors line, so no two rows read alike.
      const events = [...hazards.conflict].sort((a, b) => b.fatalities - a.fatalities);
      const details = conflictChooserDetails(events, { date: false });
      return events.map((e) => {
        const row = conflictMarkRow(e, markTap({ conflictEventId: e.id }));
        return { ...row, secondary: details.get(e.id) || row.secondary };
      });
    }
    case 'famine':
      return [...hazards.famine]
        .sort((a, b) => b.phase - a.phase)
        .map((a) => famineMarkRow(a, markTap({ famineAreaId: a.id })));
    case 'genocide':
      // The page says `genocide` and whose finding it is; the row names the
      // body that made it, and the year.
      return hazards.genocide.map((g) => ({
        ...genocideMarkRow(g, markTap({ genocideId: g.id })),
        secondary: [g.body, g.date.slice(0, 4)].filter(Boolean).join(LEADERS_SEPARATOR),
      }));
    case 'fires':
      // Every row is a thermal anomaly: the page's line says so, once.
      return [...hazards.fires]
        .sort((a, b) => b.frp - a.frp)
        .map((e) => ({
          ...thermalMarkRow(e, markTap({ thermalEventId: e.id })),
          secondary: `${formatCount(e.frp)} MW`,
        }));
  }
}

/**
 * A hazard page's list, with the headings that make it more than its marks.
 *
 * Famine leads with countries by people: the marks are areas at Emergency or
 * worse, ninety-odd names in four countries, and no row among them said that
 * the same analysis counts 19 million people in Crisis across Sudan, or 1.2
 * million in Gaza, where no area is a mark at all.
 *
 * Conflict is the source's whole week under each country's toll, deadliest
 * country first. The globe draws the last day alone, and that day was all the
 * list held: four fifths of the file went unread.
 */
export function hazardItems(layer: HazardKey, hazards: MenuHazards): HazardItem[] {
  if (layer === 'famine') {
    const areas = hazardRows(layer, hazards);
    const countries = hungerRows(hazards.famineTotals).map(
      (row): MarkRowData => ({
        key: row.key,
        result: countryTap(row.country),
        primary: row.name,
        secondary: row.detail,
        kind: 'famine',
        blocks: famineBlocks(row.phase),
      }),
    );
    if (countries.length === 0) return areas;
    return [
      { key: 'label-countries', label: 'people in crisis or worse' },
      ...countries,
      ...(areas.length > 0
        ? [{ key: 'label-areas', label: 'areas in emergency or worse' }, ...areas]
        : []),
    ];
  }
  if (layer === 'conflict' && hazards.conflictWeek) {
    const items: HazardItem[] = [];
    for (const country of conflictWeekByCountry(hazards.conflictWeek.events)) {
      items.push({
        key: `label-${country.country}`,
        // The name is the heading; the toll is a reading, set as one.
        label: country.name,
        note: countryWeekLine(country),
      });
      for (const e of country.events) {
        const row = conflictMarkRow(e, markTap({ conflictEventId: e.id }));
        // The heading names the country; the row says the day and the place.
        const where = [observationDate(e.eventDate), e.location || e.admin1]
          .filter(Boolean)
          .join(' · ');
        items.push({ ...row, secondary: where || row.secondary });
      }
    }
    return items;
  }
  const marks = hazardRows(layer, hazards);
  return layer === 'disasters' ? withAlertHeadings(marks) : marks;
}

/** The page a hazard row opens: the mark its tap names, found in the layers
 *  the list was built from. */
export function markDetail(result: TapResult, hazards: MenuHazards): MarkDetail | null {
  if (result.gdacsEventId) {
    const alert = hazards.disasters.find((a) => a.eventid === result.gdacsEventId);
    return alert ? { kind: 'alert', alert } : null;
  }
  if (result.conflictEventId) {
    // The week's, where the list is the week: most of its rows are events the
    // globe does not draw.
    const events = hazards.conflictWeek?.events ?? hazards.conflict;
    const event = events.find((e) => e.id === result.conflictEventId);
    return event ? { kind: 'conflict', event } : null;
  }
  if (result.famineAreaId) {
    const area = hazards.famine.find((a) => a.id === result.famineAreaId);
    return area ? { kind: 'overlay', overlay: { kind: 'famine', area } } : null;
  }
  if (result.genocideId) {
    const situation = hazards.genocide.find((g) => g.id === result.genocideId);
    return situation ? { kind: 'overlay', overlay: { kind: 'genocide', situation } } : null;
  }
  if (result.thermalEventId) {
    const event = hazards.fires.find((e) => e.id === result.thermalEventId);
    return event ? { kind: 'overlay', overlay: { kind: 'thermal', event } } : null;
  }
  // A row that is a country and no mark: the famine list's caseloads.
  if (result.countryName) return { kind: 'country', name: result.countryName };
  return null;
}

/** Each layer's count and what it is, in the globe's order of gravity. */
export interface HazardLayer {
  key: HazardKey;
  count: number;
  note: string;
}

export function hazardLayers(hazards: MenuHazards): HazardLayer[] {
  const conflictDay = observationDate(hazards.conflict[0]?.eventDate);
  const week = hazards.conflictWeek;
  return [
    { key: 'genocide' as const, count: hazards.genocide.length, note: 'As determined by the UN' },
    {
      key: 'conflict' as const,
      count: week ? week.events.length : hazards.conflict.length,
      // UCDP publishes weeks behind events, so its dates are said, never
      // "today". With the week, the line is its toll: the one place the whole
      // week is added up.
      note: week
        ? [weekWindow(week), weekLine(week), 'UCDP'].join(LEADERS_SEPARATOR)
        : conflictDay
          ? `${conflictDay} · UCDP`
          : 'UCDP',
    },
    {
      key: 'famine' as const,
      count: hazards.famine.length,
      note:
        hazards.famineTotals.length > 0
          ? 'A share is of the people analysed · IPC'
          : 'Areas in crisis or worse · IPC',
    },
    {
      key: 'disasters' as const,
      count: hazards.disasters.length,
      note: 'Live alerts · GDACS',
    },
    {
      key: 'fires' as const,
      count: hazards.fires.length,
      note: 'Thermal anomalies seen from space, near the news · NASA FIRMS',
    },
  ].filter((layer) => layer.count > 0);
}
