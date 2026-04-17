import type { Preferences } from '../constants/theme';
import type {
  Article,
  Category,
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
