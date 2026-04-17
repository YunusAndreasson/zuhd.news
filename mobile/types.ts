export type Category = 'politics' | 'economy' | 'science' | 'tech';

export interface ArticleSource {
  name: string;
  country?: string | null;
  sentiment?: number | null;
}

export type BlockTone = 'favorable' | 'unfavorable' | 'neutral';

export interface CompareRow {
  label: string;
  value: string;
  tone?: BlockTone;
  cc?: string;
  /** Magnitude for rendering a proportional fill behind the row. When present
   *  across rows, the block renders as a light bar chart (max-scaled). */
  weight?: number;
}

/** A single event marker on a trend chart — vertical hairline + small-caps
 *  label at `atIndex` (index into `values` / `periods`). */
export interface TrendAnnotation {
  atIndex: number;
  label: string;
}

export interface Actor {
  name: string;
  role: string;
  /** Date-range served — e.g. "1985–1991" */
  years?: string;
  /** ISO-2 country code → flag prefix */
  cc?: string;
}

/** A source reference on any block is an index into `ContextBrief.sources`. The
 *  renderer resolves it to a short citation caption beneath the block. */
interface BlockSourceRef {
  source?: number;
}

export type ArticleBlock =
  | ({ type: 'prose'; text: string } & BlockSourceRef)
  | ({ type: 'compare'; rows: CompareRow[]; label?: string } & BlockSourceRef)
  | ({
      type: 'trend';
      values: number[];
      label: string;
      unit?: string;
      /** Labels per point (e.g. years) — first and last are rendered as axis
       *  anchors, others are used in accessibility text. */
      periods?: string[];
      highlight?: 'last' | 'first' | 'max' | 'min';
      /** Event markers pinned to specific data points. */
      annotations?: TrendAnnotation[];
    } & BlockSourceRef)
  | ({ type: 'locations'; codes: string[]; label?: string; caption?: string } & BlockSourceRef)
  /** Period quote — editorial texture. Renders as italic body with attribution.
   *  `speaker` names who said it; `source` (here a number, not a string) is an
   *  index into `ContextBrief.sources` for the citation caption. */
  | ({ type: 'quote'; text: string; speaker?: string; year?: string } & BlockSourceRef)
  /** Cast of characters — named actors in a historical context. */
  | ({ type: 'actors'; people: Actor[]; label?: string } & BlockSourceRef)
  /** Active-reading check — one question, three options, retrieval practice
   *  right after the section it quizzes. `correct` is the index into `options`;
   *  `explanation` fades in after the user answers and is where the actual
   *  learning moment happens. */
  | ({
      type: 'quiz';
      question: string;
      options: string[];
      correct: number;
      explanation?: string;
    } & BlockSourceRef);

export type BlockType = ArticleBlock['type'];

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

interface ContextIndexEntry {
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
  /** Optional structured blocks rendered alongside the prose — e.g. a stat for
   *  "115,000 Soviet troops", a sparkline for casualty trend, a locations row
   *  for proxy patrons. Pipeline emits these later; mobile renders them now. */
  blocks?: ArticleBlock[];
}

export interface ContextBrief extends ContextIndexEntry {
  id: string;
  timeline: TimelineEntry[];
  /** Spanning blocks rendered above the timeline — the "arc" view: one map
   *  covering every country mentioned, one trend spanning all entry years. */
  blocks?: ArticleBlock[];
  /** Short citation strings ("Chatham House · 2023", "World Bank") referenced
   *  by blocks via `block.source` (index into this array). */
  sources?: string[];
}

export interface FeedResponse {
  generated: string;
  // Wire format may omit empty categories — post-merge consumers use
  // `GroupedArticles` (a full Record) where every key is guaranteed present.
  categories: Partial<Record<Category, Article[]>>;
  briefing: { date: string; available: boolean; duration?: number } | null;
  contexts?: Record<string, ContextIndexEntry>;
}

export interface MetaResponse {
  generated: string;
}

export interface HeatmapPoint {
  lat: number;
  lng: number;
  c: number; // eventCoverage (0 if null)
  t: number; // addedAt timestamp ms
  l: string; // story label (threadLabel prefix or title)
}
