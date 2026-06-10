import type {
  Actor,
  Article,
  ArticleBlock,
  Category,
  Chokepoint,
  ChokepointCounts,
  ChokepointSnapshot,
  CompareRow,
  ConflictEvent,
  ConflictEventFamily,
  ConflictSnapshot,
  ConflictSubEvent,
  ContextBrief,
  FeedResponse,
  GdacsAlert,
  GdacsDetail,
  GdacsSnapshot,
  HeatmapPoint,
  Indicator,
  MetaResponse,
  TrendBand,
  TrendHighlight,
  TrendSeries,
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

const isCompareSegment = (v: unknown): v is NonNullable<CompareRow['segments']>[number] => {
  if (!isObject(v)) return false;
  if (!isFiniteNumber(v.value) || v.value < 0) return false;
  if (v.tone !== undefined && !isTone(v.tone)) return false;
  if (v.label !== undefined && typeof v.label !== 'string') return false;
  return true;
};

const isCompareRow = (v: unknown): v is CompareRow => {
  if (!isObject(v)) return false;
  if (typeof v.label !== 'string' || typeof v.value !== 'string') return false;
  if (v.tone !== undefined && !isTone(v.tone)) return false;
  if (v.cc !== undefined && typeof v.cc !== 'string') return false;
  if (v.weight !== undefined && (typeof v.weight !== 'number' || !Number.isFinite(v.weight)))
    return false;
  if (v.segments !== undefined) {
    if (!Array.isArray(v.segments) || !v.segments.every(isCompareSegment)) return false;
  }
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

const isTrendHighlight = (v: unknown): v is TrendHighlight =>
  v === 'last' || v === 'first' || v === 'max' || v === 'min';

/** Raw (unclean) series entry — `highlight` stays unknown until copied. */
const isRawTrendSeries = (
  s: unknown,
): s is { values: number[]; label: string; highlight?: unknown } =>
  isObject(s) && typeof s.label === 'string' && isNumberArray(s.values) && s.values.length >= 2;

const isLocationMarker = (m: unknown): m is { lat: number; lng: number; label: string } =>
  isObject(m) &&
  isFiniteNumber(m.lat) &&
  m.lat >= -90 &&
  m.lat <= 90 &&
  isFiniteNumber(m.lng) &&
  m.lng >= -180 &&
  m.lng <= 180 &&
  typeof m.label === 'string' &&
  m.label.length > 0 &&
  m.label.length <= 30;

const isYearLike = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(s);

const isRawTimelineEvent = (e: unknown): e is { year: string; label: string; emphasis?: unknown } =>
  isObject(e) &&
  isYearLike(e.year) &&
  typeof e.label === 'string' &&
  e.label.length > 0 &&
  e.label.length <= 60;

const isRawTimelineSpan = (
  s: unknown,
): s is { from: string; to: string; label: string; tone?: unknown } =>
  isObject(s) &&
  isYearLike(s.from) &&
  isYearLike(s.to) &&
  typeof s.label === 'string' &&
  s.label.length > 0 &&
  s.label.length <= 60;

const isRawRankPeer = (p: unknown): p is Record<string, unknown> & { value: number } =>
  isObject(p) &&
  isFiniteNumber(p.value) &&
  ((typeof p.cc === 'string' && p.cc.length > 0) ||
    (typeof p.label === 'string' && p.label.length > 0));

const isSankeyNode = (n: unknown): n is { id: string; label: string } =>
  isObject(n) &&
  typeof n.id === 'string' &&
  n.id.length > 0 &&
  typeof n.label === 'string' &&
  n.label.length > 0 &&
  n.label.length <= 30;

const isRawSankeyLink = (
  l: unknown,
): l is Record<string, unknown> & { source: string; target: string; value: number } =>
  isObject(l) &&
  typeof l.source === 'string' &&
  typeof l.target === 'string' &&
  isFiniteNumber(l.value);

const isRawTreemapItem = (
  it: unknown,
): it is Record<string, unknown> & { label: string; value: number } =>
  isObject(it) &&
  typeof it.label === 'string' &&
  it.label.length > 0 &&
  it.label.length <= 24 &&
  isFiniteNumber(it.value) &&
  it.value > 0;

// Narrowed aliases so each case can build its variant without fighting the union.
type TrendBlock = Extract<ArticleBlock, { type: 'trend' }>;
type LocationsBlock = Extract<ArticleBlock, { type: 'locations' }>;
type TimelineBlock = Extract<ArticleBlock, { type: 'timeline' }>;
type RankBlock = Extract<ArticleBlock, { type: 'rank' }>;
type SankeyBlock = Extract<ArticleBlock, { type: 'sankey' }>;
type TreemapBlock = Extract<ArticleBlock, { type: 'treemap' }>;

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
      // Either `values` (single series) or `series` (multi, capped at 3) —
      // mirrors scripts/lib/validate-blocks.js, the authoring-time validator.
      const values = isNumberArray(v.values) && v.values.length >= 2 ? v.values : null;
      const seriesIn =
        Array.isArray(v.series) && v.series.length > 0 && v.series.every(isRawTrendSeries)
          ? v.series
          : null;
      // Length checks (periods, band, annotations) key off the longest series
      // in the multi case — same rule the generator validated against.
      const primaryValues = seriesIn
        ? seriesIn.reduce<number[]>(
            (longest, s) => (s.values.length > longest.length ? s.values : longest),
            [],
          )
        : values;
      if (!primaryValues) return null;
      if (typeof v.label !== 'string') return null;
      const block: TrendBlock = { type: 'trend', label: v.label };
      if (values) block.values = values;
      if (seriesIn) {
        block.series = seriesIn.slice(0, 3).map((s) => {
          const out: TrendSeries = { values: s.values, label: s.label };
          if (isTrendHighlight(s.highlight)) out.highlight = s.highlight;
          return out;
        });
      }
      if (typeof v.unit === 'string') block.unit = v.unit;
      if (isStringArray(v.periods) && v.periods.length === primaryValues.length) {
        block.periods = v.periods;
      }
      if (isTrendHighlight(v.highlight)) block.highlight = v.highlight;
      if (Array.isArray(v.annotations)) {
        const anns = v.annotations
          .map((a) => parseTrendAnnotation(a, primaryValues.length))
          .filter((a): a is NonNullable<typeof a> => a != null);
        if (anns.length > 0) block.annotations = anns;
      }
      if (v.scale === 'linear' || v.scale === 'log') {
        // Log scale requires strictly positive values across every series and
        // the band — silently downgrade to linear if anything fails.
        if (v.scale === 'log') {
          const allPositive =
            (!values || values.every((n) => n > 0)) &&
            (!seriesIn || seriesIn.every((s) => s.values.every((n) => n > 0)));
          if (allPositive) block.scale = 'log';
        } else {
          block.scale = 'linear';
        }
      }
      if (
        isObject(v.band) &&
        isNumberArray(v.band.low) &&
        isNumberArray(v.band.high) &&
        v.band.low.length === primaryValues.length &&
        v.band.high.length === primaryValues.length
      ) {
        const band: TrendBand = { low: v.band.low, high: v.band.high };
        if (typeof v.band.label === 'string') band.label = v.band.label;
        block.band = band;
      }
      if (typeof v.link === 'string' && /^https?:\/\//.test(v.link)) {
        block.link = v.link;
      }
      return applySourceRef(block, v);
    }
    case 'locations': {
      if (!isStringArray(v.codes) || v.codes.length === 0) return null;
      const block: LocationsBlock = { type: 'locations', codes: v.codes };
      if (typeof v.label === 'string') block.label = v.label;
      if (typeof v.caption === 'string') block.caption = v.caption;
      if (Array.isArray(v.markers)) {
        const markers = v.markers
          .filter(isLocationMarker)
          .slice(0, 8)
          .map((m) => ({ lat: m.lat, lng: m.lng, label: m.label }));
        if (markers.length > 0) block.markers = markers;
      }
      // Choropleth values — codes referenced must be a subset of the highlight set.
      if (Array.isArray(v.values)) {
        const codeSet = new Set(v.codes.map((c) => c.toUpperCase()));
        const values = v.values.filter(
          (entry): entry is { cc: string; value: number } =>
            isObject(entry) &&
            typeof entry.cc === 'string' &&
            codeSet.has(entry.cc.toUpperCase()) &&
            isFiniteNumber(entry.value),
        );
        if (values.length >= 2) {
          block.values = values.map((entry) => ({ cc: entry.cc, value: entry.value }));
          if (typeof v.valueLabel === 'string') block.valueLabel = v.valueLabel;
        }
      }
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
    case 'timeline': {
      const events = Array.isArray(v.events)
        ? v.events
            .filter(isRawTimelineEvent)
            .map((e) => {
              const out: NonNullable<TimelineBlock['events']>[number] = {
                year: e.year,
                label: e.label,
              };
              if (e.emphasis === 'start' || e.emphasis === 'end' || e.emphasis === 'pivot') {
                out.emphasis = e.emphasis;
              }
              return out;
            })
            .slice(0, 8)
        : [];
      const spans = Array.isArray(v.spans)
        ? v.spans
            .filter(isRawTimelineSpan)
            .map((s) => {
              const out: NonNullable<TimelineBlock['spans']>[number] = {
                from: s.from,
                to: s.to,
                label: s.label,
              };
              if (isTone(s.tone)) out.tone = s.tone;
              return out;
            })
            .slice(0, 3)
        : [];
      if (events.length === 0 && spans.length === 0) return null;
      const block: TimelineBlock = { type: 'timeline' };
      if (events.length > 0) block.events = events;
      if (spans.length > 0) block.spans = spans;
      if (typeof v.label === 'string') block.label = v.label;
      return applySourceRef(block, v);
    }
    case 'rank': {
      if (typeof v.metric !== 'string' || v.metric.length === 0) return null;
      const subjectCc =
        typeof v.subjectCc === 'string' && v.subjectCc.length > 0 ? v.subjectCc : null;
      const subjectLabel =
        typeof v.subjectLabel === 'string' && v.subjectLabel.length > 0 ? v.subjectLabel : null;
      if (!subjectCc && !subjectLabel) return null;
      if (!Array.isArray(v.peers)) return null;
      const peers = v.peers.filter(isRawRankPeer).map((p) => {
        const out: RankBlock['peers'][number] = { value: p.value };
        if (typeof p.cc === 'string' && p.cc.length > 0) out.cc = p.cc;
        if (typeof p.label === 'string' && p.label.length > 0) out.label = p.label;
        return out;
      });
      if (peers.length < 5) return null;
      const subjectInPeers = peers.some((p) =>
        subjectCc ? p.cc?.toUpperCase() === subjectCc.toUpperCase() : p.label === subjectLabel,
      );
      if (!subjectInPeers) return null;
      const block: RankBlock = { type: 'rank', metric: v.metric, peers };
      if (subjectCc) block.subjectCc = subjectCc;
      if (subjectLabel) block.subjectLabel = subjectLabel;
      if (typeof v.unit === 'string') block.unit = v.unit;
      return applySourceRef(block, v);
    }
    case 'sankey': {
      if (!Array.isArray(v.nodes) || !Array.isArray(v.links)) return null;
      const nodes = v.nodes.filter(isSankeyNode).map((n) => ({ id: n.id, label: n.label }));
      if (nodes.length < 2 || nodes.length > 12) return null;
      const ids = new Set(nodes.map((n) => n.id));
      const links = v.links
        .filter(
          (l): l is Record<string, unknown> & { source: string; target: string; value: number } =>
            isRawSankeyLink(l) &&
            l.source !== l.target &&
            ids.has(l.source) &&
            ids.has(l.target) &&
            l.value > 0,
        )
        .slice(0, 15)
        .map((l) => {
          const out: SankeyBlock['links'][number] = {
            source: l.source,
            target: l.target,
            value: l.value,
          };
          if (typeof l.label === 'string') out.label = l.label;
          return out;
        });
      if (links.length === 0) return null;
      const block: SankeyBlock = { type: 'sankey', nodes, links };
      if (typeof v.label === 'string') block.label = v.label;
      return applySourceRef(block, v);
    }
    case 'treemap': {
      if (!Array.isArray(v.items)) return null;
      const items = v.items
        .filter(isRawTreemapItem)
        .map((it) => {
          const out: TreemapBlock['items'][number] = { label: it.label, value: it.value };
          if (isTone(it.tone)) out.tone = it.tone;
          return out;
        })
        .slice(0, 10);
      if (items.length < 2) return null;
      const block: TreemapBlock = { type: 'treemap', items };
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

const isCategory = (v: unknown): v is Category =>
  v === 'politics' || v === 'economy' || v === 'science' || v === 'tech';

const isArticle = (v: unknown): v is Article => {
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

const isCounts = (v: unknown): v is ChokepointCounts =>
  isObject(v) && Object.values(v).every(isFiniteNumber);

const isChokepointWeather = (v: unknown): boolean => {
  if (!isObject(v)) return false;
  if (typeof v.asOf !== 'string') return false;
  if (!isFiniteNumber(v.maxWave24hM)) return false;
  if (v.alert !== null && v.alert !== 'rough' && v.alert !== 'very_rough') return false;
  return true;
};

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
  if (v.weather !== undefined && !isChokepointWeather(v.weather)) return false;
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
  typeof v.date === 'string' &&
  typeof v.headline === 'string';

const isConflictEvent = (v: unknown): v is ConflictEvent => {
  if (!isObject(v)) return false;
  if (typeof v.id !== 'string' || v.id.length === 0) return false;
  if (typeof v.eventDate !== 'string' || v.eventDate.length === 0) return false;
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
  if (!isOptionalString(v.dateEnd)) return false;
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
  if (typeof v.generated !== 'string') return false;
  if (typeof v.windowStart !== 'string') return false;
  if (typeof v.windowEnd !== 'string') return false;
  if (!Array.isArray(v.events) || !v.events.every(isConflictEvent)) return false;
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
