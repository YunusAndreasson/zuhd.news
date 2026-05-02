import type {
  Actor,
  Article,
  ArticleBlock,
  Category,
  Chokepoint,
  ChokepointCounts,
  ChokepointSnapshot,
  CompareRow,
  ContextBrief,
  Entity,
  EntityKind,
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

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((s) => typeof s === 'string');

const isNumberArray = (v: unknown): v is number[] => Array.isArray(v) && v.every(isFiniteNumber);

const isTone = (v: unknown): v is CompareRow['tone'] =>
  v === 'favorable' || v === 'unfavorable' || v === 'neutral';

const isCompareRow = (v: unknown): v is CompareRow => {
  if (!isObject(v)) return false;
  if (typeof v.label !== 'string' || typeof v.value !== 'string') return false;
  if (v.tone !== undefined && !isTone(v.tone)) return false;
  if (v.cc !== undefined && typeof v.cc !== 'string') return false;
  if (v.weight !== undefined && (typeof v.weight !== 'number' || !Number.isFinite(v.weight)))
    return false;
  return true;
};

/** A trend annotation pins an event to a specific data-point index. Invalid
 *  shapes (missing label, out-of-range index) get dropped — a missing annotation
 *  is always safer than a broken one. */
const parseTrendAnnotation = (
  v: unknown,
  valuesLength: number,
): { atIndex: number; label: string } | null => {
  if (!isObject(v)) return null;
  if (typeof v.atIndex !== 'number' || !Number.isInteger(v.atIndex)) return null;
  if (v.atIndex < 0 || v.atIndex >= valuesLength) return null;
  if (typeof v.label !== 'string' || v.label.length === 0) return null;
  return { atIndex: v.atIndex, label: v.label };
};

/** Apply an optional block-level source reference index. Uses a structural cast
 *  because every ArticleBlock variant intersects with BlockSourceRef, so the
 *  `source` field is valid on each — TypeScript just can't see that through
 *  the generic. Keeps sanitization uniform across block variants. */
function applySourceRef<T>(block: T, v: Record<string, unknown>): T {
  if (typeof v.source === 'number' && Number.isInteger(v.source) && v.source >= 0) {
    (block as unknown as { source?: number }).source = v.source;
  }
  return block;
}

const isActor = (v: unknown): v is Actor => {
  if (!isObject(v)) return false;
  if (typeof v.name !== 'string' || typeof v.role !== 'string') return false;
  if (v.years !== undefined && typeof v.years !== 'string') return false;
  if (v.cc !== undefined && typeof v.cc !== 'string') return false;
  return true;
};

/** Shape-check a single block. Returns the block (narrowed) or null if malformed
 *  or of an unknown type — callers drop nulls to stay forward-compatible with
 *  new block types emitted by future pipeline versions. */
const parseArticleBlock = (v: unknown): ArticleBlock | null => {
  if (!isObject(v) || typeof v.type !== 'string') return null;
  switch (v.type) {
    case 'prose':
      return typeof v.text === 'string' ? applySourceRef({ type: 'prose', text: v.text }, v) : null;
    case 'compare': {
      if (!Array.isArray(v.rows)) return null;
      const rows = v.rows.filter(isCompareRow);
      if (rows.length === 0) return null;
      const block: ArticleBlock = { type: 'compare', rows };
      if (typeof v.label === 'string' && v.label.trim().length > 0) block.label = v.label;
      return applySourceRef(block, v);
    }
    case 'trend': {
      if (!isNumberArray(v.values) || v.values.length < 2) return null;
      if (typeof v.label !== 'string') return null;
      const values = v.values;
      const block: ArticleBlock = { type: 'trend', values, label: v.label };
      if (typeof v.unit === 'string') block.unit = v.unit;
      if (isStringArray(v.periods) && v.periods.length === values.length) {
        block.periods = v.periods;
      }
      if (
        v.highlight === 'last' ||
        v.highlight === 'first' ||
        v.highlight === 'max' ||
        v.highlight === 'min'
      )
        block.highlight = v.highlight;
      if (Array.isArray(v.annotations)) {
        const anns = v.annotations
          .map((a) => parseTrendAnnotation(a, values.length))
          .filter((a): a is NonNullable<typeof a> => a != null);
        if (anns.length > 0) block.annotations = anns;
      }
      if (typeof v.link === 'string' && /^https?:\/\//.test(v.link)) {
        block.link = v.link;
      }
      return applySourceRef(block, v);
    }
    case 'locations': {
      if (!isStringArray(v.codes) || v.codes.length === 0) return null;
      const block: ArticleBlock = { type: 'locations', codes: v.codes };
      if (typeof v.label === 'string') block.label = v.label;
      if (typeof v.caption === 'string') block.caption = v.caption;
      return applySourceRef(block, v);
    }
    case 'quote': {
      if (typeof v.text !== 'string' || v.text.length === 0) return null;
      const block: ArticleBlock = { type: 'quote', text: v.text };
      if (typeof v.speaker === 'string') block.speaker = v.speaker;
      if (typeof v.year === 'string') block.year = v.year;
      return applySourceRef(block, v);
    }
    case 'actors': {
      if (!Array.isArray(v.people)) return null;
      const people = v.people.filter(isActor);
      if (people.length === 0) return null;
      const block: ArticleBlock = { type: 'actors', people };
      if (typeof v.label === 'string') block.label = v.label;
      return applySourceRef(block, v);
    }
    case 'quiz': {
      if (typeof v.question !== 'string' || v.question.length === 0) return null;
      if (!isStringArray(v.options) || v.options.length < 2) return null;
      if (
        typeof v.correct !== 'number' ||
        !Number.isInteger(v.correct) ||
        v.correct < 0 ||
        v.correct >= v.options.length
      )
        return null;
      const block: ArticleBlock = {
        type: 'quiz',
        question: v.question,
        options: v.options,
        correct: v.correct,
      };
      if (typeof v.explanation === 'string' && v.explanation.length > 0) {
        block.explanation = v.explanation;
      }
      return applySourceRef(block, v);
    }
    default:
      return null;
  }
};

/** Parse a blocks array permissively — malformed / unknown blocks are dropped.
 *  Returns an empty array if input is not an array, so callers can always
 *  iterate without extra null checks. */
export const parseArticleBlocks = (v: unknown): ArticleBlock[] => {
  if (!Array.isArray(v)) return [];
  const out: ArticleBlock[] = [];
  for (const b of v) {
    const parsed = parseArticleBlock(b);
    if (parsed) out.push(parsed);
  }
  return out;
};

export const isCategory = (v: unknown): v is Category =>
  v === 'politics' || v === 'economy' || v === 'science' || v === 'tech';

export const isArticle = (v: unknown): v is Article => {
  if (!isObject(v)) return false;
  return (
    typeof v.slug === 'string' &&
    typeof v.title === 'string' &&
    typeof v.date === 'string' &&
    typeof v.addedAt === 'number' &&
    Array.isArray(v.sources) &&
    isStringArray(v.concepts) &&
    isStringArray(v.sentences)
  );
};

const isEntityKind = (v: unknown): v is EntityKind =>
  v === 'commodity' ||
  v === 'currency' ||
  v === 'chokepoint' ||
  v === 'crypto' ||
  v === 'index' ||
  v === 'stock';

const isEntity = (v: unknown): v is Entity => {
  if (!isObject(v)) return false;
  return (
    typeof v.mention === 'string' &&
    v.mention.length > 0 &&
    typeof v.indicatorId === 'string' &&
    v.indicatorId.length > 0 &&
    isEntityKind(v.kind)
  );
};

/** Parse article `entities` field permissively. Missing / malformed → []. */
export const parseEntities = (v: unknown): Entity[] => {
  if (!Array.isArray(v)) return [];
  const out: Entity[] = [];
  for (const e of v) {
    if (isEntity(e)) out.push(e);
  }
  return out;
};

export const isFeedResponse = (v: unknown): v is FeedResponse => {
  if (!isObject(v) || typeof v.generated !== 'string') return false;
  if (!isObject(v.categories)) return false;
  for (const [k, arr] of Object.entries(v.categories)) {
    if (!isCategory(k)) return false;
    if (!Array.isArray(arr) || !arr.every(isArticle)) return false;
  }
  if (v.briefing !== null && !isObject(v.briefing)) return false;
  return true;
};

export const isMetaResponse = (v: unknown): v is MetaResponse =>
  isObject(v) && typeof v.generated === 'string';

export const isContextBrief = (v: unknown): v is ContextBrief => {
  if (!isObject(v)) return false;
  return (
    typeof v.id === 'string' &&
    typeof v.label === 'string' &&
    isCategory(v.category) &&
    typeof v.articleCount === 'number' &&
    typeof v.generatedAt === 'string' &&
    Array.isArray(v.timeline)
  );
};

const isHeatmapPoint = (v: unknown): v is HeatmapPoint =>
  isObject(v) &&
  typeof v.lat === 'number' &&
  typeof v.lng === 'number' &&
  typeof v.c === 'number' &&
  typeof v.t === 'number' &&
  typeof v.l === 'string';

export interface HeatmapResponse {
  generated: string;
  points: HeatmapPoint[];
}

export const isHeatmapResponse = (v: unknown): v is HeatmapResponse =>
  isObject(v) &&
  typeof v.generated === 'string' &&
  Array.isArray(v.points) &&
  v.points.every(isHeatmapPoint);

const isCounts = (v: unknown): v is ChokepointCounts =>
  isObject(v) && Object.values(v).every(isFiniteNumber);

const isChokepoint = (v: unknown): v is Chokepoint => {
  if (!isObject(v)) return false;
  if (typeof v.id !== 'string' || v.id.length === 0) return false;
  if (typeof v.name !== 'string' || v.name.length === 0) return false;
  if (typeof v.blurb !== 'string') return false;
  if (typeof v.lat !== 'number' || typeof v.lng !== 'number') return false;
  if (!isStringArray(v.topicTags)) return false;
  if (typeof v.primaryField !== 'string') return false;
  if (!isCounts(v.last7Avg) || !isCounts(v.baseline90Avg) || !isCounts(v.delta7vs90)) return false;
  if (!isObject(v.series)) return false;
  if (!isStringArray(v.series.periods) || !isNumberArray(v.series.total)) return false;
  if (typeof v.asOf !== 'string') return false;
  return true;
};

export const isChokepointSnapshot = (v: unknown): v is ChokepointSnapshot =>
  isObject(v) &&
  typeof v.generated === 'string' &&
  Array.isArray(v.chokepoints) &&
  v.chokepoints.every(isChokepoint);

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
  if (typeof v.fromDate !== 'string' || typeof v.modifiedDate !== 'string') return false;
  if (v.toDate !== null && typeof v.toDate !== 'string') return false;
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
  if (typeof v.generated !== 'string') return false;
  if (!Array.isArray(v.alerts) || !v.alerts.every(isGdacsAlert)) return false;
  if (!isObject(v.details)) return false;
  for (const detail of Object.values(v.details)) {
    if (!isGdacsDetail(detail)) return false;
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
  return true;
};

export const isTrendsSnapshot = (v: unknown): v is TrendsSnapshot =>
  isObject(v) &&
  typeof v.fetchedAt === 'string' &&
  typeof v.asOf === 'string' &&
  Array.isArray(v.indicators) &&
  v.indicators.every(isIndicator);

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
