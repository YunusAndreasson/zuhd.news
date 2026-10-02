import { COUNTRY_DATA, type CountryData } from '@shared/countries/country-data';

/**
 * What a tap on the globe found — a country, a mark, or several marks to
 * choose between — and the shape every other way of reaching the same thing
 * (a menu row, a story's place, the chooser) hands the screen, so it opens
 * the same sheet whichever way the reader came.
 */
export interface TapResult {
  countryName: string;
  location: string | null;
  localTime: string | null;
  data: CountryData | null;
  hotspotLabels?: string[];
  isHotspot?: boolean;
  /** Set when the tap landed on an ambient chokepoint ring. The parent
   *  resolves the ID to the full Chokepoint payload and opens the strait's card. */
  chokepointId?: string;
  /** Set when the tap landed on a GDACS disaster marker. The parent resolves
   *  the eventid against the alerts list and opens DisasterSheet. */
  gdacsEventId?: string;
  /** Set when the tap landed on a conflict-event marker. The parent
   *  resolves the id against the events list and opens ConflictSheet. */
  conflictEventId?: string;
  /** Set when the tap landed on an exchange whose index has moved. The
   *  parent resolves it against the ranked instruments and opens the card. */
  marketSignalId?: string;
  /** Set when the tap landed on a story mark: the newest story at that place
   *  the reader has not found yet. The parent opens it in the sheet, and the
   *  mark stops being drawn once the found store records it. */
  storySlug?: string;
  /** The tapped mark's hue, so the found burst is drawn in the same colour. */
  storyColor?: string;
  /** An IPC famine classification — opens `OverlaySheet`. */
  famineAreaId?: string;
  /** A FIRMS thermal anomaly — opens `OverlaySheet`. */
  thermalEventId?: string;
  /** A UN genocide determination — opens `OverlaySheet`. */
  genocideId?: string;
  /** Populated when the tap lands on 2+ overlapping markers. The parent
   *  presents a chooser sheet listing these candidates; tapping one
   *  re-dispatches that candidate through the same hit handler. When set,
   *  it has length ≥ 2 and the outer fields (`countryName`, etc.) carry
   *  no meaning — read from the candidates instead. */
  candidates?: TapResult[];
}

/** A tap on a mark rather than a country: no place, no clock, no country
 *  data, and the field that says which mark it was. */
export function markTap(
  mark: Omit<TapResult, 'countryName' | 'location' | 'localTime' | 'data'>,
): TapResult {
  return { countryName: '', location: null, localTime: null, data: null, ...mark };
}

/** A tap on a country as a whole: its name and data, no place or clock. */
export function countryTap(
  countryName: string,
  data: CountryData | null = COUNTRY_DATA[countryName] ?? null,
): TapResult {
  return { countryName, location: null, localTime: null, data };
}
