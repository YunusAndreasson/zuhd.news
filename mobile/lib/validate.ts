import type {
  AnalysisSnapshot,
  Article,
  Category,
  Chokepoint,
  ChokepointCounts,
  ChokepointSnapshot,
  ConflictEvent,
  ConflictEventFamily,
  ConflictSnapshot,
  ConflictSubEvent,
  FeedResponse,
  GdacsAlert,
  GdacsDetail,
  GdacsSnapshot,
  HeatmapPoint,
  Indicator,
  MetaResponse,
  TrendsSnapshot,
} from '@shared/types';
import type { Preferences } from '../constants/theme';
import type { Bookmark } from './bookmark-store';
import { isIsoDate } from './data-freshness';

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((s) => typeof s === 'string');

const isNumberArray = (v: unknown): v is number[] => Array.isArray(v) && v.every(isFiniteNumber);

const isCategory = (v: unknown): v is Category =>
  v === 'politics' || v === 'economy' || v === 'science' || v === 'tech';

const isArticle = (v: unknown): v is Article => {
  if (!isObject(v)) return false;
  return (
    typeof v.slug === 'string' &&
    typeof v.title === 'string' &&
    isIsoDate(v.date) &&
    isFiniteNumber(v.addedAt) &&
    Array.isArray(v.sources) &&
    isStringArray(v.concepts) &&
    isStringArray(v.sentences)
  );
};

const isBriefing = (v: unknown): boolean =>
  isObject(v) &&
  isIsoDate(v.date) &&
  typeof v.available === 'boolean' &&
  (v.duration === undefined || (isFiniteNumber(v.duration) && v.duration > 0));

export const isFeedResponse = (v: unknown): v is FeedResponse => {
  if (!isObject(v) || !isIsoDate(v.generated)) return false;
  if (!isObject(v.categories)) return false;
  for (const [k, arr] of Object.entries(v.categories)) {
    if (!isCategory(k)) return false;
    if (!Array.isArray(arr) || !arr.every(isArticle)) return false;
  }
  if (v.briefing !== null && !isBriefing(v.briefing)) return false;
  return true;
};

export const isMetaResponse = (v: unknown): v is MetaResponse =>
  isObject(v) && isIsoDate(v.generated);

const isHeatmapPoint = (v: unknown): v is HeatmapPoint =>
  isObject(v) &&
  isFiniteNumber(v.lat) &&
  v.lat >= -90 &&
  v.lat <= 90 &&
  isFiniteNumber(v.lng) &&
  v.lng >= -180 &&
  v.lng <= 180 &&
  isFiniteNumber(v.c) &&
  v.c >= 0 &&
  isFiniteNumber(v.t) &&
  v.t >= 0 &&
  typeof v.l === 'string';

export interface HeatmapResponse {
  generated: string;
  points: HeatmapPoint[];
}

export const isHeatmapResponse = (v: unknown): v is HeatmapResponse =>
  isObject(v) &&
  isIsoDate(v.generated) &&
  Array.isArray(v.points) &&
  v.points.every(isHeatmapPoint);

const isCounts = (v: unknown): v is ChokepointCounts =>
  isObject(v) && Object.values(v).every(isFiniteNumber);

const isChokepointWeather = (v: unknown): boolean => {
  if (!isObject(v)) return false;
  if (!isIsoDate(v.asOf)) return false;
  if (!isFiniteNumber(v.maxWave24hM)) return false;
  if (v.alert !== null && v.alert !== 'rough' && v.alert !== 'very_rough') return false;
  return true;
};

const isChokepoint = (v: unknown): v is Chokepoint => {
  if (!isObject(v)) return false;
  if (typeof v.id !== 'string' || v.id.length === 0) return false;
  if (typeof v.name !== 'string' || v.name.length === 0) return false;
  if (typeof v.blurb !== 'string') return false;
  if (!isFiniteNumber(v.lat) || v.lat < -90 || v.lat > 90) return false;
  if (!isFiniteNumber(v.lng) || v.lng < -180 || v.lng > 180) return false;
  if (!isStringArray(v.topicTags)) return false;
  if (typeof v.primaryField !== 'string') return false;
  if (!isCounts(v.last7Avg) || !isCounts(v.baseline90Avg) || !isCounts(v.delta7vs90)) return false;
  if (!isObject(v.series)) return false;
  if (!isStringArray(v.series.periods) || !isNumberArray(v.series.total)) return false;
  if (v.series.periods.length !== v.series.total.length || v.series.total.length < 2) return false;
  if (!isIsoDate(v.asOf)) return false;
  if (v.weather !== undefined && !isChokepointWeather(v.weather)) return false;
  return true;
};

export const isChokepointSnapshot = (v: unknown): v is ChokepointSnapshot =>
  isObject(v) &&
  isIsoDate(v.generated) &&
  Array.isArray(v.chokepoints) &&
  v.chokepoints.every(isChokepoint);

/** `/api/analysis.json` — the day's movement analysis, keyed by indicator id.
 *  An entry with a blank `recent` is rejected rather than kept: the whole
 *  point of the field is that a card falls back to its definition on absence,
 *  and an empty string is absence wearing a value's clothes. */
export const isAnalysisSnapshot = (v: unknown): v is AnalysisSnapshot =>
  isObject(v) &&
  isIsoDate(v.generatedAt) &&
  (v.windowDays === null ||
    (isFiniteNumber(v.windowDays) && Number.isInteger(v.windowDays) && v.windowDays >= 0)) &&
  isObject(v.items) &&
  Object.values(v.items).every(
    (e) => isObject(e) && typeof e.recent === 'string' && e.recent.trim().length > 0,
  );

const GDACS_EVENT_TYPES: ReadonlySet<string> = new Set(['EQ', 'TC', 'FL', 'VO', 'DR', 'WF']);
const GDACS_ALERT_LEVELS: ReadonlySet<string> = new Set(['Green', 'Orange', 'Red']);

const isGdacsAlert = (v: unknown): v is GdacsAlert => {
  if (!isObject(v)) return false;
  if (typeof v.eventid !== 'string' || v.eventid.length === 0) return false;
  if (typeof v.eventtype !== 'string' || !GDACS_EVENT_TYPES.has(v.eventtype)) return false;
  if (typeof v.alertlevel !== 'string' || !GDACS_ALERT_LEVELS.has(v.alertlevel)) return false;
  if (typeof v.name !== 'string') return false;
  if (typeof v.country !== 'string' || typeof v.iso3 !== 'string') return false;
  if (!isStringArray(v.affectedCountries)) return false;
  if (!isFiniteNumber(v.lat) || !isFiniteNumber(v.lng)) return false;
  if (!isIsoDate(v.fromDate) || !isIsoDate(v.modifiedDate)) return false;
  if (v.toDate !== null && !isIsoDate(v.toDate)) return false;
  if (typeof v.severityText !== 'string') return false;
  if (v.severityValue !== null && !isFiniteNumber(v.severityValue)) return false;
  if (typeof v.severityUnit !== 'string') return false;
  if (typeof v.description !== 'string') return false;
  if (typeof v.source !== 'string') return false;
  if (v.reportUrl !== null && typeof v.reportUrl !== 'string') return false;
  if (v.narrative !== undefined && typeof v.narrative !== 'string') return false;
  return true;
};

const isGdacsDetail = (v: unknown): v is GdacsDetail => {
  if (!isObject(v)) return false;
  if (v.criticalPopulation !== null && !isFiniteNumber(v.criticalPopulation)) return false;
  if (v.widerPopulation !== null && !isFiniteNumber(v.widerPopulation)) return false;
  if (typeof v.criticalClause !== 'string' || typeof v.widerClause !== 'string') return false;
  return true;
};

export const isGdacsSnapshot = (v: unknown): v is GdacsSnapshot => {
  if (!isObject(v)) return false;
  if (!isIsoDate(v.generated)) return false;
  if (!Array.isArray(v.alerts) || !v.alerts.every(isGdacsAlert)) return false;
  if (!isObject(v.details)) return false;
  for (const detail of Object.values(v.details)) {
    if (!isGdacsDetail(detail)) return false;
  }
  return true;
};

// Conflict-event validators. Used today against the bundled fixture in
// useConflictEvents; will be reused unchanged when the hook swaps to a
// network fetch from /api/conflict.json. Mirror the GDACS pair above.

const CONFLICT_FAMILIES: ReadonlySet<ConflictEventFamily> = new Set(['kinetic', 'unrest']);
const CONFLICT_SUB_EVENTS: ReadonlySet<ConflictSubEvent> = new Set([
  'armed_clash',
  'air_drone_strike',
  'shelling_artillery',
  'remote_explosive_ied',
  'attack_on_civilians',
  'abduction_disappearance',
  'sexual_violence',
  'peaceful_protest',
  'protest_intervention',
  'violent_demonstration',
  'mob_violence',
]);

const isOptionalString = (v: unknown): boolean => v === undefined || typeof v === 'string';
const isOptionalNonNegInt = (v: unknown): boolean =>
  v === undefined || (isFiniteNumber(v) && v >= 0);

const isConflictReportedSource = (v: unknown): boolean =>
  isObject(v) &&
  typeof v.outlet === 'string' &&
  isIsoDate(v.date) &&
  typeof v.headline === 'string';

const isConflictEvent = (v: unknown): v is ConflictEvent => {
  if (!isObject(v)) return false;
  if (typeof v.id !== 'string' || v.id.length === 0) return false;
  if (!isIsoDate(v.eventDate)) return false;
  if (typeof v.family !== 'string' || !CONFLICT_FAMILIES.has(v.family as ConflictEventFamily)) {
    return false;
  }
  if (typeof v.subEvent !== 'string' || !CONFLICT_SUB_EVENTS.has(v.subEvent as ConflictSubEvent)) {
    return false;
  }
  if (typeof v.actor1 !== 'string') return false;
  if (!isOptionalString(v.actor2)) return false;
  if (!isOptionalString(v.conflictName)) return false;
  if (typeof v.country !== 'string' || typeof v.iso3 !== 'string') return false;
  if (!isOptionalString(v.region)) return false;
  if (!isOptionalString(v.admin1)) return false;
  if (typeof v.location !== 'string') return false;
  if (!isOptionalString(v.locationDetail)) return false;
  if (!isFiniteNumber(v.lat) || !isFiniteNumber(v.lng)) return false;
  if (!isFiniteNumber(v.fatalities) || v.fatalities < 0) return false;
  if (!isOptionalNonNegInt(v.fatalitiesLow)) return false;
  if (!isOptionalNonNegInt(v.fatalitiesHigh)) return false;
  if (!isOptionalNonNegInt(v.deathsSideA)) return false;
  if (!isOptionalNonNegInt(v.deathsSideB)) return false;
  if (!isOptionalNonNegInt(v.deathsCivilians)) return false;
  if (!isOptionalNonNegInt(v.deathsUnknown)) return false;
  if (!isOptionalNonNegInt(v.numSources)) return false;
  if (v.dateEnd !== undefined && !isIsoDate(v.dateEnd)) return false;
  if (typeof v.notes !== 'string') return false;
  if (typeof v.source !== 'string') return false;
  if (!isOptionalString(v.sourceUrl)) return false;
  if (v.sources !== undefined) {
    if (!Array.isArray(v.sources) || !v.sources.every(isConflictReportedSource)) return false;
  }
  return true;
};

export const isConflictSnapshot = (v: unknown): v is ConflictSnapshot => {
  if (!isObject(v)) return false;
  if (!isIsoDate(v.generated)) return false;
  if (!isIsoDate(v.windowStart) || !isIsoDate(v.windowEnd)) return false;
  if (Date.parse(v.windowStart) > Date.parse(v.windowEnd)) return false;
  if (!Array.isArray(v.events) || !v.events.every(isConflictEvent)) return false;
  const windowStart = v.windowStart;
  const windowEnd = v.windowEnd;
  if (v.events.some((event) => event.eventDate < windowStart || event.eventDate > windowEnd)) {
    return false;
  }
  return true;
};

const isIndicator = (v: unknown): v is Indicator => {
  if (!isObject(v)) return false;
  if (typeof v.id !== 'string' || v.id.length === 0) return false;
  if (typeof v.label !== 'string' || v.label.length === 0) return false;
  if (typeof v.source !== 'string') return false;
  if (typeof v.sourceLabel !== 'string') return false;
  if (!Array.isArray(v.values) || !v.values.every(isFiniteNumber)) return false;
  if (!isStringArray(v.periods)) return false;
  if (v.values.length !== v.periods.length) return false;
  if (v.values.length < 2) return false;
  if (v.asOf !== undefined && !isIsoDate(v.asOf)) return false;
  if (v.cadence !== undefined && v.cadence !== 'daily' && v.cadence !== 'monthly') return false;
  return true;
};

const isTrendRelease = (v: unknown): boolean =>
  isObject(v) && isIsoDate(v.date) && typeof v.release === 'string' && v.release.length > 0;

const isTrendEvent = (v: unknown): boolean =>
  isObject(v) &&
  typeof v.id === 'string' &&
  v.id.length > 0 &&
  typeof v.title === 'string' &&
  v.title.length > 0 &&
  typeof v.institution === 'string' &&
  v.institution.length > 0 &&
  (v.kind === 'central-bank' ||
    v.kind === 'opec' ||
    v.kind === 'econ-release' ||
    v.kind === 'summit-election') &&
  isIsoDate(v.date);

export const isTrendsSnapshot = (v: unknown): v is TrendsSnapshot => {
  if (!isObject(v) || !isIsoDate(v.fetchedAt) || !isIsoDate(v.asOf)) return false;
  if (!Array.isArray(v.indicators) || !v.indicators.every(isIndicator)) return false;
  if (v.releaseCalendar !== undefined) {
    if (!Array.isArray(v.releaseCalendar) || !v.releaseCalendar.every(isTrendRelease)) return false;
  }
  if (v.events !== undefined) {
    if (!Array.isArray(v.events) || !v.events.every(isTrendEvent)) return false;
  }
  return true;
};

export const isPreferences = (v: unknown): v is Preferences => {
  if (!isObject(v)) return false;
  return (
    (v.fontSize === 'small' || v.fontSize === 'default' || v.fontSize === 'large') &&
    (v.fontFamily === 'source' || v.fontFamily === 'system') &&
    (v.appearance === 'dark' || v.appearance === 'light' || v.appearance === 'system') &&
    typeof v.haptics === 'boolean' &&
    typeof v.notifications === 'boolean'
  );
};

const isBookmark = (v: unknown): v is Bookmark =>
  isObject(v) && isArticle(v.article) && isCategory(v.category) && typeof v.savedAt === 'number';

export const isBookmarkArray = (v: unknown): v is Bookmark[] =>
  Array.isArray(v) && v.every(isBookmark);
