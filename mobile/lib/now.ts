import type { MarketSignal } from '@shared/market-signals';
import type { Article, Chokepoint, GdacsAlert } from '@shared/types';
import type { SwipeCard } from './cards/rank';
import type { CardDelta } from './cards/types';
import { EVENT_TYPE_EYEBROW } from './gdacs';

/**
 * What the app says is happening, before the reader scrolls.
 *
 * Two surfaces, built together so they cannot disagree:
 *
 *   the strip   three gauges above the earth — subject, reading, direction.
 *               Answers *how much*. Ranked, so it is always full.
 *   the block   what else is flashing, as titles. Answers *what*.
 *               Gated, so on a quiet day it is short or empty.
 *
 * They are built by one function because the invariant between them is not
 * something a caller can be trusted to remember: `foundation.md` forbids a fact
 * appearing twice, and an instrument printed as `HORMUZ −57% ▼` at the top of
 * the screen and again as a row thirty points below it is the same fact twice.
 * The block therefore takes the strip's ids and skips them — enforced here,
 * not at the call site.
 *
 * Three deliberate absences:
 *
 *   **No story ever enters the block.** The river below it is already strictly
 *   newest-first, so its first row *is* the lead story; promoting that same
 *   story into a block directly above itself is the repetition this module
 *   exists to prevent. Stories still get marks on the globe and still drive
 *   the camera — see `coverageRanks`.
 *
 *   **No conflict event enters the block.** UCDP publishes months in arrears
 *   — `MiniGlobe` anchors their recency on the dataset's newest event rather
 *   than on `Date.now()` for exactly that reason. A heading that says NOW over
 *   a line reading "14 killed in Kunar" about an event from March is not a
 *   presentation bug, it is a false claim. They stay a globe layer.
 *
 *   **No blended score anywhere.** `lib/cards/rank.ts` already ranks
 *   lexicographically and says why: a blend lets a large market move bury a
 *   genuinely new event. The strip reads straight off that order. The block is
 *   newest-first, because everything in it has already cleared a gate — the
 *   gate does the selecting, so the only question left is what just happened.
 */

/** `[latitude, longitude]`, the order `getCoords` and `CITY_COORDS` use.
 *  `MiniGlobe` projects `[lng, lat]`, so a mark layer flips it — once, there. */
export type LatLng = readonly [number, number];

/** Three slots. Fixed, so a reader learns where to look; the contents change
 *  with the day, which is what a news app's gauges are for. */
export const STRIP_SLOTS = 3;

/** A fourth and fifth row turn the block into a second river. Four is the most
 *  it may claim is happening at once. */
export const NOW_LIMIT = 4;

/** A GDACS alert older than this is history, whatever its level. Matches the
 *  window `useGdacsAlerts` renders and keeps a month-old Red off a NOW block. */
export const HAZARD_MAX_AGE_DAYS = 7;

/** Top quartile of the stories that publish a coverage figure. Drives mark
 *  size on the globe; never a gate for the block. */
export const STORY_PROMINENT_RANK = 0.75;

export interface StripItem {
  /** The card's own id — also the globe mark's id, so a tap on either lights
   *  the same thing. */
  id: string;
  /** Subject, short enough for a third of a phone's width. */
  label: string;
  reading: string;
  readingNote?: string;
  delta?: CardDelta;
  coords: LatLng | null;
  card: SwipeCard;
}

export type NowKind = 'instrument' | 'hazard';

export interface NowItem {
  id: string;
  kind: NowKind;
  title: string;
  kicker: string;
  /** Epoch ms of the observation the row stands on — the block's sort key. */
  at: number;
  coords: LatLng | null;
  /** Set when `kind === 'instrument'`. Opens `CardSheet`. */
  card?: SwipeCard;
  /** Set when `kind === 'hazard'`. Opens `DisasterSheet`. */
  gdacsEventId?: string;
}

export interface NowSurfaces {
  strip: StripItem[];
  now: NowItem[];
}

export interface NowInputs {
  /** Every instrument card, already through `prepareSwipeCards` — one ranked
   *  list across markets, straits, predictions and scheduled dates. */
  ranked: SwipeCard[];
  chokepoints: Chokepoint[];
  signals: MarketSignal[];
  gdacsAlerts: GdacsAlert[];
  /** ISO-2 → centroid. Injected rather than imported because it needs globe
   *  topology, and this module is pure enough to test without it. */
  countryCentroid?: (iso2: string) => LatLng | null;
  now?: number;
}

const parseTime = (iso: string | undefined): number => {
  if (!iso) return Number.NaN;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Number.NaN;
};

/**
 * Where a card is, for the cards that are anywhere at all.
 *
 * Brent is North Sea crude and gold is priced in London, but the gold-to-silver
 * ratio is not in London and the nisab is not anywhere — so the honest answer
 * for most of the deck is `null`, and a card with no place simply has no mark.
 * That is what the instruments sheet is for.
 */
function locateCard(
  card: SwipeCard,
  chokepoints: Chokepoint[],
  signals: MarketSignal[],
  countryCentroid?: (iso2: string) => LatLng | null,
): LatLng | null {
  if (card.id.startsWith('strait-')) {
    const id = card.id.slice('strait-'.length);
    const cp = chokepoints.find((c) => c.id === id);
    if (cp && Number.isFinite(cp.lat) && Number.isFinite(cp.lng)) return [cp.lat, cp.lng];
    return null;
  }

  if (card.id.startsWith('market-signal:')) {
    const id = card.id.slice('market-signal:'.length);
    const signal = signals.find((s) => s.id === id);
    if (!signal) return null;
    // `lat`/`lng` are additive on `MarketSignal`, like `city`/`country` before
    // them: a client reading an older snapshot sees them absent, not wrong.
    // Until the pipeline ships them, an exchange lands on its country's
    // centroid — a few hundred kilometres out at world zoom, which is the
    // difference between a mark in the right country and no mark at all.
    if (Number.isFinite(signal.lat) && Number.isFinite(signal.lng)) {
      return [signal.lat as number, signal.lng as number];
    }
    if (signal.country && countryCentroid) return countryCentroid(signal.country);
    return null;
  }

  return null;
}

/** The observation a card stands on, as epoch ms. `asOf` is deliberately not
 *  the fetch time — a file rebuilt today can still hold older source data. */
function cardTime(card: SwipeCard, fallback: number): number {
  const t = parseTime(card.asOf);
  return Number.isFinite(t) ? t : fallback;
}

function toStripItem(
  card: SwipeCard,
  chokepoints: Chokepoint[],
  signals: MarketSignal[],
  countryCentroid?: (iso2: string) => LatLng | null,
): StripItem {
  return {
    id: card.id,
    // The kicker is the subject slot — `Borsa İstanbul` over `BIST 100` — and
    // is shorter than the title on every card that has one, which is what a
    // third of a phone's width can carry. Title is the fallback.
    label: card.kicker?.trim() || card.title,
    reading: card.reading,
    readingNote: card.readingNote,
    delta: card.delta,
    coords: locateCard(card, chokepoints, signals, countryCentroid),
    card,
  };
}

/** Red only. Orange is the common case in a GDACS feed and a block that lists
 *  every Orange alert is a block nobody reads — the same reasoning that keeps
 *  severity single-tier in `lib/severity.ts`. */
function hazardItems(alerts: GdacsAlert[], now: number): NowItem[] {
  const cutoff = now - HAZARD_MAX_AGE_DAYS * 86_400_000;
  const items: NowItem[] = [];
  for (const alert of alerts) {
    if (alert.alertlevel !== 'Red') continue;
    const at = parseTime(alert.modifiedDate);
    if (!Number.isFinite(at) || at < cutoff) continue;
    items.push({
      id: `gdacs:${alert.eventtype}:${alert.eventid}`,
      kind: 'hazard',
      title: alert.name,
      kicker: EVENT_TYPE_EYEBROW[alert.eventtype] ?? 'hazard',
      at,
      coords: [alert.lat, alert.lng],
      gdacsEventId: alert.eventid,
    });
  }
  return items;
}

/**
 * The strip and the block, in one pass so the dedupe cannot drift.
 *
 * `ranked` arrives in `prepareSwipeCards` order, which is urgent first. The
 * strip takes the first three; the block takes every *remaining* card that a
 * builder marked `lead` — the ones gated on their own data being new, rather
 * than on their subject mattering — plus any live Red alert, newest first.
 */
export function buildNowSurfaces({
  ranked,
  chokepoints,
  signals,
  gdacsAlerts,
  countryCentroid,
  now = Date.now(),
}: NowInputs): NowSurfaces {
  const strip = ranked
    .slice(0, STRIP_SLOTS)
    .map((card) => toStripItem(card, chokepoints, signals, countryCentroid));

  const onStrip = new Set(strip.map((item) => item.id));

  const instruments: NowItem[] = [];
  for (const card of ranked) {
    if (onStrip.has(card.id) || !card.lead) continue;
    instruments.push({
      id: card.id,
      kind: 'instrument',
      title: card.title,
      kicker: card.kicker?.trim() || 'instrument',
      at: cardTime(card, now),
      coords: locateCard(card, chokepoints, signals, countryCentroid),
      card,
    });
  }

  const block = [...hazardItems(gdacsAlerts, now), ...instruments]
    // Newest first. Ties break on id so a rebuild cannot shuffle the block
    // under a reader who is looking at it.
    .sort((a, b) => b.at - a.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, NOW_LIMIT);

  return { strip, now: block };
}

/**
 * Percentile rank of each story's coverage, over the stories that publish one.
 *
 * Ported from `coverageRanks` in `scripts/build.js`, and the reason is worth
 * keeping: `eventCoverage` is absent on roughly two thirds of articles and
 * where present is occasionally nonsense — the corpus holds values like 157957,
 * which is not a number of outlets. A raw value or a log curve therefore pins
 * most marks at the minimum radius while a handful of bad rows saturate the
 * top. A percentile over the values we actually have fixes both at once.
 *
 * A story with no figure is **absent from the map**, not present at zero. The
 * caller draws it at a fixed neutral size, which says "unknown" rather than
 * "smallest".
 */
export function coverageRanks(
  articles: readonly Pick<Article, 'slug' | 'eventCoverage'>[],
): Map<string, number> {
  const values: number[] = [];
  for (const article of articles) {
    const c = article.eventCoverage;
    if (typeof c === 'number' && Number.isFinite(c) && c > 0) values.push(c);
  }
  const ranks = new Map<string, number>();
  if (values.length === 0) return ranks;

  values.sort((a, b) => a - b);
  const span = values.length - 1;

  for (const article of articles) {
    const c = article.eventCoverage;
    if (typeof c !== 'number' || !Number.isFinite(c) || c <= 0) continue;
    let lo = 0;
    let hi = values.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((values[mid] as number) < c) lo = mid + 1;
      else hi = mid;
    }
    ranks.set(article.slug, span === 0 ? 1 : Math.round((lo / span) * 100) / 100);
  }
  return ranks;
}
