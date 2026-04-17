import type { Preferences } from '../constants/theme';
import type {
  Actor,
  Article,
  ArticleBlock,
  Category,
  CompareRow,
  ContextBrief,
  FeedResponse,
  HeatmapPoint,
  MetaResponse,
} from '../types';
import type { Bookmark } from './bookmark-store';

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((s) => typeof s === 'string');

const isNumberArray = (v: unknown): v is number[] =>
  Array.isArray(v) && v.every((n) => typeof n === 'number' && Number.isFinite(n));

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
      return applySourceRef({ type: 'compare', rows }, v);
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
