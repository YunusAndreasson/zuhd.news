export type Category = 'politics' | 'economy' | 'science' | 'tech';

export interface Article {
  slug: string;
  title: string;
  date: string;
  addedAt: number;
  source: string | null;
  sourceUrl: string | null;
  sentences: string[];
}

export interface FeedResponse {
  generated: string;
  categories: Record<Category, Article[]>;
  briefing: { date: string; available: boolean } | null;
}
