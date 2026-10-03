import type { ConflictEvent, ConflictSnapshot } from '@shared/types';
import { formatCount } from './cards/format';
import { observationDate } from './data-freshness';
import { displayCountryName } from './place-names';

/**
 * The week the conflict layer downloads, and who died in it.
 *
 * `/api/conflict.json` is seven days of events: 195 of them on the day this
 * was written, 648 people killed, 200 of them civilians. The globe draws the
 * last day alone, to keep its marks readable, and that was all the app did
 * with the file — four fifths of it was discarded, and on every event the
 * civilian count, the range the reports gave and the number of reports were
 * validated and never read. The globe keeps its day; the list and the pages
 * get the week.
 *
 * The source runs about five weeks behind, so everything here that names the
 * week names its dates. A toll with no dates beside it reads as this week's.
 */

export interface ConflictWeek {
  windowStart: string;
  windowEnd: string;
  events: ConflictEvent[];
}

/** The snapshot as a week, or null when it holds nothing. */
export function conflictWeekOf(snapshot: ConflictSnapshot | null | undefined): ConflictWeek | null {
  if (!snapshot || snapshot.events.length === 0) return null;
  return {
    windowStart: snapshot.windowStart,
    windowEnd: snapshot.windowEnd,
    events: snapshot.events,
  };
}

/** `Aug 25–31`, or `Aug 29 – Sep 4` across a month's end. */
export function weekWindow(week: Pick<ConflictWeek, 'windowStart' | 'windowEnd'>): string {
  const start = observationDate(week.windowStart);
  const end = observationDate(week.windowEnd);
  if (!start || !end) return start || end;
  if (start === end) return start;
  if (week.windowStart.slice(0, 7) === week.windowEnd.slice(0, 7)) {
    return `${start}–${Number(week.windowEnd.slice(8, 10))}`;
  }
  return `${start} – ${end}`;
}

const civiliansOf = (e: ConflictEvent): number =>
  typeof e.deathsCivilians === 'number' && e.deathsCivilians > 0 ? e.deathsCivilians : 0;

export interface ConflictCountryWeek {
  /** The country as the source names it — the key its events carry. */
  country: string;
  /** The country as it is printed. */
  name: string;
  /** Deadliest first, then newest. */
  events: ConflictEvent[];
  killed: number;
  /** Civilians among the dead, where the source counted them. A floor: an
   *  event with no breakdown adds nothing here, which is not "none". */
  civilians: number;
}

/**
 * The week by country: where the most people were killed first, then where
 * the most happened. Compared with `<`, never `localeCompare` — the menu
 * builds this on a commit, and on Android that call goes through ICU.
 */
export function conflictWeekByCountry(events: readonly ConflictEvent[]): ConflictCountryWeek[] {
  const byCountry = new Map<string, ConflictCountryWeek>();
  for (const e of events) {
    let row = byCountry.get(e.country);
    if (!row) {
      row = {
        country: e.country,
        name: displayCountryName(e.country) ?? e.country,
        events: [],
        killed: 0,
        civilians: 0,
      };
      byCountry.set(e.country, row);
    }
    row.events.push(e);
    row.killed += e.fatalities;
    row.civilians += civiliansOf(e);
  }
  const rows = [...byCountry.values()];
  for (const row of rows) {
    row.events.sort(
      (a, b) =>
        b.fatalities - a.fatalities ||
        (a.eventDate < b.eventDate ? 1 : a.eventDate > b.eventDate ? -1 : 0),
    );
  }
  return rows.sort(
    (a, b) =>
      b.killed - a.killed || b.events.length - a.events.length || (a.name < b.name ? -1 : 1),
  );
}

const counted = (n: number, one: string, many: string) =>
  `${formatCount(n)} ${n === 1 ? one : many}`;

/** A country's week in a line: `54 events · 312 killed · 80 civilians`. */
export function countryWeekLine(
  row: Pick<ConflictCountryWeek, 'events' | 'killed' | 'civilians'>,
): string {
  return [
    counted(row.events.length, 'event', 'events'),
    `${formatCount(row.killed)} killed`,
    row.civilians > 0 ? counted(row.civilians, 'civilian', 'civilians') : '',
  ]
    .filter((s) => s.length > 0)
    .join(' · ');
}

/** One country's week, by the name its page opens under or the one it is
 *  printed as: the source's names are already the pipeline's. */
export function countryWeekFor(
  name: string | null | undefined,
  week: ConflictWeek | null | undefined,
): ConflictCountryWeek | undefined {
  if (!name || !week) return undefined;
  const shown = displayCountryName(name) ?? name;
  return conflictWeekByCountry(week.events).find(
    (row) => row.country === name || row.country === shown || row.name === shown,
  );
}

/** The whole week in a line: `195 events · 648 killed · 200 civilians`. */
export function weekLine(week: ConflictWeek): string {
  let killed = 0;
  let civilians = 0;
  for (const e of week.events) {
    killed += e.fatalities;
    civilians += civiliansOf(e);
  }
  return countryWeekLine({ events: week.events, killed, civilians });
}

/**
 * What an event's page adds under its headline count: who the dead were, how
 * far the reports disagree, and how many reports there are. Each part is the
 * source's own figure and is left out where the source has none.
 *
 * `all civilians` rather than `35 of 35`: three in four events with a
 * breakdown are that, and the count is already the headline.
 */
export function conflictToll(e: ConflictEvent): string[] {
  const parts: string[] = [];
  const civilians = civiliansOf(e);
  if (civilians > 0 && e.fatalities > 0) {
    parts.push(
      civilians >= e.fatalities
        ? e.fatalities === 1
          ? 'a civilian'
          : 'all civilians'
        : `${counted(civilians, 'civilian', 'civilians')} among them`,
    );
  }
  const low = e.fatalitiesLow;
  const high = e.fatalitiesHigh;
  if (typeof low === 'number' && typeof high === 'number' && low >= 0 && high > low) {
    parts.push(`reports say ${formatCount(low)} to ${formatCount(high)}`);
  }
  if (typeof e.numSources === 'number' && e.numSources > 0) {
    parts.push(e.numSources === 1 ? 'one report' : `${formatCount(e.numSources)} reports`);
  }
  return parts;
}

const wordsOf = (s: string): string[] =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0);

/**
 * UCDP's name for the conflict an event belongs to, where it says something
 * the actors beside it do not. `Israel: Palestine` under `Government of Israel
 * vs Hamas` does — the event is filed under Israel, and this is the line that
 * says whose conflict it is. `Russia - Ukraine` under those two governments
 * does not, and is left out.
 */
export function conflictNameBeside(e: ConflictEvent, actorLine: string): string {
  if (!e.conflictName) return '';
  const said = new Set(wordsOf(actorLine));
  return wordsOf(e.conflictName).every((w) => said.has(w)) ? '' : e.conflictName;
}
