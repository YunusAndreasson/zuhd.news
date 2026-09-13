import type { Article, ArticleSource, Category } from '@shared/types';
import { CATEGORIES } from '../constants/theme';

/**
 * One story from `/api/story/{slug}.json`, as the app's `Article`.
 *
 * A card lists the stories the desk cited, and those come from a fortnight of
 * coverage, while the feed holds about a day and a half. Opening one used to
 * look only in the feed and in saved stories, so almost every tap closed the
 * card and toasted "Article no longer available". The per-story payload is
 * what the web's `/s/{slug}` reads; it carries the body as HTML, one paragraph
 * per sentence, with the dateline in a span of its own.
 */
export interface StoryPayload {
  slug: string;
  title: string;
  date: string;
  category: string;
  location: string | null;
  eventCoverage?: number | null;
  sentimentDivergence?: number | null;
  bodyHtml: string;
  sources?: { name: string; url: string; country?: string; sentiment?: number | null }[];
}

export const isStoryPayload = (v: unknown): v is StoryPayload => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.slug === 'string' &&
    typeof o.title === 'string' &&
    typeof o.date === 'string' &&
    typeof o.category === 'string' &&
    typeof o.bodyHtml === 'string'
  );
};

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

/** The body's paragraphs as plain sentences, dateline removed. */
export function sentencesFromHtml(html: string): string[] {
  const out: string[] = [];
  for (const chunk of html.split(/<\/p>/i)) {
    const text = chunk
      .replace(/<span class="article-dateline">[\s\S]*?<\/span>/i, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
      .replace(/\s+/g, ' ')
      .trim();
    if (text) out.push(text);
  }
  return out;
}

export function articleFromStory(
  story: StoryPayload,
): { article: Article; category: Category } | null {
  const category = CATEGORIES.find((c) => c === story.category);
  const sentences = sentencesFromHtml(story.bodyHtml);
  const at = Date.parse(story.date);
  if (!category || sentences.length === 0 || !Number.isFinite(at)) return null;
  const sources = (story.sources ?? []).filter(
    (s) => typeof s?.name === 'string' && typeof s?.url === 'string',
  );
  return {
    category,
    article: {
      slug: story.slug,
      title: story.title,
      date: story.date,
      addedAt: at,
      eventAt: at,
      source: sources[0]?.name ?? null,
      sourceUrl: sources[0]?.url ?? null,
      sources: sources as unknown as ArticleSource[],
      concepts: [],
      eventCoverage: story.eventCoverage ?? null,
      sentimentDivergence: story.sentimentDivergence ?? null,
      location: story.location ?? null,
      // The payload carries no coordinates; the story reads without a place.
      lat: null,
      lng: null,
      sentences,
    },
  };
}
