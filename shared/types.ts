export type Category = 'politics' | 'economy' | 'science' | 'tech';

export interface ArticleSource {
  name: string;
  /** Link to the original reporting. Present on essentially every source in
   *  article frontmatter; forwarded to the API so readers can verify a story
   *  at its source rather than taking our summary on trust. Null when the
   *  upstream feed gave us no URL. */
  url?: string | null;
  country?: string | null;
  sentiment?: number | null;
  /** Haiku-written one-sentence summary of the distinctive framing this
   *  outlet brought to the story ("emphasizes X", "foregrounds Y"). Null
   *  when the source was unfetchable (paywall, bot-block) OR when the
   *  outlet brought nothing distinctive (wire-verbatim). Shown in the
   *  sources sheet when present; hidden otherwise. */
  angle?: string | null;
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
  /** Composition segments — when present, the row renders as a stacked
   *  horizontal bar of colored cells in place of the single pill. Magnitudes
   *  scale within the row width. Use for "energy mix", "GDP by sector",
   *  "vote share by party". Single-segment rows render as today. */
  segments?: { value: number; tone?: BlockTone; label?: string }[];
}

/** A single event marker on a trend chart — vertical hairline + small-caps
 *  label at `atIndex` (index into `values` / `periods`). */
export interface TrendAnnotation {
  atIndex: number;
  label: string;
}

export type TrendHighlight = 'last' | 'first' | 'max' | 'min';

/** One named series on a multi-series trend chart. Each carries its own values
 *  array (must match the parent block's `periods.length` when periods are set)
 *  and an inline-legend label. Up to 3 series — beyond that the chart reads
 *  as noise on a 360px viewport. */
export interface TrendSeries {
  values: number[];
  label: string;
  highlight?: TrendHighlight;
}

/** Translucent envelope drawn behind the main series — typically a long-run
 *  min/max range that lets the reader see whether the latest point is
 *  historically extreme. `low.length` and `high.length` must match the block's
 *  `values.length` (or each `series.values.length` for the multi case). */
export interface TrendBand {
  low: number[];
  high: number[];
  label?: string;
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
export interface BlockSourceRef {
  source?: number;
}

export type ArticleBlock =
  | ({ type: 'prose'; text: string } & BlockSourceRef)
  | ({ type: 'compare'; rows: CompareRow[]; label?: string } & BlockSourceRef)
  | ({
      type: 'trend';
      /** Single-series payload. Mutually exclusive with `series`. */
      values?: number[];
      /** Multi-series payload (up to 3). When present, takes precedence over
       *  `values` and the renderer draws one path per series with a small
       *  inline legend. */
      series?: TrendSeries[];
      label: string;
      unit?: string;
      /** Labels per point (e.g. years) — render as the time-axis tick set.
       *  When present and parseable as dates, a real time scale is used; when
       *  not, ticks fall back to first/last anchors. */
      periods?: string[];
      highlight?: TrendHighlight;
      /** Event markers pinned to specific data points. Single-series only. */
      annotations?: TrendAnnotation[];
      /** Y-axis scale. `log` unlocks ranges where linear is unreadable
       *  (GDP-per-capita-style series). All values must be > 0 for log. */
      scale?: 'linear' | 'log';
      /** Translucent historical envelope drawn behind the main series. */
      band?: TrendBand;
      /** External URL the chart links to (e.g. Polymarket event). The renderer
       *  wires this to onPress so curious readers can verify the source. */
      link?: string;
    } & BlockSourceRef)
  | ({
      type: 'locations';
      codes: string[];
      label?: string;
      caption?: string;
      /** Optional named site markers (port, plant, base, accident site). The
       *  renderer drops a small dot + label at the projected lat/lng. */
      markers?: { lat: number; lng: number; label: string }[];
      /** Optional choropleth payload — when present, country fill is driven
       *  by a sequential color scale over `value` instead of the binary
       *  highlight. `cc` keys must be a subset of `codes`. */
      values?: { cc: string; value: number }[];
      /** Caption for the choropleth scale (e.g. "refugees per capita"). */
      valueLabel?: string;
    } & BlockSourceRef)
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
    } & BlockSourceRef)
  /** Gantt-style event arc on a horizontal time axis. `events` are point
   *  ticks; `spans` are translucent ranges (e.g. "Soviet occupation 1979–89").
   *  Use for treaty → collapse → re-emergence stories. */
  | ({
      type: 'timeline';
      events?: { year: string; label: string; emphasis?: 'start' | 'end' | 'pivot' }[];
      spans?: { from: string; to: string; label: string; tone?: BlockTone }[];
      label?: string;
    } & BlockSourceRef)
  /** Peer-position dot-on-strip — locates a subject among peers on a single
   *  metric. Country mode keys peers by ISO-2 (`cc` + `subjectCc`) and shows a
   *  flag in the subject label; non-country mode keys peers by free-text
   *  `label` (cases, companies, indicators) and shows that label as-is.
   *  Provide exactly one of `subjectCc` / `subjectLabel`. */
  | ({
      type: 'rank';
      metric: string;
      unit?: string;
      subjectCc?: string;
      subjectLabel?: string;
      peers: { cc?: string; label?: string; value: number }[];
    } & BlockSourceRef)
  /** Sankey flow diagram — for cascades and pipelines (circular debt, energy
   *  flows, refugee origins → hosts). Layout via d3-sankey, rendered with
   *  Skia rectangles + Bezier ribbons. Cap 5 nodes per side, 10 links. */
  | ({
      type: 'sankey';
      nodes: { id: string; label: string }[];
      links: { source: string; target: string; value: number; label?: string }[];
      label?: string;
    } & BlockSourceRef)
  /** Composition-at-a-glance — d3-hierarchy treemap of value-weighted items.
   *  Use for budget breakdowns, GDP by sector, casualty categories. Cap 10
   *  items so labels stay legible at 360px. */
  | ({
      type: 'treemap';
      items: { label: string; value: number; tone?: BlockTone }[];
      label?: string;
    } & BlockSourceRef);

export type BlockType = ArticleBlock['type'];

/** Classes of tappable entities in article bodies. Each kind maps to a
 *  presentation style in the EntitySheet (a chart with optional framing).
 *  Extracted server-side from known rich-noun mentions; see
 *  `scripts/lib/entity-registry.js`. */
export type EntityKind = 'commodity' | 'currency' | 'chokepoint' | 'crypto' | 'index' | 'stock';

/** One tappable reference from an article body into the indicator catalog.
 *  `mention` is the literal string matched in the body (used by the renderer
 *  to locate the tappable run); `indicatorId` keys into `TrendsSnapshot`. */
export interface Entity {
  mention: string;
  indicatorId: string;
  kind: EntityKind;
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
  /** Optional list of rich-noun references in the body — each opens an
   *  `EntitySheet` with the matching indicator's chart + related stories.
   *  Missing array or empty array both mean "no tappable entities"; mobile
   *  never fails on an absent field. */
  entities?: Entity[];
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

/** PortWatch vessel-class columns. Mirrors the backend's SNAPSHOT_VESSEL_FIELDS
 *  — keeping these as raw field names lets the ChokepointSnapshot travel end to
 *  end untranslated; translation to display labels happens once in the sheet. */
export type VesselField =
  | 'n_total'
  | 'n_tanker'
  | 'n_container'
  | 'n_dry_bulk'
  | 'n_cargo'
  | 'n_general_cargo'
  | 'n_roro';

export type ChokepointCounts = Partial<Record<VesselField, number>>;

/** IMF PortWatch-derived chokepoint state — ambient layer rendered on the
 *  globe. `primaryField` selects which vessel class the headline stat and
 *  disruption trigger care about (tanker for oil chokepoints, container for
 *  commercial routes). `delta7vs90[field]` is a signed fraction: +0.12 means
 *  last-7d average is 12% above the 90d baseline. */
/** Marine-weather sidecar attached server-side from open-meteo's Marine API.
 *  `maxWave24hM` is the peak combined-sea wave height (metres) over the
 *  past 24h at the chokepoint coordinates. `alert` is set when waves cross
 *  small-craft / disruption thresholds — `rough` ≥2.5m, `very_rough` ≥4m.
 *  Absent on inland canals (Suez, Panama) where wave height isn't
 *  meaningful — open-meteo returns null and the field silently drops. */
export interface ChokepointWeather {
  asOf: string;
  maxWave24hM: number;
  alert: 'rough' | 'very_rough' | null;
}

export interface Chokepoint {
  id: string;
  name: string;
  blurb: string;
  lat: number;
  lng: number;
  topicTags: string[];
  primaryField: VesselField;
  last7Avg: ChokepointCounts;
  baseline90Avg: ChokepointCounts;
  delta7vs90: ChokepointCounts;
  series: { periods: string[]; total: number[] };
  asOf: string;
  weather?: ChokepointWeather;
  /** What the chokepoint *is* — stable geography and why the world's freight
   *  cares about it. Written by the narration stage and joined at build time,
   *  the same way `Indicator.standing` is. Absent on a build that ran before
   *  that stage wrote a dispatch. */
  standing?: string;
  /** What is happening there now, tied to recent coverage. */
  recent?: string;
  /** The articles `recent` was built from, most relevant first. */
  relatedArticles?: RelatedArticleRef[];
}

/**
 * A pointer from a non-article surface (a chokepoint, a calendar event) back
 * into the corpus, resolved at build time. The dispatch files that carry these
 * are committed, and an article can be renamed or withdrawn between the run
 * that wrote one and the build that reads it — so the resolution happens
 * server-side and a consumer never has to handle a dangling slug.
 */
export interface RelatedArticleRef {
  slug: string;
  title: string;
  date?: string;
  dateFormatted?: string;
}

export interface ChokepointSnapshot {
  generated: string;
  chokepoints: Chokepoint[];
}

// ── GDACS (Global Disaster Alert and Coordination System) ──────────────────
//
// Pre-fetched server-side once per cycle (scripts/fetch-gdacs.js) and served
// from /api/gdacs.json so mobile reads one Cloudflare-cached blob instead of
// hitting gdacs.org on launch + every disaster sheet open.

export type GdacsEventType = 'EQ' | 'TC' | 'FL' | 'VO' | 'DR' | 'WF';
export type GdacsAlertLevel = 'Green' | 'Orange' | 'Red';

export interface GdacsAlert {
  eventid: string;
  eventtype: GdacsEventType;
  alertlevel: GdacsAlertLevel;
  /** Human-readable event name, e.g. "M 7.4 Honshu, Japan". */
  name: string;
  /** Primary affected country (full name as published by GDACS). */
  country: string;
  iso3: string;
  /** Country names of every affected jurisdiction, including primary. */
  affectedCountries: string[];
  lat: number;
  lng: number;
  /** ISO timestamps. `toDate` is null for open-ended events. */
  fromDate: string;
  toDate: string | null;
  modifiedDate: string;
  /** Pre-formatted GDACS severity string, e.g.
   *  "Magnitude 7.4M, Depth:23km" / "Tropical Storm wind speed of 95 km/h". */
  severityText: string;
  severityValue: number | null;
  severityUnit: string;
  /** Plain-text summary, HTML stripped, capped to ~280 chars. Templated GDACS
   *  auto-captions ("Green M 5 Earthquake in X at: <date>") are filtered to
   *  empty server-side since their content is already in name + severityText
   *  + fromDate. Non-empty only when GDACS publishes substantive narrative. */
  description: string;
  /** Originating authority code — "NEIC", "JRC", "JTWC", "Smithsonian", etc.
   *  Empty when GDACS doesn't publish one. */
  source: string;
  reportUrl: string | null;
  /** LLM-composed 2-3 sentence narrative tying the alert to country context,
   *  recent weather (FL/WF/DR), nearby chokepoints, and recent coverage. Only
   *  written for Orange/Red alerts; cached across cycles by an inputs-hash so
   *  multi-day events aren't re-narrated every 4 hours. Absent on Green
   *  alerts and on Orange/Red where the narration call failed. */
  narrative?: string;
}

/** Population-exposure detail surface, fetched server-side for each EQ/TC
 *  alert. Two tiers per event so the sheet picks the most-severe zone with
 *  meaningful data; `null` populations mean GDACS published nothing
 *  meaningful for that tier (the sheet hides the row). */
export interface GdacsDetail {
  criticalPopulation: number | null;
  criticalClause: string;
  widerPopulation: number | null;
  widerClause: string;
}

/** /api/gdacs.json shape. `details` is keyed by `${eventtype}:${eventid}` —
 *  only EQ and TC alerts have entries, since other event types surface their
 *  scale through severityText already. */
export interface GdacsSnapshot {
  generated: string;
  alerts: GdacsAlert[];
  details: Record<string, GdacsDetail>;
}

// ── Conflict events ────────────────────────────────────────────────────────
//
// Today: mobile reads from a bundled fixture (mobile/lib/conflict-fixture.json)
// produced by scripts/fetch-conflict-prototype.js, sourced from UCDP's
// Candidate GED (academic, monthly, CC-BY 4.0).
//
// Backend path (when ready):
//   1. Add scripts/fetch-conflict.js — same shape as fetch-gdacs.js, reuses
//      the transform in scripts/lib/conflict.js, writes content/.conflict.json.
//   2. Add a /api/conflict.json mirror in scripts/build.js (mirror the
//      /api/gdacs.json hop).
//   3. Swap the hook body in mobile/hooks/useConflictEvents.ts (one-liner;
//      see comment block in that file).
// The schema below is the canonical contract — ConflictSnapshot is what
// the file at /api/conflict.json must conform to, and isConflictSnapshot
// in mobile/lib/validate.ts gates the runtime parse.
//
// Two-tier visual family — `kinetic` covers armed violence (battles,
// explosions, violence against civilians) and reads as the impact-burst
// glyph; `unrest` covers protests + riots and reads as the crowd glyph.
// ACLED's "strategic developments" category is intentionally excluded —
// it's useful sheet context but doesn't deserve a globe marker. UCDP
// covers only kinetic events (it's fatality-gated); ACLED would later
// populate the unrest layer too.

export type ConflictEventFamily = 'kinetic' | 'unrest';

export type ConflictSubEvent =
  | 'armed_clash'
  | 'air_drone_strike'
  | 'shelling_artillery'
  | 'remote_explosive_ied'
  | 'attack_on_civilians'
  | 'abduction_disappearance'
  | 'sexual_violence'
  | 'peaceful_protest'
  | 'protest_intervention'
  | 'violent_demonstration'
  | 'mob_violence';

/** One source/article record from the upstream `source_article` field —
 *  outlet name, the date it reported, and its headline. UCDP packs N of
 *  these per event; we expose them as a structured array so the sheet
 *  can show "5 sources confirm" with attribution rather than truncating
 *  the first one to 140 chars. */
export interface ConflictReportedSource {
  outlet: string;
  /** YYYY-MM-DD when this outlet reported the event. */
  date: string;
  headline: string;
}

export interface ConflictEvent {
  id: string;
  /** ISO date (YYYY-MM-DD), the day the event occurred. */
  eventDate: string;
  /** ISO date when the event ended. Equal to eventDate for single-day
   *  events; differs for multi-day operations (siege, sweep, prolonged
   *  shelling). */
  dateEnd?: string;
  family: ConflictEventFamily;
  subEvent: ConflictSubEvent;
  /** Primary actor — group, force, or label as published by the source. */
  actor1: string;
  actor2?: string;
  /** UCDP `conflict_name` — proper geopolitical conflict label, e.g.
   *  "Afghanistan - Pakistan" or "Government of Sudan - SPLM/A-North".
   *  More specific than the actor pairing alone. */
  conflictName?: string;
  country: string;
  iso3: string;
  /** UCDP region — Asia, Africa, Middle East, Americas, Europe. Optional
   *  on consumer; lets a future filter UI scope by region without
   *  re-deriving from country. */
  region?: string;
  /** ACLED's admin1 — typically state/province. Optional because not every
   *  reported event resolves to that level. */
  admin1?: string;
  /** Town/village name as reported. */
  location: string;
  /** Verbose location description from upstream `where_description`
   *  ("Hijrat Abad camp / Hajratabad in Kunar province's Khas Kunar
   *  district"). Richer than `location` for the sheet's secondary line. */
  locationDetail?: string;
  lat: number;
  lng: number;
  /** Reported fatalities (UCDP `best` estimate). 0 is meaningful for
   *  unrest events; the sheet uses it to choose the focal metric
   *  (fatalities > 0 → fatalities; else sub-event label). */
  fatalities: number;
  /** Confidence interval on fatalities — UCDP `low` and `high`. Lets the
   *  sheet render "12 (3-15)" when low ≠ best ≠ high. */
  fatalitiesLow?: number;
  fatalitiesHigh?: number;
  /** Casualty breakdown by side. UCDP labels: deaths_a (side_a forces),
   *  deaths_b (side_b forces), deaths_civilians (non-combatants),
   *  deaths_unknown. Together these sum to (or under) `fatalities`. */
  deathsSideA?: number;
  deathsSideB?: number;
  deathsCivilians?: number;
  deathsUnknown?: number;
  /** Number of distinct sources UCDP cited for this event. ≥3 is solid
   *  corroboration; 1 is single-source. Drives a credibility chip. */
  numSources?: number;
  /** One-sentence summary derived from the upstream lead headline. */
  notes: string;
  /** Originating outlet / aggregator (single primary). */
  source: string;
  sourceUrl?: string;
  /** Full list of corroborating reports parsed from `source_article`. */
  sources?: ConflictReportedSource[];
}

export interface ConflictSnapshot {
  generated: string;
  /** Inclusive ISO dates bracketing the events array. */
  windowStart: string;
  windowEnd: string;
  events: ConflictEvent[];
}

/** One indicator from the trends snapshot at `/api/trends.json`. Mirrors the
 *  shape the pipeline writes in `content/trends/<date>.json`. Value/periods
 *  pairs drive the chart in `EntitySheet`; `topicTags` and `countryTags` are
 *  kept for future tag-based relevance work. */
export interface Indicator {
  id: string;
  label: string;
  unit?: string;
  source: string;
  seriesId?: string;
  cadence?: 'daily' | 'monthly';
  topicTags?: string[];
  countryTags?: string[];
  defaultHighlight?: 'last' | 'first' | 'max' | 'min';
  sourceLabel: string;
  values: number[];
  periods: string[];
  asOf?: string;
  latest?: number | null;
  previous?: number | null;
  marketUrl?: string;
  /**
   * One written paragraph saying what this indicator is and why a move in it
   * reaches an ordinary life — "fuel, freight and fertiliser move after it".
   *
   * This is the difference between a reading and a fact. Every card that shows
   * a number owes the reader this sentence, and the pipeline has been writing
   * it for every indicator (48 of 50 today) since long before anything
   * rendered it. Optional because two indicators still lack one and because a
   * snapshot written before the narration stage existed has none at all.
   */
  standing?: string;
  /** Why it matters right now, tied to recent coverage. Written for events
   *  today; reserved here so an indicator can carry one without a type change. */
  recent?: string;
  /** The articles `recent` was built from, most relevant first. */
  relatedArticles?: RelatedArticleRef[];
}

/** One scheduled statistical release, from FRED's calendar. */
export interface TrendRelease {
  /** ISO date the release is published on. */
  date: string;
  /** The releasing agency's own name for it — "Consumer Price Index". */
  release: string;
}

/**
 * One scheduled macro/political event on the money rail's events block —
 * a central-bank decision, an OPEC+ meeting, a major non-US release or a
 * summit/election. Wider in scope than `TrendRelease` (US-only, FRED-only)
 * and separate from it rather than replacing it: `releaseCalendar` is a
 * published field and existing consumers keep reading it unchanged.
 *
 * `standing`/`recent`/`citations` are written by `narrate-events.js` (Stage
 * 3.8b) and joined on at build time, exactly as `Indicator`'s equivalent
 * fields are — see `build.js`'s indicator-dispatch join. Absent on a build
 * that ran before that stage ever wrote a dispatch file, or on an event the
 * stage has not yet reached.
 */
export interface TrendEvent {
  id: string;
  title: string;
  institution: string;
  kind: 'central-bank' | 'opec' | 'econ-release' | 'summit-election';
  /** ISO date the event lands on. */
  date: string;
  topicTags?: string[];
  countryTags?: string[];
  /** What the event/institution is — stable, general knowledge. */
  standing?: string;
  /** Why it matters right now, tied to recent coverage. */
  recent?: string;
  /**
   * The articles `recent` was actually built from, most relevant first —
   * resolved against the corpus at build time from the dispatch's own
   * `citations` slugs, the same way `MapChokepoint.relatedArticles` is: the
   * dispatch file is committed and an article can be renamed or withdrawn
   * between the run that wrote it and the build that reads it.
   */
  relatedArticles?: RelatedArticleRef[];
}

export interface TrendsSnapshot {
  fetchedAt: string;
  asOf: string;
  /** Major US releases in the next ten days. Absent from snapshots written
   *  before this field existed, and from any cycle that ran without a
   *  `FRED_API_KEY`, so every reader must treat it as optional. */
  releaseCalendar?: TrendRelease[];
  /** The money rail's events block: FRED's recognised US releases merged
   *  with the hand-curated catalog (central banks, OPEC+, major non-US
   *  releases, summits/elections), within a near-term window. Absent from
   *  snapshots written before this field existed. */
  events?: TrendEvent[];
  indicators: Indicator[];
}

// ── IPC / Cadre Harmonisé acute food insecurity ────────────────────────────
//
// Served from /api/ipc.json, sourced from OCHA's Humanitarian Data Exchange
// (CC0). One record per analysed *area* — a district, a governorate, a camp —
// not per country, which is why 101 records cover 6 countries.

/** IPC acute food insecurity phase. 1 Minimal · 2 Stressed · 3 Crisis ·
 *  4 Emergency · 5 Catastrophe/Famine. Phase 3 is the threshold at which the
 *  classification calls for urgent action, which is why `p3plus` — not the
 *  headline phase — is the number that describes the scale of a crisis. */
export type IpcPhase = 1 | 2 | 3 | 4 | 5;

export interface IpcArea {
  id: string;
  area: string;
  /** Admin-1 name where the source publishes one; empty string otherwise. */
  level1: string;
  iso3: string;
  iso2: string;
  phase: IpcPhase;
  /** The source's own name for the phase — "Emergency", "Crisis". Use it
   *  rather than re-deriving a label from the number. */
  phaseName: string;
  confidence?: number;
  lat: number;
  lng: number;
  /** Human-readable analysis vintage, e.g. "Jun 2026". */
  vintage: string;
  ageMonths: number;
  from: string;
  to: string;
  /** Population in each band. `p3plus` is cumulative (phase 3, 4 and 5
   *  together); `p4` and `p5` are the tails inside it, so they must never be
   *  added to `p3plus`. */
  pop: {
    total: number;
    p3plus: number;
    p4: number;
    p5: number;
  };
  /** Present when a newer analysis covers the same area; the record is kept
   *  so a projection and its update can both be shown. */
  supersededBy?: { from: string; to: string };
}

export interface IpcSnapshot {
  generated: string;
  source: string;
  license: string;
  ageLimitMonths: number;
  /** ISO-3 codes with at least one area in `areas`. */
  countries: string[];
  areas: IpcArea[];
}

// ── Genocide determinations ────────────────────────────────────────────────
//
// Served from /api/genocide.json. Deliberately narrow: a situation appears
// here only when a named body has published a named document reaching a
// finding. The document is part of the payload because the citation is the
// claim — the app never makes this determination itself, it reports one.

export interface Determination {
  id: string;
  name: string;
  iso2: string;
  /** Country profile name, where it differs from the situation name
   *  ("Rakhine" → "Myanmar"). */
  profile: string;
  lat: number;
  lng: number;
  finding: 'determination';
  /** The body that made the finding, in full. */
  body: string;
  /** The document it was published in, with its symbol. */
  document: string;
  /** ISO date of the document. */
  date: string;
  summary: string;
  url: string;
  /** Month the situation is dated from, "YYYY-MM". */
  since: string;
}

export interface GenocideSnapshot {
  situations: Determination[];
}
