import type { Article, Chokepoint, Indicator, TrendsSnapshot } from '@shared/types';
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
import type { BeliefCard, Card, CardDelta, ReadingCard } from './types';

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
function staplesCard(snapshot: TrendsSnapshot, articles: Article[]): ReadingCard | null {
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

  // The reading is the ratio, not either price. Both prices are already on the
  // card as figures, and foundation.md is explicit that information appears
  // exactly once — repeating the wheat price at display size would be the
  // same fact twice. The ratio is also the more repeatable one: "rice costs
  // twice what wheat does" is a sentence a reader can carry out of the app.
  const ratio = riceNow / wheatNow;

  // The chip measures the ratio, because the ratio is the reading. It carries
  // no valence: the gap between two grains narrowing is not good or bad for
  // anyone, and the two prices that *do* reach a shopping bill are in the
  // figures and the sentence.
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
    title: 'Wheat and rice',
    reading: `${ratio.toFixed(1)}×`,
    readingNote: 'rice against wheat',
    delta,
    changed,
    why: wheat.standing,
    figures: [
      { label: 'wheat', value: `$${formatReading(wheatNow)}` },
      { label: 'rice', value: `$${formatReading(riceNow)}` },
    ],
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

/** A live indicator with its pipeline analysis. Static definitions stay out
 * of the graph-card path: the section gate requires `standing` (`why`). */
function indicatorCard(
  snapshot: TrendsSnapshot,
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
    title: indicator.label,
    reading,
    readingNote: note,
    delta: monthly ? monthlyDelta(indicator, riseMeans) : dailyDelta(indicator, riseMeans),
    // A daily series has said everything it has to say in the chip; only a
    // monthly one has a second window worth a sentence.
    changed: monthly ? describeYearChange(indicator) : undefined,
    why: indicator.standing,
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
function nisabCard(snapshot: TrendsSnapshot): ReadingCard | null {
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
    title: 'Nisab today',
    reading: `$${formatCount(n.threshold)}`,
    readingNote: `set by ${n.binding}`,
    delta,
    changed,
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
function metalsPairCard(snapshot: TrendsSnapshot, articles: Article[]): ReadingCard | null {
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
    title: 'Gold against silver',
    // The ratio, not either price — both prices are figures below, and the
    // relationship is the thing neither of them says alone. It is also the
    // oldest price in finance still quoted: how many ounces of silver buy one
    // of gold.
    reading: `${Math.round(ratio)}:1`,
    readingNote: 'ounces of silver to one of gold',
    delta,
    changed:
      goldMove && silverMove
        ? `Since ${goldMove.from}, gold ${formatSignedPct(goldMove.pct)} and silver ${formatSignedPct(silverMove.pct)}.`
        : undefined,
    why: gold.standing,
    figures: [
      { label: 'gold', value: `$${formatReading(goldNow)}` },
      { label: 'silver', value: `$${formatReading(silverNow)}` },
    ],
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

/** Two, not five. The column is meant to be swiped through in a minute, and
 *  the third-largest move of the month is a row, not a screen. */
const FX_MOVER_LIMIT = 2;

/**
 * The currencies that actually moved, one screen each.
 *
 * A rate on its own still compares to nothing. That does not hold for a
 * *move*: a currency 5% weaker against the dollar
 * in a month has repriced every import its country buys, and that is a fact
 * about a life rather than a number on a table. The two strongest moves get
 * the treatment the news gets —
 * their own chart, their own standing paragraph, their own tie to today's
 * stories.
 */
function fxMoverCards(snapshot: TrendsSnapshot, articles: Article[]): ReadingCard[] {
  return snapshot.indicators
    .filter((i) => i.source === 'oer')
    .map((indicator) => {
      const change = windowChange(indicator, indicator.values.length - 1);
      const value = latestOf(indicator);
      if (!change || value == null) return null;
      if (Math.abs(change.pct) < FX_MOVER_THRESHOLD) return null;
      return { indicator, change, value };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => Math.abs(b.change.pct) - Math.abs(a.change.pct))
    .slice(0, FX_MOVER_LIMIT)
    .map(({ indicator, change, value }, rank) => {
      // The unit arrives as a data column — "ZAR / USD" — and the card reads
      // it aloud: how many of these one dollar buys.
      const code = indicator.unit?.split(' / ')[0] ?? '';
      const weakened = change.pct > 0;
      return {
        id: `${indicator.id}-mover`,
        kind: 'reading' as const,
        kicker: 'currency',
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
        // Ranked, not chosen — and the sentence says which rank, because "the
        // biggest move of the month" and "the second-biggest" are different
        // claims and only one of them is true of this card.
        changed: `${rank === 0 ? 'Largest' : 'Second-largest'} monthly ${weakened ? 'fall' : 'rise'} in this 15-currency set, measured to ${change.to}.`,
        why: indicator.standing,
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

/** `blurb` and `standing` are written by different stages and, for several of
 *  the eleven, land on the same sentence. Part two of the card already carries
 *  the blurb, so part four must not repeat it — a card that says the same thing
 *  twice reads as filler and foundation.md forbids it outright. */
function straitWhy(c: Chokepoint): string | undefined {
  const standing = c.standing?.trim();
  const blurb = c.blurb?.trim();
  const fresh = standing && standing !== blurb ? standing : undefined;
  return [fresh, c.recent?.trim()].filter(Boolean).join('\n\n') || undefined;
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
 * One graph per strait. The section is a reference deck on ordinary days, so
 * every strait with a usable total-traffic history remains available. A fall
 * of at least 30% against its own 90-day normal earns `current`; smaller moves
 * stay neutral reference rather than being promoted as news. Smart ranking
 * later combines that mark with live-story relevance and unusual movement.
 */
function straitCards(chokepoints: Chokepoint[]): ReadingCard[] {
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
    return {
      id: `strait-${c.id}`,
      kind: 'reading' as const,
      lead: d <= -TOTAL_TRAFFIC_DISRUPTED,
      title: c.name,
      reading: last7 == null ? '—' : formatQuantity(last7),
      readingNote: 'ships a day',
      delta: straitDelta(d),
      changed:
        base != null ? `Its own 90-day normal is ${formatQuantity(base)} ships a day.` : undefined,
      why: straitWhy(c),
      series: {
        values: traffic,
        periods,
        label: 'seven-day average, all ships',
        unit: 'a day',
        highlight: 'last' as const,
      },
      related: c.relatedArticles,
      sourceLabel: 'IMF PortWatch',
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

function beliefCards(snapshot: TrendsSnapshot, articles: Article[]): BeliefCard[] {
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
        why: indicator.standing,
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

export interface InstrumentCardInputs {
  trends: TrendsSnapshot | null;
  chokepoints: Chokepoint[];
  /** Today's feed, for the tie-to-the-news line. */
  articles: Article[];
}

/** Instrument cards grouped by concrete payload subject before deck assembly. */
export interface InstrumentColumns {
  markets: Card[];
  straits: Card[];
  predictions: Card[];
}

const EMPTY_COLUMNS: InstrumentColumns = {
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
  articles,
}: InstrumentCardInputs): InstrumentColumns {
  if (!trends) return EMPTY_COLUMNS;
  const keep = (cards: (Card | null)[]): Card[] => cards.filter((c): c is Card => c !== null);

  return {
    markets: keep([
      nisabCard(trends),
      staplesCard(trends, articles),
      indicatorCard(trends, articles, 'brent', 'energy'),
      metalsPairCard(trends, articles),
      // The ten-year survives the cut that took the S&P and the NASDAQ with
      // it, on the rule that killed them: it can be explained in one sentence
      // to someone who has never met it, and it says something about an
      // ordinary life. An index *level* cannot do either.
      indicatorCard(trends, articles, 'us-10y', 'money'),
      indicatorCard(trends, articles, 'vix', 'volatility'),
      // Slate, from its absence in `RISE_MEANS`: bitcoin going up is good
      // news for whoever holds it and nothing at all to everyone else, and
      // an app that tints it sage has taken a position on whether you should.
      indicatorCard(trends, articles, 'btc', 'crypto'),
      indicatorCard(trends, articles, 'eth', 'crypto'),
      ...fxMoverCards(trends, articles),
    ]),

    straits: keep(straitCards(chokepoints)),

    predictions: keep(beliefCards(trends, articles)),
  };
}
