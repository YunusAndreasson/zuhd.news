import type {
  Article,
  Chokepoint,
  Indicator,
  IndicatorAnalysis,
  TrendEvent,
  TrendsSnapshot,
} from '@shared/types';
import { indicatorObservation, isCurrentObservation, oldestObservation } from '../data-freshness';
import { chokepointValence, type RiseMeans, riseMeansFor } from '../valence';
import {
  deltaFrom,
  formatCount,
  formatMagnitudePct,
  formatQuantity,
  formatReading,
  formatSignedPct,
  latestOf,
  nisab,
  relatedForTags,
  seriesExtremes,
  windowChange,
  windowPointChange,
} from './format';
import type { BeliefCard, Card, CardDelta, CardSeries, ReadingCard, ScheduledCard } from './types';

/**
 * The instrument columns, no network call the app was not already making.
 * `trends.json` (50 indicators) and `chokepoints.json` (11 straits) are
 * fetched on every launch and, until now, one chart was drawn from the first
 * of them — in a sheet reached by tapping a word.
 *
 * Concrete subject pools keep the builder honest about what each payload is.
 * `lib/cards/sections.ts` admits only graph-backed pieces with live analysis
 * into the reader-facing markets, shipping and outlook desks.
 *
 * What is *not* here is the point of the file. Thirty exchanges, the S&P, the
 * NASDAQ, TSMC, copper, TTF, retail gasoline and WTI all have live series and
 * none of them get a screen: an index level is not a fact about a life, and a
 * second crude benchmark teaches nothing the first did not. Currency readings
 * appear only when their own move clears the materiality threshold.
 */

/** How many observations back a daily series looks when reporting "what
 *  changed". Roughly a trading month, and short enough that the window's own
 *  date labels stay recognisable. */
const DAILY_WINDOW = 30;

/** A monthly series steps a month at a time; twelve steps is a year. */
const MONTH = 1;
const YEAR = 12;

/** The day's movement analysis, keyed by indicator id. `/api/analysis.json`. */
export type AnalysisById = ReadonlyMap<string, IndicatorAnalysis>;

/**
 * What goes under the chart.
 *
 * The desk writes two paragraphs for every instrument and they answer
 * different questions. `standing` says what the thing is — timeless, written
 * once, and the only thing these cards used to carry. `recent` says what has
 * happened to it and why, rewritten each day against the fortnight's coverage.
 * A reader looking at a chart that just moved asked the second question, so
 * that is what a card leads with.
 *
 * The definition is the fallback, not the alternative: four of ninety-odd
 * instruments carry no `recent` on any given day, and a build older than
 * `/api/analysis.json` carries none at all. Both cases land back on exactly
 * the card this app shipped before. Neither string is composed here — the app
 * does not editorialise over the desk.
 */
function whyFor(
  analysis: AnalysisById,
  id: string,
  indicator: Pick<Indicator, 'standing'>,
): string | undefined {
  return analysis.get(id)?.recent?.trim() || indicator.standing?.trim() || undefined;
}

const byId = (snapshot: TrendsSnapshot, id: string): Indicator | undefined =>
  snapshot.indicators.find((i) => i.id === id);

/** The pipeline writes units the way a data column does — `$/bbl`, `$/mt`. A
 *  card is read aloud, so the denominator becomes English and the currency mark
 *  moves to the front of the number where a reader expects it. */
const DENOMINATOR: Record<string, string> = {
  '/bbl': 'a barrel',
  '/mt': 'a tonne',
  '/oz': 'an ounce',
  '/gal': 'a gallon',
  '/MMBtu': 'per million BTU',
};

/**
 * The caption above a card's chart.
 *
 * `TrendBlock` always renders its `label`, and on a card the obvious label —
 * the subject — is already the card's title two lines above it. Repeating it
 * costs a line of a screen the card is fighting to fit inside and tells the
 * reader nothing. So the chart says what the axis measures instead, which is
 * the one thing the title does not.
 */
function axisCaption(unit: string | undefined, fallback: string): string {
  if (!unit) return fallback;
  if (unit === '%') return 'per cent';
  if (unit.startsWith('$')) {
    const per = unit.slice(1);
    return per ? `dollars ${DENOMINATOR[per] ?? per.slice(1)}` : 'dollars';
  }
  return unit;
}

function money(value: number, unit?: string): { reading: string; note?: string } {
  const formatted = formatReading(value, unit);
  if (!unit) return { reading: formatted };
  if (unit === '%') return { reading: `${formatted}%` };
  if (unit.startsWith('$')) {
    const per = unit.slice(1);
    return { reading: `$${formatted}`, note: per ? (DENOMINATOR[per] ?? per.slice(1)) : undefined };
  }
  return { reading: formatted, note: unit };
}

/**
 * The move, as the chip under the reading.
 *
 * This used to be a sentence — "−5.2% since 22 Jul." — sitting where part
 * three goes. A percentage and a date is not prose and gains nothing from
 * being set as prose; it gains a line of a screen the card is fighting to fit
 * inside, and it loses the one thing it should have, which is being visible
 * without being read. A daily series holds observations rather than calendar
 * days, so the window is still named from the period labels and never as
 * "month on month".
 */
function dailyDelta(indicator: Indicator, riseMeans: RiseMeans): CardDelta | undefined {
  return deltaFrom(windowChange(indicator, DAILY_WINDOW), riseMeans);
}

function monthlyDelta(indicator: Indicator, riseMeans: RiseMeans): CardDelta | undefined {
  return deltaFrom(windowChange(indicator, MONTH), riseMeans, { window: 'on the month' });
}

/** The year, once the chip has taken the month. Two windows are worth having
 *  on a monthly series — a grain that is flat this month and a fifth cheaper
 *  than last year is two different facts — but only one of them fits in the
 *  chip. */
function describeYearChange(indicator: Indicator): string | undefined {
  const yoy = windowChange(indicator, YEAR);
  if (!yoy) return undefined;
  const signed = formatSignedPct(yoy.pct);
  return signed === 'unchanged' ? 'Unchanged against a year ago.' : `${signed} against a year ago.`;
}

// ---------------------------------------------------------------------------
// Two staples
// ---------------------------------------------------------------------------

/**
 * Wheat and rice on one axis. They share a unit, so the comparison is honest,
 * and the comparison is the whole card: over the two years the snapshot holds,
 * the two grains that feed most of the world have gone opposite ways. Neither
 * price alone says that.
 */
function staplesCard(
  snapshot: TrendsSnapshot,
  analysis: AnalysisById,
  articles: Article[],
): ReadingCard | null {
  const wheat = byId(snapshot, 'wheat');
  const rice = byId(snapshot, 'rice');
  if (!wheat || !rice) return null;
  const wheatNow = latestOf(wheat);
  const riceNow = latestOf(rice);
  if (wheatNow == null || riceNow == null) return null;
  if (wheat.periods.length !== rice.periods.length) return null;

  const wheatSpan = windowChange(wheat, wheat.values.length - 1);
  const riceSpan = windowChange(rice, rice.values.length - 1);

  // One sentence, not two. The month-on-month read was true and made the card
  // overflow its screen, which under the earning-a-screen rule is the same as
  // not being worth it: the divergence is the fact here, and the chart is
  // already showing the shape of it.
  const changed =
    wheatSpan && riceSpan
      ? `Since ${wheatSpan.from}, wheat ${formatSignedPct(wheatSpan.pct)} and rice ${formatSignedPct(riceSpan.pct)}.`
      : describeYearChange(wheat);

  // The reading is the ratio, not either price. The two lines and their legend
  // already identify the components, while the movement sentence gives their
  // individual direction. Separate price rows repeated that same comparison
  // and crowded the analysis off the page. The ratio is the carryable fact:
  // "rice costs twice what wheat does."
  const ratio = riceNow / wheatNow;

  // The chip measures the ratio, because the ratio is the reading. It carries
  // no valence: the gap between two grains narrowing is not good or bad for
  // anyone, while the sentence retains the two directions that do reach a
  // shopping bill.
  const ratioSeries = wheat.values.map((w, i) => {
    const r = rice.values[i];
    return typeof r === 'number' && typeof w === 'number' && w !== 0 ? r / w : Number.NaN;
  });
  const delta = deltaFrom(
    windowChange({ values: ratioSeries, periods: wheat.periods }, ratioSeries.length - 1),
    null,
  );

  return {
    id: 'staples',
    kind: 'reading',
    kicker: 'staples',
    asOf: oldestObservation(
      indicatorObservation(wheat, snapshot.asOf),
      indicatorObservation(rice, snapshot.asOf),
    ),
    title: 'Wheat and rice',
    reading: `${ratio.toFixed(1)}×`,
    readingNote: 'rice against wheat',
    delta,
    changed,
    why: whyFor(analysis, wheat.id, wheat),
    series: {
      values: wheat.values,
      periods: wheat.periods,
      label: axisCaption(wheat.unit, 'dollars a tonne'),
      unit: wheat.unit,
      multi: [
        { values: wheat.values, label: 'wheat', highlight: 'last' },
        { values: rice.values, label: 'rice', highlight: 'last' },
      ],
    },
    related: relatedForTags(articles, [...(wheat.topicTags ?? []), ...(rice.topicTags ?? [])]),
    sourceLabel: wheat.sourceLabel,
  };
}

// ---------------------------------------------------------------------------
// A single indicator, as a reading
// ---------------------------------------------------------------------------

/** A live indicator with its pipeline analysis. Hand-written copy stays out of
 * the graph-card path: the section gate requires a `why`, and `whyFor` will
 * only ever hand it something the desk wrote. */
function indicatorCard(
  snapshot: TrendsSnapshot,
  analysis: AnalysisById,
  articles: Article[],
  id: string,
  kicker: string,
): ReadingCard | null {
  const indicator = byId(snapshot, id);
  if (!indicator) return null;
  const value = latestOf(indicator);
  if (value == null) return null;
  const monthly = indicator.cadence === 'monthly';
  // Not an argument. What a rise in a published series does to a reader is a
  // property of the series, not of the card showing it, and while it was an
  // argument the sheet this card opens answered it differently.
  const riseMeans = riseMeansFor(indicator);
  const { reading, note } = money(value, indicator.unit);
  return {
    id,
    kind: 'reading',
    kicker,
    asOf: indicatorObservation(indicator, snapshot.asOf),
    title: indicator.label,
    reading,
    readingNote: note,
    delta: monthly ? monthlyDelta(indicator, riseMeans) : dailyDelta(indicator, riseMeans),
    // A daily series has said everything it has to say in the chip; only a
    // monthly one has a second window worth a sentence.
    changed: monthly ? describeYearChange(indicator) : undefined,
    why: whyFor(analysis, indicator.id, indicator),
    series: {
      values: indicator.values,
      periods: indicator.periods,
      label: axisCaption(indicator.unit, indicator.label),
      unit: indicator.unit,
      highlight: indicator.defaultHighlight ?? 'last',
    },
    related: relatedForTags(articles, indicator.topicTags),
    sourceLabel: indicator.sourceLabel,
  };
}

// ---------------------------------------------------------------------------
// Nisab
// ---------------------------------------------------------------------------

/**
 * The threshold above which zakat falls due, in dollars, today.
 *
 * Two prices the app already downloads become one number nobody else is
 * publishing for this reader. It commits the app to a position — the majority
 * one, that the lower of the two classical weights binds — and the card says
 * so on its face rather than presenting the result as arithmetic without a
 * madhhab. That is the same commitment the prayer curves make to Umm al-Qura.
 */
function nisabCard(snapshot: TrendsSnapshot, analysis: AnalysisById): ReadingCard | null {
  const gold = byId(snapshot, 'paxg');
  const silver = byId(snapshot, 'xag');
  if (!gold || !silver) return null;
  const goldPrice = latestOf(gold);
  const silverPrice = latestOf(silver);
  if (goldPrice == null || silverPrice == null) return null;
  const n = nisab(goldPrice, silverPrice);
  if (!n) return null;

  const bindingIndicator = n.binding === 'silver' ? silver : gold;
  const move = windowChange(bindingIndicator, DAILY_WINDOW);
  // The chip moves with the threshold, and the threshold moves with the metal
  // that sets it — so it is the same arrow for both, which is what makes the
  // sentence below land. No valence: a lower nisab catches more wealth, and
  // whether that is good news is not the app's call to make.
  const delta = deltaFrom(move, null);
  /** "Silver (Kinesis)" is a data label; a sentence says "silver". */
  const metalName = (bindingIndicator.label.split(' (')[0] ?? n.binding).toLowerCase();
  // The counter-intuitive part, and the only half the chip cannot show: a
  // metal falling *lowers* the bar, so more wealth is zakatable. The
  // percentage itself is now in the chip and is not repeated here.
  const changed = move
    ? `The threshold ${move.pct < 0 ? 'fell' : move.pct > 0 ? 'rose' : 'held'} with ${metalName} — ${move.pct < 0 ? 'more' : 'less'} wealth is zakatable than a month ago.`
    : undefined;

  return {
    id: 'nisab',
    kind: 'reading',
    kicker: 'zakat',
    asOf: oldestObservation(
      indicatorObservation(gold, snapshot.asOf),
      indicatorObservation(silver, snapshot.asOf),
    ),
    title: 'Nisab threshold',
    reading: `$${formatCount(n.threshold)}`,
    readingNote: `set by ${n.binding}`,
    delta,
    changed,
    // The binding metal's, because that is the line this card draws and the
    // number it prints. Until this card carried any analysis at all it was
    // built and then silently dropped by `hasGraphAndAnalysis`, which is how
    // the card this column is documented as opening with never opened it.
    why: whyFor(analysis, bindingIndicator.id, bindingIndicator),
    figures: [
      {
        label: 'gold · 85 g',
        value: `$${formatCount(n.gold)}`,
        note: `at $${formatReading(goldPrice)}/oz`,
      },
      {
        label: 'silver · 595 g',
        value: `$${formatCount(n.silver)}`,
        note: `at $${formatReading(silverPrice)}/oz`,
      },
    ],
    series: {
      values: bindingIndicator.values,
      periods: bindingIndicator.periods,
      label: `${bindingIndicator.label.split(' (')[0]}, ${axisCaption(bindingIndicator.unit, 'dollars an ounce')}`,
      unit: bindingIndicator.unit,
      highlight: 'last',
    },
    sourceLabel: bindingIndicator.sourceLabel,
  };
}

// ---------------------------------------------------------------------------
// Metals, beside the threshold they set
// ---------------------------------------------------------------------------

/**
 * Gold and silver on one axis.
 *
 * They share a unit and they are the two metals the nisab is defined in, so
 * the pair is the honest way to show them: what matters is not either price
 * but which of the two is currently the cheaper — because that is the one
 * setting the threshold on the card that opens this column.
 *
 * It sits last there. The gold-to-silver ratio is the oldest price still
 * quoted and it is a curiosity, not a thing to check on a Tuesday; the two
 * prices that actually reach a reader are already figures on the nisab card.
 * (This comment used to say "the next card", which had the order backwards
 * even before the columns were re-cut.)
 */
function metalsPairCard(
  snapshot: TrendsSnapshot,
  analysis: AnalysisById,
  articles: Article[],
): ReadingCard | null {
  const gold = byId(snapshot, 'paxg');
  const silver = byId(snapshot, 'xag');
  if (!gold || !silver) return null;
  const goldNow = latestOf(gold);
  const silverNow = latestOf(silver);
  if (goldNow == null || silverNow == null) return null;
  if (gold.periods.length !== silver.periods.length) return null;

  const ratio = goldNow / silverNow;
  const goldMove = windowChange(gold, DAILY_WINDOW);
  const silverMove = windowChange(silver, DAILY_WINDOW);

  // The ratio's own move, with no valence — the oldest price in finance is not
  // good or bad news, it is a reading of how the two metals are being held
  // against each other.
  const ratioSeries = gold.values.map((g, i) => {
    const sv = silver.values[i];
    return typeof sv === 'number' && typeof g === 'number' && sv !== 0 ? g / sv : Number.NaN;
  });
  const delta = deltaFrom(
    windowChange({ values: ratioSeries, periods: gold.periods }, DAILY_WINDOW),
    null,
  );

  return {
    id: 'metals',
    kind: 'reading',
    kicker: 'metal',
    asOf: oldestObservation(
      indicatorObservation(gold, snapshot.asOf),
      indicatorObservation(silver, snapshot.asOf),
    ),
    title: 'Gold against silver',
    // The ratio, not either price. The relationship is the thing neither raw
    // quote says alone, and removing those duplicate rows gives the day's
    // explanation enough room. It is also the oldest price in finance still
    // quoted: how many ounces of silver buy one of gold.
    reading: `${Math.round(ratio)}:1`,
    readingNote: 'ounces of silver to one of gold',
    delta,
    changed:
      goldMove && silverMove
        ? `Since ${goldMove.from}, gold ${formatSignedPct(goldMove.pct)} and silver ${formatSignedPct(silverMove.pct)}.`
        : undefined,
    why: whyFor(analysis, gold.id, gold),
    series: {
      values: ratioSeries,
      periods: gold.periods,
      label: 'ounces of silver to one of gold',
      highlight: 'last',
    },
    related: relatedForTags(articles, [...(gold.topicTags ?? []), ...(silver.topicTags ?? [])]),
    sourceLabel: gold.sourceLabel,
  };
}

/**
 * The currency's move, from the rate's.
 *
 * The rate is quoted the way the market quotes it — rupees per dollar — and in
 * that direction *up is your money buying less*. Printed straight, the table
 * read "+5.6%" in rose beside "−0.8%" in sage, and a plus sign coloured as bad
 * news is a card arguing with itself. No caption fixes that; a reader does not
 * re-derive the denominator, they read the sign.
 *
 * So the row reports what the currency did instead of what its rate did, which
 * is also the question they came with. It is the exact reciprocal, not a
 * negated percentage: a rate up 5.6% is a currency down 5.3%, and the two are
 * only equal for very small moves.
 *
 * The counter-intuitive sentence part two used to spend three lines on ("a
 * rising number means it weakened") goes with it, because there is no longer
 * anything counter-intuitive to explain.
 */
function currencyMove(ratePct: number): number {
  const p = ratePct / 100;
  return (1 / (1 + p) - 1) * 100;
}

/**
 * How far a currency has to move in a month before it is a card rather than a
 * row. Against the live set, 2.5% picks the rand, the ruble, the peso, the yen
 * and the euro out of fifteen — the ones a reader holding them would already
 * have noticed — and leaves the rupee and the yuan, which did not move, in the
 * table where they belong.
 */
const FX_MOVER_THRESHOLD = 2.5;

/**
 * The euro, the yen and the yuan — the currencies a reader is most likely to
 * hold, price against, or be paid in, and the ones this basket's other twelve
 * are usually quoted beside.
 *
 * They exist as a separate slot because a single threshold across a basket
 * holding both the Lebanese pound and the euro is not one rule, it is a rule
 * for volatile currencies that silently excludes stable ones. Measured over
 * twelve consecutive snapshots the euro never once reached the deck — and
 * lowering the bar to 1.2% did not change that, because the two slots were
 * always taken by something larger. The euro was not failing a threshold; it
 * was structurally unreachable, which no threshold could fix.
 */
const FX_MAJORS = ['fx-eur', 'fx-jpy', 'fx-cny'];

/**
 * What a major has to do to take the second slot.
 *
 * Lower than `FX_MOVER_THRESHOLD` because the two slots answer different
 * questions — "what moved most anywhere" and "what did the euro and yen do" —
 * and 1% in a month is a real move in a currency that mostly does not make
 * them. Measured across twelve snapshots: a major card on nine of twelve days,
 * which is a slot that earns itself rather than one that fills.
 */
const FX_MAJOR_THRESHOLD = 1.0;

/**
 * The currencies that actually moved, one screen each.
 *
 * A rate on its own still compares to nothing. That does not hold for a
 * *move*: a currency 5% weaker against the dollar
 * in a month has repriced every import its country buys, and that is a fact
 * about a life rather than a number on a table.
 *
 * Two slots, and they are two different questions rather than first and second
 * place. The first is the largest move anywhere in the basket. The second is
 * the largest move among the majors, which is the only way the euro or the yen
 * ever reaches a screen: ranked purely by size they sit behind the Egyptian
 * pound and the ruble every single day, and measured over twelve snapshots the
 * euro appeared **zero** times — at a 2.5% bar, and still zero at 1.2%.
 *
 * Rejected on the evidence: ranking by *unusual* movement instead of size.
 * Three forms were measured against these snapshots and each promoted noise
 * over consequence. A z-score against daily volatility hands every day to the
 * lira, whose crawling peg has tiny daily noise and a steady monthly slide —
 * it scores trendiness, not surprise. Detrending and acceleration both surface
 * sub-1% wobbles, and on the two days the ruble ran to +8.2% — the largest FX
 * story in the set, with a fuel-crisis narrative attached — both displaced it
 * with the rand at −0.8%. Consequence scales with the size of the move, which
 * is what this deck is for.
 */
function fxMoverCards(
  snapshot: TrendsSnapshot,
  analysis: AnalysisById,
  articles: Article[],
): ReadingCard[] {
  const rows = snapshot.indicators
    .filter((i) => i.source === 'oer')
    .map((indicator) => {
      const change = windowChange(indicator, indicator.values.length - 1);
      const value = latestOf(indicator);
      if (!change || value == null) return null;
      return { indicator, change, value };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => Math.abs(b.change.pct) - Math.abs(a.change.pct));

  const mover = rows.find((r) => Math.abs(r.change.pct) >= FX_MOVER_THRESHOLD);
  const major = rows.find(
    (r) =>
      FX_MAJORS.includes(r.indicator.id) &&
      r.indicator.id !== mover?.indicator.id &&
      Math.abs(r.change.pct) >= FX_MAJOR_THRESHOLD,
  );

  return [mover, major]
    .filter((x): x is NonNullable<typeof x> => x !== undefined)
    .map(({ indicator, change, value }) => {
      const isMajor = indicator.id !== mover?.indicator.id;
      // The unit arrives as a data column — "ZAR / USD" — and the card reads
      // it aloud: how many of these one dollar buys.
      const code = indicator.unit?.split(' / ')[0] ?? '';
      const weakened = change.pct > 0;
      return {
        id: `${indicator.id}-mover`,
        kind: 'reading' as const,
        kicker: 'currency',
        asOf: indicatorObservation(indicator, snapshot.asOf),
        title: indicator.label,
        reading: formatReading(value),
        readingNote: code ? `${code} to the dollar` : 'to the dollar',
        // The chip reports the currency, matching the table on the card
        // before it — and it says the word. A caret pointing down beside a
        // reading of 83 rubles to the dollar is only unambiguous once
        // something on the line names what fell, and "weaker since Jul 24"
        // is three words that make the rate and the move stop contradicting
        // each other.
        delta: deltaFrom(
          { ...change, pct: currencyMove(change.pct) },
          // Applied to the currency's direction now, so a fall is the bad one.
          // A literal rather than `riseMeansFor`, for the reason the table on
          // the card before this one gives: the quoted quantity is inverted.
          'favorable',
          { window: `${weakened ? 'weaker' : 'stronger'} since ${change.from}` },
        ),
        // The sentence says which slot this is, because "the largest move in the
        // basket" and "the largest move among the majors" are different claims
        // and a card that makes the wrong one is telling the reader something
        // untrue about a number they can check.
        changed: isMajor
          ? `Largest monthly ${weakened ? 'fall' : 'rise'} among the euro, yen and yuan, measured to ${change.to}.`
          : `Largest monthly ${weakened ? 'fall' : 'rise'} in this 15-currency set, measured to ${change.to}.`,
        why: whyFor(analysis, indicator.id, indicator),
        series: {
          values: indicator.values,
          periods: indicator.periods,
          label: indicator.unit ?? 'per US dollar',
          unit: indicator.unit,
          highlight: 'last' as const,
        },
        related: relatedForTags(articles, indicator.topicTags),
        sourceLabel: indicator.sourceLabel,
      };
    });
}

// ---------------------------------------------------------------------------
// Straits
// ---------------------------------------------------------------------------

/**
 * The same rule the indicator cards use, down one more rung.
 *
 * A strait's `standing` is *always* its catalog blurb — `narrate-indicators.js`
 * prefers the hand-written sentence and discards the model's — so the two
 * fields the other cards choose between are one field here, and the choice is
 * really between the day's analysis and the catalog.
 *
 * The blurb is the last rung rather than no rung. It reads as a duplicate of
 * part two, which it was when part two carried it; part two is the 90-day
 * normal now and the blurb appears nowhere else on a card. Without it a strait
 * whose `recent` came back empty — Suez, on the current dispatch — is built,
 * dropped by `hasGraphAndAnalysis`, and silently absent from the deck.
 */
function straitWhy(c: Chokepoint): string | undefined {
  const standing = c.standing?.trim();
  const blurb = c.blurb?.trim();
  return c.recent?.trim() || (standing !== blurb ? standing : undefined) || blurb || undefined;
}

/** A strait this far from its own 90-day normal is disrupted rather than
 *  merely quiet. Below it, day-to-day variation in eleven busy waterways would
 *  paint the whole list rose and the colour would stop meaning anything. */
/** The distance from a strait's own 90-day normal, as a chip. The valence is
 *  one-sided and `chokepointValence` says why; `ChokepointSheet` reads the
 *  same function, so the sheet a strait card opens can no longer call the same
 *  strait quiet while the card calls it disrupted. */
function straitDelta(d: number): CardDelta | undefined {
  const magnitude = formatMagnitudePct(d * 100);
  const window = 'vs its 90-day normal';
  if (magnitude === null)
    return { direction: 'flat', magnitude: 'at its normal', window, valence: 'neutral' };
  return {
    direction: d > 0 ? 'up' : 'down',
    magnitude,
    window,
    valence: chokepointValence(d),
  };
}

function totalTrafficDelta(c: Chokepoint): number | null {
  const d = c.delta7vs90.n_total;
  return typeof d === 'number' && Number.isFinite(d) ? d : null;
}

/** Total traffic is noisier than a strait's selected vessel subtype. A 10–15%
 * weekly deviation is ordinary in the live payload; 30% is where an all-ships
 * chart earns a full screen. */
const TOTAL_TRAFFIC_DISRUPTED = 0.3;

/** Smooth noisy daily ship counts into the same seven-day measure used by the
 * headline and delta. Short fixture/partial series remain usable. */
function trailingSevenDayAverage(values: number[]): number[] {
  if (values.length < 7) return values;
  const averaged: number[] = [];
  for (let end = 6; end < values.length; end += 1) {
    let total = 0;
    for (let i = end - 6; i <= end; i += 1) total += values[i] ?? 0;
    averaged.push(Math.round(total / 7));
  }
  return averaged;
}

/**
 * The prediction market about this strait, if the desk is carrying one.
 *
 * Two decks were holding half a story each. `shipping` charts what traffic
 * through Bab el-Mandeb has actually done; `outlook` prices whether it is
 * effectively closed by December. Those are the measurement and the forecast of
 * one subject, and a reader who saw either alone had no way to know the other
 * existed — the app does not cross-reference its own columns.
 *
 * Matched on the strait's name appearing in the question, which is
 * deterministic and needs no model: Polymarket titles name their subject
 * plainly ("Bab el-Mandeb Strait effectively closed by...?"). The strait's `id`
 * is the fallback because it is the hyphenated form of that same name. A miss
 * costs the figure, never the card.
 *
 * These questions only reach the payload at all since the Polymarket filter was
 * fixed — the keyword allow-list it replaced was dropping every strait market
 * for not having "hormuz" among its words.
 */
function straitOdds(
  snapshot: TrendsSnapshot,
  c: Chokepoint,
): { label: string; value: string } | undefined {
  const norm = (x: string) =>
    x
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const name = norm(c.name)
    .replace(/\b(strait|canal|of|the)\b/g, '')
    .trim();
  const idWords = norm(c.id.replace(/-/g, ' '));
  if (name.length < 4 && idWords.length < 4) return undefined;

  for (const ind of snapshot.indicators) {
    if (ind.source !== 'polymarket') continue;
    const hay = norm(ind.label ?? '');
    if (!hay.includes(name) && !hay.includes(idWords)) continue;
    const pct = latestOf(ind);
    if (pct == null) continue;
    return { label: ind.label ?? 'priced', value: `${Math.round(pct)}%` };
  }
  return undefined;
}

/**
 * One graph per strait. The section is a reference deck on ordinary days, so
 * every strait with a usable total-traffic history remains available. A fall
 * of at least 30% against its own 90-day normal earns `current`; smaller moves
 * stay neutral reference rather than being promoted as news. Smart ranking
 * later combines that mark with live-story relevance and unusual movement.
 */
function straitCards(
  chokepoints: Chokepoint[],
  snapshot: TrendsSnapshot,
  now: Date,
): ReadingCard[] {
  const ranked = chokepoints
    .map((c) => ({ c, d: totalTrafficDelta(c) }))
    .filter((x): x is { c: Chokepoint; d: number } => x.d !== null)
    .filter(
      ({ c }) =>
        typeof c.last7Avg.n_total === 'number' &&
        Number.isFinite(c.last7Avg.n_total) &&
        c.series.total.length >= 2 &&
        c.series.total.length === c.series.periods.length,
    )
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  return ranked.map(({ c, d }) => {
    const last7 = c.last7Avg.n_total;
    const base = c.baseline90Avg.n_total;
    const traffic = trailingSevenDayAverage(c.series.total);
    const periods = c.series.periods.slice(c.series.periods.length - traffic.length);
    // The payload's published seven-day reading is authoritative. Using it at
    // the endpoint prevents the headline and graph from reporting different
    // quantities. Preserve its precision: rounding only the chart made a
    // headline of 0.1 ships a day terminate at 0 on the graph.
    if (traffic.length > 0 && last7 != null) traffic[traffic.length - 1] = last7;
    const odds = straitOdds(snapshot, c);
    return {
      id: `strait-${c.id}`,
      kind: 'reading' as const,
      // A large fall in an old observation remains important reference, but
      // it is not a current development. The date still appears on every card.
      lead: d <= -TOTAL_TRAFFIC_DISRUPTED && isCurrentObservation(c.asOf, now),
      asOf: c.asOf,
      title: c.name,
      reading: last7 == null ? '—' : formatQuantity(last7),
      readingNote: 'ships a day',
      delta: straitDelta(d),
      changed:
        base != null ? `Its own 90-day normal is ${formatQuantity(base)} ships a day.` : undefined,
      why: straitWhy(c),
      // The forecast beside the measurement. A figure rather than a second
      // chart: the card's subject is the traffic and its history, and the odds
      // are one number that says what the market thinks happens next.
      figures: odds ? [{ label: odds.label, value: odds.value }] : undefined,
      series: {
        values: traffic,
        periods,
        label: 'seven-day average, all ships',
        unit: 'a day',
        highlight: 'last' as const,
      },
      related: c.relatedArticles,
      sourceLabel: odds ? 'IMF PortWatch · Polymarket' : 'IMF PortWatch',
    };
  });
}

/*
 * `straitsCard` — eleven straits as one comparison table — was deleted here.
 *
 * It was a good card in the wrong medium. The globe on `news` already draws
 * all eleven as ambient rings, positions them where they actually are, and
 * opens `ChokepointSheet` on a tap — which carries the blurb, the standing
 * paragraph, what is happening there now, the weather and the full series.
 * A flat table of the same eleven names, sorted, was a worse version of a
 * thing the reader could already touch, and it cost a whole screen in a
 * column that has to earn every one.
 *
 * Recover it from git if a surface ever needs it without a globe nearby.
 */

// ---------------------------------------------------------------------------
// Beliefs
// ---------------------------------------------------------------------------

/**
 * A prediction contract is not a forecast and not a measurement. It is what
 * people are willing to stake, which is a different and more honest thing —
 * and it is only worth a screen because the card can say that out loud.
 */
const SLUG_CAPITALIZATION: Record<string, string> = {
  fed: 'Fed',
  us: 'US',
  brazilian: 'Brazilian',
  russian: 'Russian',
  january: 'January',
  february: 'February',
  march: 'March',
  april: 'April',
  may: 'May',
  june: 'June',
  july: 'July',
  august: 'August',
  september: 'September',
  october: 'October',
  november: 'November',
  december: 'December',
};

/** The compact pipeline label may end in a literal ellipsis. Its stable
 * market slug still carries the omitted words, so restore them rather than
 * presenting an incomplete question as deliberate UI truncation. */
function completeBeliefTitle(indicator: Indicator): string {
  const head = indicator.label.replace(/…\??$/, '').trim();
  if (head === indicator.label || !indicator.seriesId) return indicator.label;

  const slugWords = indicator.seriesId.split('-').filter(Boolean);
  if (/^\d{2,}$/.test(slugWords.at(-1) ?? '')) slugWords.pop();
  const headWords = head
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/\s+/);

  for (let length = Math.min(6, headWords.length); length >= 2; length -= 1) {
    const tail = headWords.slice(-length);
    const start = slugWords.findIndex((_, index) =>
      tail.every((word, offset) => slugWords[index + offset] === word),
    );
    if (start < 0) continue;
    const rest = slugWords.slice(start + length);
    if (rest.length === 0) break;
    const suffix = rest.map((word) => SLUG_CAPITALIZATION[word] ?? word).join(' ');
    return `${head} ${suffix}?`;
  }

  return indicator.label;
}

function beliefCards(
  snapshot: TrendsSnapshot,
  analysis: AnalysisById,
  articles: Article[],
): BeliefCard[] {
  return snapshot.indicators
    .filter((i) => i.source === 'polymarket')
    .map((indicator) => {
      const value = latestOf(indicator);
      if (value == null) return null;
      const extremes = seriesExtremes(indicator);
      const change = windowPointChange(indicator, indicator.values.length - 1);
      const card: BeliefCard = {
        id: indicator.id,
        kind: 'belief',
        kicker: 'what traders think',
        asOf: indicatorObservation(indicator, snapshot.asOf),
        // The label arrives as a question and stays one. An earlier version
        // stripped the trailing "?" for tidiness, which turned the one mark
        // that tells a reader this is an open outcome rather than a
        // measurement into nothing.
        title: completeBeliefTitle(indicator),
        reading: `${Math.round(value)}%`,
        // No valence, and this is the clearest case for the rule: a contract
        // on a ceasefire holding and a contract on a candidate winning move
        // the same way on the screen, and the app has no business tinting
        // either of them green.
        delta: deltaFrom(change, null, { unit: 'points' }),
        // In points, never per cent: a contract going 26 → 86 moved 60 points,
        // and the chip says so. What is left for the sentence is the range,
        // which is the part that says how settled the belief is — a number
        // sitting at 88 having never been below 80 is a different fact from
        // one that got there from 30 last week.
        changed:
          extremes && extremes.max - extremes.min >= 1
            ? `Low ${Math.round(extremes.min)}% on ${extremes.minAt}; high ${Math.round(extremes.max)}% on ${extremes.maxAt}.`
            : undefined,
        why: whyFor(analysis, indicator.id, indicator),
        series: {
          values: indicator.values,
          periods: indicator.periods,
          label: 'chance priced, per cent',
          unit: '%',
          highlight: 'last',
        },
        related: relatedForTags(articles, indicator.topicTags),
        sourceLabel: indicator.sourceLabel,
        link: indicator.marketUrl,
      };
      return card;
    })
    .filter((c): c is BeliefCard => c !== null);
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Scheduled events
// ---------------------------------------------------------------------------

/** How far ahead the deck looks. Past this, "in 71 days" is a diary entry
 *  rather than a thing to know today, and the calendar would crowd out the
 *  live markets it sits beside. */
const EVENT_HORIZON_DAYS = 45;

/** How many make the deck. There are fifteen or so in the payload at any time
 *  and `outlook` is a column a reader swipes in a minute; the nearest few are
 *  the ones with anything at stake. */
const EVENT_LIMIT = 4;

/** Inside this, the date is the news. Matches `lead` elsewhere: the card is on
 *  screen because it is imminent, not because its subject is important. */
const EVENT_IMMINENT_DAYS = 3;

function daysUntil(iso: string, now: Date): number | null {
  const then = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(then)) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((then - today) / 86_400_000);
}

/** The distance, in the words a reader would use. This is the card's reading —
 *  the changing quantity on a piece that has no series. */
function countdown(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 14) return `in ${days} days`;
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}

/**
 * The dates the outlook column was missing.
 *
 * `trends.events` — central-bank decisions, OPEC+, major releases, elections —
 * has carried `standing` and `recent` from the events dispatch since that stage
 * existed, and the website's money rail has rendered them all along. The app
 * showed none of them, because the deck gate asks every card for a graph and a
 * scheduled date has no history. It has a distance instead, and that is the
 * reading here.
 *
 * A prediction market prices what happens; a calendar says when it is decided.
 * Putting them in one column is the point.
 */
/**
 * The series a scheduled event is about, by the institution that sets it.
 *
 * Keyed on `institution` rather than the event id because the id carries the
 * meeting date and there are three FOMC meetings in the window; the institution
 * is the stable half. Only the three with a current, honest series are here —
 * see `ScheduledCard.series` for why the Bank of England and the Bank of Japan
 * are deliberately absent rather than filled with the nearest proxy.
 */
const EVENT_SERIES: Record<string, string> = {
  'Federal Reserve': 'fed-funds',
  'European Central Bank': 'ecb-rate',
  'Bureau of Labor Statistics': 'us-unemployment',
};

function eventSeries(snapshot: TrendsSnapshot, institution: string): CardSeries | undefined {
  const id = EVENT_SERIES[institution];
  if (!id) return undefined;
  const ind = byId(snapshot, id);
  if (!ind || ind.values.filter(Number.isFinite).length < 2) return undefined;
  return {
    values: ind.values,
    periods: ind.periods,
    label: axisCaption(ind.unit, ind.label),
    unit: ind.unit,
    highlight: ind.defaultHighlight ?? 'last',
  };
}

function eventCards(snapshot: TrendsSnapshot, articles: Article[], now: Date): ScheduledCard[] {
  return (snapshot.events ?? [])
    .map((ev) => ({ ev, days: daysUntil(ev.date, now) }))
    .filter((x): x is { ev: TrendEvent; days: number } => x.days !== null && x.days >= 0)
    .filter(({ days }) => days <= EVENT_HORIZON_DAYS)
    .sort((a, b) => a.days - b.days)
    .slice(0, EVENT_LIMIT)
    .map(({ ev, days }) => ({
      id: `event-${ev.id}`,
      kind: 'scheduled' as const,
      date: ev.date,
      lead: days <= EVENT_IMMINENT_DAYS,
      kicker: ev.institution,
      title: ev.title,
      reading: countdown(days),
      readingNote: new Date(`${ev.date}T00:00:00Z`).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
      }),
      // Same rule as every other card: the day's account of what is at stake,
      // and the standing description of the institution where there is none.
      why: ev.recent?.trim() || ev.standing?.trim() || undefined,
      series: eventSeries(snapshot, ev.institution),
      related: ev.relatedArticles ?? relatedForTags(articles, ev.topicTags),
    }));
}

export interface InstrumentCardInputs {
  trends: TrendsSnapshot | null;
  chokepoints: Chokepoint[];
  /** The day's movement analysis, from `/api/analysis.json`. Empty is a
   *  supported state, not a loading one: every card falls back to its standing
   *  definition, which is the whole surface these cards had before. */
  analysis: AnalysisById;
  /** Today's feed, for the tie-to-the-news line. */
  articles: Article[];
  /** Injectable so the countdown on a scheduled card is testable. */
  now?: Date;
}

/** Instrument cards grouped by concrete payload subject before deck assembly. */
export interface InstrumentColumns {
  markets: Card[];
  straits: Card[];
  predictions: Card[];
  /** Dated events, merged into `outlook` beside the prediction markets. */
  scheduled: Card[];
}

const EMPTY_COLUMNS: InstrumentColumns = {
  scheduled: [],
  markets: [],
  straits: [],
  predictions: [],
};

/**
 * Build every instrument column.
 *
 * Order within a column is reading order, and each column opens with the card
 * that answers its own question most directly.
 *
 * Every card returns null rather than a placeholder when its data is missing
 * or its gate does not clear, so a quiet day yields shorter columns and never
 * a broken screen.
 */
export function buildInstrumentCards({
  trends,
  chokepoints,
  analysis,
  articles,
  now = new Date(),
}: InstrumentCardInputs): InstrumentColumns {
  if (!trends) return EMPTY_COLUMNS;
  const keep = (cards: (Card | null)[]): Card[] => cards.filter((c): c is Card => c !== null);

  return {
    markets: keep([
      nisabCard(trends, analysis),
      staplesCard(trends, analysis, articles),
      indicatorCard(trends, analysis, articles, 'brent', 'energy'),
      metalsPairCard(trends, analysis, articles),
      // The ten-year survives the cut that took the S&P and the NASDAQ with
      // it, on the rule that killed them: it can be explained in one sentence
      // to someone who has never met it, and it says something about an
      // ordinary life. An index *level* cannot do either.
      indicatorCard(trends, analysis, articles, 'us-10y', 'money'),
      indicatorCard(trends, analysis, articles, 'vix', 'volatility'),
      // Slate, from its absence in `RISE_MEANS`: bitcoin going up is good
      // news for whoever holds it and nothing at all to everyone else, and
      // an app that tints it sage has taken a position on whether you should.
      indicatorCard(trends, analysis, articles, 'btc', 'crypto'),
      indicatorCard(trends, analysis, articles, 'eth', 'crypto'),
      ...fxMoverCards(trends, analysis, articles),
    ]),

    straits: keep(straitCards(chokepoints, trends, now)),

    predictions: keep(beliefCards(trends, analysis, articles)),

    scheduled: keep(eventCards(trends, articles, now)),
  };
}
