// GDACS display helpers, shared by the app's disaster sheet and the web map's.
//
// These lived in `mobile/lib/gdacs.ts` while the app was the only surface that
// rendered an alert. The web map now opens the same alerts from the same
// `/api/gdacs.json`, and the choice was to re-express the severity parser a
// second time or to move it here. It moved: the regexes encode what GDACS
// actually publishes per event type, and two copies would drift the moment
// GDACS changed a string — with the divergence showing up as one surface
// printing "M 5.1" and the other printing "Magnitude 5.1M, Depth:182.779km".
//
// Everything here is pure and platform-free — no React, no DOM, no fetch — so
// both the Expo bundler and the island bundler's `@shared` alias can take it.

import type { GdacsAlert, GdacsEventType } from './types';

/** Eyebrow label — the all-caps event-type name that anchors the sheet
 *  before the focal severity number. Replaces the redundant 44px glyph
 *  that the reader already saw on the globe. */
export const EVENT_TYPE_EYEBROW: Record<GdacsEventType, string> = {
  EQ: 'EARTHQUAKE',
  TC: 'TROPICAL CYCLONE',
  FL: 'FLOOD',
  VO: 'VOLCANO',
  DR: 'DROUGHT',
  WF: 'FOREST FIRE',
};

/** Spell out the originating-authority code GDACS publishes in `source`.
 *  Acronyms force the reader to either know the org or treat the source
 *  line as opaque chrome — the human name carries the trust signal that
 *  the acronym was supposed to. Falls back to the raw code when GDACS
 *  publishes one we don't recognise; falls back to "GDACS" when empty. */
const SOURCE_NAMES: Record<string, string> = {
  NEIC: 'U.S. Geological Survey',
  USGS: 'U.S. Geological Survey',
  JTWC: 'U.S. Joint Typhoon Warning Center',
  NHC: 'U.S. National Hurricane Center',
  JRC: 'European Commission JRC',
  GDO: 'European Drought Observatory',
  GWIS: 'Global Wildfire Information System',
  Smithsonian: 'Smithsonian Institution',
  VAAC: 'Volcanic Ash Advisory Center',
  ECMWF: 'ECMWF',
};
export function displaySourceName(code: string): string {
  if (code.length === 0) return 'GDACS';
  return SOURCE_NAMES[code] ?? code;
}

/** A single number + unit pair pulled out of `severityText` to be
 *  rendered as the sheet's focal hero, plus a compact secondary clause.
 *  Numbers are kept in the natural form GDACS publishes (e.g. "M 5.2",
 *  "95 km/h") — readers learn the convention faster than they parse
 *  re-formatted prose. */
export interface SeverityHero {
  /** The dominant number + unit, e.g. "M 5.2", "95 km/h", "7,559 ha". */
  focal: string;
  /** Short clause supporting the focal number, e.g. "23 km deep",
   *  "tropical-storm strength". Empty string when nothing fits. */
  secondary: string;
}

/** Per-event-type parser for the prose `severityText` GDACS publishes.
 *  Targets the dominant pattern for each type so the focal number reads
 *  in <0.5s instead of forcing the reader through 5 lexical hops. Falls
 *  back to the raw text when the pattern doesn't match — ugly but
 *  safe, never lies about the data. */
export function parseSeverityHero(alert: GdacsAlert): SeverityHero {
  const text = alert.severityText;
  if (text.length === 0) return { focal: EVENT_TYPE_EYEBROW[alert.eventtype], secondary: '' };

  if (alert.eventtype === 'EQ') {
    const m = text.match(/Magnitude\s+([\d.]+)M?,?\s*Depth[:\s]+(\d+(?:\.\d+)?)\s*km/i);
    if (m) return { focal: `M ${m[1]}`, secondary: `${Math.round(Number(m[2]))} km deep` };
    const m2 = text.match(/Magnitude\s+([\d.]+)/i);
    if (m2) return { focal: `M ${m2[1]}`, secondary: '' };
  }

  if (alert.eventtype === 'TC') {
    const m = text.match(
      /(Tropical\s+(?:Storm|Depression)|Hurricane|Typhoon|Cyclone).*?(\d+)\s*(km\/h|kt|mph)/i,
    );
    if (m) {
      const tierWord = m[1] ? m[1].toLowerCase() : 'cyclone';
      const tier = /storm|depression/i.test(tierWord)
        ? 'tropical-storm strength'
        : `${tierWord} strength`;
      return { focal: `${m[2]} ${m[3]}`, secondary: tier };
    }
  }

  if (alert.eventtype === 'WF') {
    const m = text.match(/(\d+(?:\.\d+)?)\s*(ha|km2|km²)/i);
    if (m?.[1] && m[2]) {
      return { focal: `${formatGrouped(m[1])} ${normalizeUnit(m[2])}`, secondary: 'burn area' };
    }
  }

  if (alert.eventtype === 'DR') {
    const m = text.match(/(\d+(?:\.\d+)?)\s*(ha|km2|km²)/i);
    if (m?.[1] && m[2]) {
      return { focal: `${formatGrouped(m[1])} ${normalizeUnit(m[2])}`, secondary: 'drought area' };
    }
  }

  // FL events publish "Magnitude 0" at this endpoint — nothing parseable.
  // Default fallback returns the raw severityText as focal (never silently
  // hide the data, even when it's prose-only).
  return { focal: text, secondary: '' };
}

function formatGrouped(s: string): string {
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return n.toLocaleString('en-US');
}

function normalizeUnit(u: string): string {
  if (/^km2$/i.test(u)) return 'km²';
  return u;
}

/** The `details` map on `/api/gdacs.json` is keyed by `${eventtype}:${eventid}`,
 *  not by the bare event id — a detail lookup that forgets the prefix silently
 *  finds nothing, which is exactly how the web map went a year without ever
 *  reading the population figures it was already downloading. */
export const detailKey = (alert: Pick<GdacsAlert, 'eventtype' | 'eventid'>): string =>
  `${alert.eventtype}:${alert.eventid}`;
