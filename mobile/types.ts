export type Category = 'politics' | 'economy' | 'science' | 'tech';

export interface ArticleSource {
  name: string;
  country?: string | null;
  sentiment?: number | null;
}

export interface Article {
  slug: string;
  title: string;
  date: string;
  addedAt: number;
  source: string | null; // derived from sources[0].name — used by globe, share
  sourceUrl: string | null; // derived from sources[0].url — used by share
  sources: ArticleSource[];
  concepts: string[];
  eventCoverage: number | null;
  sentimentDivergence?: number | null;
  location: string | null;
  lat: number | null;
  lng: number | null;
  threadId?: string;
  threadLabel?: string;
  threadArc?: 'breaking' | 'developing' | 'ongoing';
  threadSummary?: string;
  threadDay?: number;
  threadArticleCount?: number;
  sentences: string[];
}

export interface ContextIndexEntry {
  type?: 'edu' | 'thread';
  label: string;
  category: Category;
  articleCount: number;
  generatedAt: string;
}

export interface TimelineEntry {
  year?: string;
  heading?: string;
  body: string;
}

export interface ContextBrief extends ContextIndexEntry {
  id: string;
  timeline: TimelineEntry[];
}

export interface FeedResponse {
  generated: string;
  categories: Record<Category, Article[]>;
  briefing: { date: string; available: boolean; duration?: number } | null;
  contexts?: Record<string, ContextIndexEntry>;
}

export interface MetaResponse {
  generated: string;
}

export type ContextPressHandler = (threadId: string) => void;

export type SourcePressHandler = (
  sourceName: string,
  allSources?: ArticleSource[],
  divergence?: number | null,
) => void;

export interface HeatmapPoint {
  lat: number;
  lng: number;
  c: number; // eventCoverage (0 if null)
  t: number; // addedAt timestamp ms
}
