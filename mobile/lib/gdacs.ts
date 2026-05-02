// GDACS (Global Disaster Alert and Coordination System) feed shapes + parser.
//
// Phase 1: mobile fetches the public GeoJSON feed directly. Phase 2 (deferred):
// the same shape served from /api/gdacs.json with a daily server-side cache.
// Swapping phases is a single-line URL change in useGdacsAlerts.

// EVENTS4APP returns Point geometry for every feature, unlike MAP which mixes
// Point/Polygon/MultiPolygon (cyclone tracks, fire perimeters, drought zones).
// Mobile only consumes points, so EVENTS4APP gives us a usable feed every day
// instead of a mostly-polygon feed that would render an empty globe.
export const GDACS_GEOJSON_URL =
  'https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP';

export type EventType = 'EQ' | 'TC' | 'FL' | 'VO' | 'DR' | 'WF';
export type AlertLevel = 'Green' | 'Orange' | 'Red';

export interface GdacsAlert {
  eventid: string;
  eventtype: EventType;
  alertlevel: AlertLevel;
  /** Human-readable event name, e.g. "M 7.4 Honshu, Japan". */
  name: string;
  /** Primary affected country (full name as published by GDACS). */
  country: string;
  iso3: string;
  /** Country names of every affected jurisdiction, including primary. */
  affectedCountries: string[];
  lat: number;
  lng: number;
  /** ISO timestamps. `toDate` is null for open-ended events. */
  fromDate: string;
  toDate: string | null;
  modifiedDate: string;
  /** Pre-formatted GDACS severity string, e.g.
   *  "Magnitude 7.4M, Depth:23km" / "Tropical Storm wind speed of 95 km/h". */
  severityText: string;
  /** Numeric severity (magnitude / wind speed / VEI) when GDACS publishes
   *  a structured value alongside `severityText`. Null for events where
   *  only the prose form exists. */
  severityValue: number | null;
  /** Unit string for `severityValue`, e.g. "M" for earthquakes, "kph" for
   *  cyclones. Empty string when GDACS doesn't supply one. */
  severityUnit: string;
  /** Plain-text summary, HTML stripped, capped to ~280 chars. Auto-caption
   *  strings — GDACS's templated "Green M 5 Earthquake in X at: <date>" —
   *  are filtered out here (set to empty), since every scrap of them is
   *  already carried by `name` + `severityText` + `fromDate`. The field
   *  is non-empty only when there's substantive narrative the reader
   *  hasn't already seen. */
  description: string;
  /** Originating authority — e.g. "NEIC" (US Geological Survey earthquake
   *  network), "JRC" (EU flood centre), "JTWC" / "NHC" (cyclone centres),
   *  "Smithsonian" (volcanoes). Empty string when GDACS doesn't publish
   *  one. Surfaces in the alert sheet as proper attribution. */
  source: string;
  reportUrl: string | null;
}

const EVENT_TYPES: ReadonlySet<string> = new Set(['EQ', 'TC', 'FL', 'VO', 'DR', 'WF']);
const ALERT_LEVELS: ReadonlySet<string> = new Set(['Green', 'Orange', 'Red']);

/** Hard age cliff for alerts. Beyond this, drop entirely rather than fade —
 *  GDACS keeps long-running events (multi-month droughts, ongoing wildfires)
 *  on the feed indefinitely, and a half-faded marker from 8 months ago is
 *  not "happening now." */
const MAX_ALERT_AGE_DAYS = 30;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

interface GdacsFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: Record<string, unknown>;
}

export interface GdacsFeatureCollection {
  type: 'FeatureCollection';
  features: GdacsFeature[];
}

const isGdacsFeature = (v: unknown): v is GdacsFeature => {
  if (!isObject(v)) return false;
  if (v.type !== 'Feature') return false;
  if (!isObject(v.geometry)) return false;
  if (!isObject(v.properties)) return false;
  // Only Point geometry is consumed; Polygon features (fire perimeters,
  // 100km affected radii) ride along but are ignored. Filtering them out
  // here keeps the downstream mapper simple.
  if (v.geometry.type !== 'Point') return false;
  const coords = v.geometry.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return false;
  if (!isFiniteNumber(coords[0]) || !isFiniteNumber(coords[1])) return false;
  return true;
};

export const isGdacsFeatureCollection = (v: unknown): v is GdacsFeatureCollection => {
  if (!isObject(v)) return false;
  if (v.type !== 'FeatureCollection') return false;
  if (!Array.isArray(v.features)) return false;
  // Permissive — accept the collection if at least the array is well-formed.
  // Per-feature validity is checked again in the mapper, where invalid rows
  // are simply dropped.
  return true;
};

/** Strip a small subset of HTML and decode the handful of entities GDACS
 *  emits. Not a general-purpose sanitizer — the field is treated as
 *  untrusted prose, not markup. */
function htmlToPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>(?:\s*\n)?/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  // Break on the nearest sentence end before max, falling back to a
  // word boundary so the trailing ellipsis doesn't snip mid-word.
  const cut = s.slice(0, max);
  const lastDot = cut.lastIndexOf('. ');
  if (lastDot > max * 0.6) return `${cut.slice(0, lastDot + 1)}`;
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : max)}…`;
}

function readAffectedCountryNames(raw: unknown): string[] {
  // GDACS sends `affectedcountries` as an array of {iso2, iso3, countryname},
  // sometimes also as a comma-separated string for legacy clients. Handle both.
  if (Array.isArray(raw)) {
    const out: string[] = [];
    for (const entry of raw) {
      if (
        isObject(entry) &&
        typeof entry.countryname === 'string' &&
        entry.countryname.length > 0
      ) {
        out.push(entry.countryname);
      }
    }
    return out;
  }
  if (typeof raw === 'string' && raw.length > 0) {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

function readSeverityText(props: Record<string, unknown>): string {
  const sev = props.severitydata;
  if (isObject(sev) && typeof sev.severitytext === 'string' && sev.severitytext.length > 0) {
    return sev.severitytext;
  }
  return '';
}

function readSeverityValue(props: Record<string, unknown>): number | null {
  const sev = props.severitydata;
  if (isObject(sev) && isFiniteNumber(sev.severity)) return sev.severity;
  return null;
}

function readSeverityUnit(props: Record<string, unknown>): string {
  const sev = props.severitydata;
  if (isObject(sev) && typeof sev.severityunit === 'string') return sev.severityunit;
  return '';
}

/** GDACS auto-caption shape — e.g. "Green M 5 Earthquake in South Sandwich
 *  Islands Region at: 02 May 2026 10:31:40." Every component (alert level,
 *  magnitude, event type, region, datetime) is already surfaced through
 *  the structured fields, so the auto-caption adds no information and
 *  visually duplicates the sheet header. We blank these so the sheet
 *  doesn't render a redundant paragraph. Real narrative descriptions —
 *  what GDACS publishes for flagged Orange/Red events with situational
 *  context — never start with the alert level keyword and pass through
 *  unchanged. */
const AUTO_CAPTION = /^(Green|Orange|Red)\s/;
function dropAutoCaption(description: string): string {
  return AUTO_CAPTION.test(description) ? '' : description;
}

function readReportUrl(props: Record<string, unknown>): string | null {
  const url = props.url;
  if (isObject(url) && typeof url.report === 'string' && /^https?:\/\//.test(url.report)) {
    return url.report;
  }
  return null;
}

function featureToAlert(feature: GdacsFeature): GdacsAlert | null {
  const p = feature.properties;
  const eventtype = p.eventtype;
  const alertlevel = p.alertlevel;
  const eventid = p.eventid;
  if (typeof eventtype !== 'string' || !EVENT_TYPES.has(eventtype)) return null;
  if (typeof alertlevel !== 'string' || !ALERT_LEVELS.has(alertlevel)) return null;
  // eventid arrives as a number in GDACS' payload but is conceptually opaque.
  const id =
    typeof eventid === 'number' ? String(eventid) : typeof eventid === 'string' ? eventid : null;
  if (!id) return null;

  const [lng, lat] = feature.geometry.coordinates;
  const name =
    typeof p.name === 'string' && p.name.length > 0
      ? p.name
      : typeof p.eventname === 'string'
        ? p.eventname
        : '';
  const country = typeof p.country === 'string' ? p.country : '';
  const iso3 = typeof p.iso3 === 'string' ? p.iso3 : '';
  const fromDate = typeof p.fromdate === 'string' ? p.fromdate : '';
  const toDate = typeof p.todate === 'string' && p.todate.length > 0 ? p.todate : null;
  const modifiedDate = typeof p.datemodified === 'string' ? p.datemodified : fromDate;
  const rawDescription =
    typeof p.htmldescription === 'string'
      ? truncate(htmlToPlain(p.htmldescription), 280)
      : typeof p.description === 'string'
        ? truncate(p.description, 280)
        : '';
  const description = dropAutoCaption(rawDescription);
  const source = typeof p.source === 'string' ? p.source : '';

  return {
    eventid: id,
    eventtype: eventtype as EventType,
    alertlevel: alertlevel as AlertLevel,
    name,
    country,
    iso3,
    affectedCountries: readAffectedCountryNames(p.affectedcountries),
    lat,
    lng,
    fromDate,
    toDate,
    modifiedDate,
    severityText: readSeverityText(p),
    severityValue: readSeverityValue(p),
    severityUnit: readSeverityUnit(p),
    description,
    source,
    reportUrl: readReportUrl(p),
  };
}

/** Flatten a parsed GeoJSON collection into our internal record shape.
 *  Drops malformed features, unknown alert levels, non-current events,
 *  and anything older than MAX_ALERT_AGE_DAYS. Green alerts are kept at
 *  the data layer and capped per-tier downstream in MiniGlobe so the
 *  ambient pulse doesn't accumulate stale entries. */
export function collectionToAlerts(
  collection: GdacsFeatureCollection,
  now: number = Date.now(),
): GdacsAlert[] {
  const out: GdacsAlert[] = [];
  for (const feature of collection.features) {
    if (!isGdacsFeature(feature)) continue;
    if (feature.properties.iscurrent !== true && feature.properties.iscurrent !== 'true') continue;
    const alert = featureToAlert(feature);
    if (!alert) continue;
    if (alertAgeDays(alert, now) > MAX_ALERT_AGE_DAYS) continue;
    out.push(alert);
  }
  return out;
}

/** Days since `modifiedDate` — used to fade older markers via the same
 *  recency family hotspots use. Returns 0 for unparsable timestamps so
 *  borderline data still renders at full opacity. */
export function alertAgeDays(alert: GdacsAlert, now: number = Date.now()): number {
  const t = Date.parse(alert.modifiedDate);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, (now - t) / 86_400_000);
}
