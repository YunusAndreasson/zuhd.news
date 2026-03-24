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
  source: string | null;      // derived from sources[0].name — used by globe, share
  sourceUrl: string | null;   // derived from sources[0].url — used by share
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

export interface FeedResponse {
  generated: string;
  categories: Record<Category, Article[]>;
  briefing: { date: string; available: boolean; duration?: number } | null;
}
