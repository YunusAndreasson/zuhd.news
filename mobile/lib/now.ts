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
 *   the strip   every market, strait and currency that moved, as a row of
 *               gauges above the earth — subject, reading, direction —
 *               largest move first, swiped sideways. Answers *how much*.
 *   the block   a live Red hazard alert, as a title, above the river.
 *               Gated, so on almost every day it is empty.
 *
 * **The sheet is for news.** The block used to carry instruments too — every
 * strait, index and contract a builder marked `lead` — and once the strip held
 * every reading that moved, what was left of that was contracts and dates
 * sitting above the stories as if they were stories. They left the sheet: a
 * contract still rides the story it settles as an odds chip, and every
 * instrument is one tap away at the end of the strip. What stays is a Red
 * alert, which is news that has no article yet and whose globe mark would
 * otherwise have no accessible row.
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
 *   genuinely new event. The strip re-sorts by one plain quantity, the size of
 *   the move, and keeps that order between equal moves. The block is
 *   newest-first, because everything in it has already cleared a gate — the
 *   gate does the selecting, so the only question left is what just happened.
 */

/** `[latitude, longitude]`, the order `getCoords` and `CITY_COORDS` use.
 *  `MiniGlobe` projects `[lng, lat]`, so a mark layer flips it — once, there. */
export type LatLng = readonly [number, number];

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

export interface NowItem {
  id: string;
  title: string;
  kicker: string;
  /** Epoch ms of the alert's last update — the block's sort key. */
  at: number;
  coords: LatLng | null;
  /** Opens `DisasterSheet`. */
  gdacsEventId: string;
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

function toStripItem(
  card: SwipeCard,
  chokepoints: Chokepoint[],
  signals: MarketSignal[],
  countryCentroid?: (iso2: string) => LatLng | null,
): StripItem {
  return {
    id: card.id,
    // The title, not the kicker. On a card the kicker sits above the title and
    // the two read as one; alone in a third of a phone, the label has to name
    // what the number measures. The deck's kickers are often a category
    // ("currency", "metal", "zakat") or longer than the title they head — the
    // emulator printed "AUSTRALIAN SECURITIES EXC…" over the S&P/ASX 200.
    label: card.title,
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
 * The line under an instrument's title in the instruments sheet's rows.
 *
 * Strait cards are the builders' only kickerless cards, because their title is
 * the place; a row reading "current · instrument" said nothing about a strait.
 */
export function rowKicker(card: SwipeCard): string {
  return card.kicker?.trim() || (card.id.startsWith('strait-') ? 'shipping' : 'markets');
}

/**
 * The strip and the block, in one pass.
 *
 * `ranked` arrives in `prepareSwipeCards` order, which is urgent first. The
 * strip takes every reading with a move and re-sorts it by the size of that
 * move; the block takes live Red alerts, newest first.
 */
export function buildNowSurfaces({
  ranked,
  chokepoints,
  signals,
  gdacsAlerts,
  countryCentroid,
  now = Date.now(),
}: NowInputs): NowSurfaces {
  // Readings only. A contract never takes a slot: a slot's label is its
  // subject, and a prediction market's subject is its question — every
  // contract shares the kicker "what traders think", so a slot holding one
  // printed a level and a move under a label that named nothing. A scheduled
  // date has no move at all. Both stay in the instruments sheet, and a
  // contract also rides the story it settles as an odds chip.
  //
  // A reading with no delta has no up or down to glance at, which is the one
  // thing the strip is for; it stays in the instruments sheet.
  //
  // Largest move first. `Array.prototype.sort` is stable, so equal moves keep
  // the ranked order, and a move measured in points (no `size`) sorts last.
  const strip = ranked
    .filter((card) => card.kind === 'reading' && card.delta)
    .map((card, order) => ({ card, order, size: card.delta?.size ?? -1 }))
    .sort((a, b) => b.size - a.size || a.order - b.order)
    .map(({ card }) => toStripItem(card, chokepoints, signals, countryCentroid));

  const block = hazardItems(gdacsAlerts, now)
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
