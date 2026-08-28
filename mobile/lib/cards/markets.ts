import type {
  Article,
  Chokepoint,
  CompareRow,
  Indicator,
  TrendEvent,
  TrendsSnapshot,
} from '@shared/types';
import {
  CHOKEPOINT_DISRUPTED,
  chokepointValence,
  type RiseMeans,
  riseMeansFor,
  valenceOfChange,
} from '../valence';
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
import type { BeliefCard, Card, CardDelta, ConditionCard, ReadingCard } from './types';

/**
 * The instrument columns, no network call the app was not already making.
 * `trends.json` (50 indicators) and `chokepoints.json` (11 straits) are
 * fetched on every launch and, until now, one chart was drawn from the first
 * of them — in a sheet reached by tapping a word.
 *
 * Three columns rather than one, and they are cut by the question the reader
 * arrived with: `prices` (what things cost — the zakat threshold, the two
 * grains, crude, the two metals), `money` (what your money is worth and what
 * borrowing costs — fifteen currencies, the ten-year, the two coins) and
 * `outlook` (what is not yet a fact — prediction contracts, where curiosity
 * went, the price of insuring against a fall, what is already scheduled).
 *
 * It was five, split by asset class, and that split is what produced a
 * `markets` column holding food, energy, rates, shipping, Wikipedia pageviews
 * and a calendar beside three columns two cards deep. Asset class is how a
 * data provider files a series. It is not how anybody wakes up wondering
 * about one.
 *
 * What is *not* here is the point of the file. Thirty exchanges, the S&P, the
 * NASDAQ, TSMC, copper, TTF, retail gasoline and WTI all have live series and
 * none of them get a screen: an index level is not a fact about a life, and a
 * second crude benchmark teaches nothing the first did not. Fifteen currencies
 * are one card, because a rate on its own compares to nothing.
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
    whatItIs:
      'The two grains most of the world eats, at the world price an importing government pays — not the price in a shop.',
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

/**
 * Part two, but only when part four is not already doing its job.
 *
 * Part two and part four are written by different hands — this file and the
 * pipeline — and they were not "sometimes" colliding. They were colliding on
 * every reading card in the app:
 *
 *   brent    "The benchmark price for a barrel of crude…"
 *            "The price of a barrel of North Sea crude, and the benchmark…"
 *   us-10y   "What the United States pays to borrow for ten years…"
 *            "The yield on ten-year US government debt, the price at which
 *             Washington borrows for a decade…"
 *   vix      "…It rises when people are frightened, which is why it is called
 *             the fear index."
 *            "…It rises when investors pay up for protection, which is why it
 *             is read as a gauge of fear in US equities."
 *
 * The guard this replaces compared the first twenty-five characters, and all
 * three of those slipped past it by a word. The lesson is that a same-opening
 * test cannot catch a same-*meaning* collision, and no string heuristic
 * reliably will — so the rule is now structural rather than clever:
 * **`standing` is authoritative**, exactly as the header of `types.ts` already
 * said it was, and the sentence written here is the fallback for the two
 * indicators in fifty that have no `standing`. One definition per screen.
 */
function definitionUnlessStanding(
  whatItIs: string,
  standing: string | undefined,
): string | undefined {
  return standing?.trim() ? undefined : whatItIs;
}

function indicatorCard(
  snapshot: TrendsSnapshot,
  articles: Article[],
  id: string,
  kicker: string,
  whatItIs: string,
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
    whatItIs: definitionUnlessStanding(whatItIs, indicator.standing),
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
    whatItIs:
      'The wealth a person must hold for a lunar year before zakat falls due. It is defined by weight of metal, not by currency, so it moves with the metal price.',
    changed,
    why: `Two weights are reported: 85 grams of gold and 595 grams of silver. The majority position takes the lower of the two, so that more wealth is caught rather than less — which is why the cheaper metal sets the threshold, and today that is ${n.binding}. One stated method, not the only one.`,
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
    whatItIs:
      'The two metals wealth has been measured in for as long as it has been measured. The ratio between them is the oldest price still quoted.',
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
      values: gold.values,
      periods: gold.periods,
      label: axisCaption(gold.unit, 'dollars an ounce'),
      unit: gold.unit,
      multi: [
        { values: gold.values, label: 'gold', highlight: 'last' },
        { values: silver.values, label: 'silver', highlight: 'last' },
      ],
    },
    related: relatedForTags(articles, [...(gold.topicTags ?? []), ...(silver.topicTags ?? [])]),
    sourceLabel: gold.sourceLabel,
  };
}

// ---------------------------------------------------------------------------
// Fifteen currencies
// ---------------------------------------------------------------------------

/**
 * A single exchange rate compares to nothing — 276 rupees to the dollar is a
 * number, not news. Fifteen of them side by side is a reading of where
 * pressure is: today only three of the fifteen lost ground, which is the
 * opposite of what a reader who follows the ruble or the lira would guess.
 */
function currenciesCard(snapshot: TrendsSnapshot, articles: Article[]): Card | null {
  const fx = snapshot.indicators.filter((i) => i.source === 'oer');
  if (fx.length < 3) return null;

  const scored = fx
    .map((indicator) => {
      const change = windowChange(indicator, indicator.values.length - 1);
      return change ? { indicator, change } : null;
    })
    .filter(
      (x): x is { indicator: Indicator; change: NonNullable<ReturnType<typeof windowChange>> } =>
        x !== null,
    )
    .sort((a, b) => b.change.pct - a.change.pct);
  if (scored.length === 0) return null;

  const weakened = scored.filter((s) => s.change.pct > 0);
  const rows: CompareRow[] = scored.map(({ indicator, change }) => ({
    // The pipeline's label already reads as a currency name; the unit carries
    // the pairing ("PKR / USD"), so the row does not repeat it.
    label: indicator.label,
    value: formatSignedPct(currencyMove(change.pct)),
    // A rate rising means more local currency per dollar — the currency
    // weakened. The sign in the value is the direction; the tone says what
    // that direction means for someone holding it.
    //
    // Below the noise floor the row goes slate rather than sage or rose.
    // Fifteen rows are the one place in the app where the same thing is
    // measured the same way over the same window, so "did this move" is
    // answerable here in a way it is not for a chip on a single reading — and
    // a pound that moved a tenth of a per cent in a month painted the same
    // rose as a ruble that moved five and a half. That is the colour telling
    // the reader something untrue. Slate says it moved and it does not matter,
    // which is both true and a pill, so the table still scans as fifteen
    // measured currencies rather than nine findings and six gaps.
    //
    // The tone reads the quantity the row prints — the currency, not the rate
    // — so sign and colour say the same thing: a minus is rose, a plus is
    // sage. That is the point of quoting the currency rather than its rate,
    // and it is why this passes a literal instead of `riseMeansFor`, which
    // answers for the published series and would therefore be inverted here.
    tone:
      Math.abs(change.pct) < FX_NOISE_FLOOR
        ? 'neutral'
        : valenceOfChange(currencyMove(change.pct), 'favorable'),
    weight: Math.abs(change.pct),
    cc: indicator.countryTags?.[0],
  }));

  const window = scored[0]?.change;
  const first = scored[0];

  return {
    id: 'currencies',
    kind: 'comparison',
    kicker: 'currency',
    title: 'Against the dollar',
    reading: `${weakened.length} of ${scored.length}`,
    readingNote: 'weakened this month',
    // One sentence, and it is the one a reader cannot work out from the table.
    // The sentence that used to open this ("How much more, or less, of each
    // currency one US dollar bought over the last month") said what the title
    // and the column header already say twice over, and it cost three lines of
    // a card that has fifteen rows to fit. What survives is the part that is
    // genuinely counter-intuitive: the number going *up* is the bad direction.
    // One sentence, and it is the consequence rather than the definition. The
    // three lines this used to open with explained the denominator, which the
    // table no longer inverts and the reader therefore no longer needs.
    whatItIs:
      'What a month did to each currency against the dollar. A currency that lost ground pays more for imports, fuel and dollar debt at home.',
    changed:
      window && first
        ? `Measured since ${window.from}. ${first.indicator.label} moved furthest, ${formatSignedPct(currencyMove(first.change.pct))}.`
        : undefined,
    // No `why`. It used to borrow the standing paragraph of whichever
    // currency had moved most, which put "The Russian ruble's exchange rate
    // against the dollar…" underneath a card about all fifteen — and that
    // paragraph now has a card of its own directly below this one. Part two
    // already carries the mechanism this card is teaching (a rising number is
    // a weaker currency, and what that does to an import bill), so a fourth
    // part here would be a third explanation of the same thing.
    rows,
    rowsLabel: 'the currency, against the dollar',
    related: relatedForTags(
      articles,
      scored.flatMap(({ indicator }) => indicator.topicTags ?? []),
    ),
    sourceLabel: first?.indicator.sourceLabel,
  };
}

/** A month's move smaller than this is the rate ticking, not the currency
 *  moving, and a row that carries it in colour is overstating what happened. */
const FX_NOISE_FLOOR = 0.5;

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
 * The rule this file opens with — "a rate on its own compares to nothing" — is
 * why fifteen currencies are one comparison card, and it still holds for a
 * rate. It does not hold for a *move*: a currency 5% weaker against the dollar
 * in a month has repriced every import its country buys, and that is a fact
 * about a life rather than a number on a table. So the table stays, and the
 * two currencies whose rows are the news get the treatment the news gets —
 * their own chart, their own standing paragraph, their own tie to today's
 * stories.
 *
 * It is also what makes the column swipeable. `currencies` was a single card:
 * the vertical axis, which the whole app teaches you to use, dead-ended on the
 * first screen.
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
        whatItIs: definitionUnlessStanding(
          `How many ${indicator.label.toLowerCase()} one US dollar buys. A rising number means it weakened, so imports, fuel and dollar debt all cost more at home.`,
          indicator.standing,
        ),
        // Ranked, not chosen — and the sentence says which rank, because "the
        // biggest move of the month" and "the second-biggest" are different
        // claims and only one of them is true of this card.
        changed: `${weakened ? 'Weakened' : 'Strengthened'} ${rank === 0 ? 'further than any other currency the app follows' : 'more than all but one of the currencies the app follows'}, over the month to ${change.to}.`,
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

const VESSEL_LABEL: Record<string, string> = {
  n_total: 'ships',
  n_tanker: 'tankers',
  n_container: 'container ships',
  n_dry_bulk: 'dry-bulk carriers',
  n_cargo: 'cargo ships',
  n_general_cargo: 'general-cargo ships',
  n_roro: 'ro-ro ships',
};

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

function primaryDelta(c: Chokepoint): number | null {
  const d = c.delta7vs90[c.primaryField];
  return typeof d === 'number' && Number.isFinite(d) ? d : null;
}

/**
 * The one strait that has actually gone quiet — on the days one has.
 *
 * Ranked, not chosen: an editor picking the strait each morning would be
 * making a claim the data has already made. But ranking alone always returns
 * *something*, and for most of a year that something is a busy waterway three
 * per cent off its own average, which is weather. Shipped daily it was
 * furniture, and it was furniture twice over, because the globe on `news`
 * already draws all eleven as tappable rings and `ChokepointSheet` says more
 * about any of them than a card can.
 *
 * So the card is gated on `CHOKEPOINT_DISRUPTED` — the same threshold the
 * sheet and the row tones read, deliberately, because a strait that is
 * disrupted on a card and quiet in the sheet that card opens is the exact bug
 * `lib/valence.ts` was written to end. Nothing clears it, no card; one does,
 * and it leads `prices` carrying the `today` mark.
 *
 * The gate is one-sided for the reason the chip is: a strait above its own
 * normal is usually freight rerouted *to* it, which is the same disruption
 * seen from the other end, and the app names the squeeze rather than the
 * detour.
 *
 * A note on what this ranks by. Distance from a strait's own 90-day normal
 * lets a small waterway out-rank a consequential one — Kerch at 6 ships a day
 * can beat Hormuz, which carries a fifth of the world's oil. Ranking by
 * absolute shortfall instead is worse, not better: it surfaces Malacca three
 * per cent down (noise on a very large number) and drops Hormuz entirely, and
 * `Chokepoint` carries no share-of-trade field to weight by. The card says
 * exactly what it ranked on, and what it says is true.
 */
function straitMovedCard(chokepoints: Chokepoint[]): ReadingCard | null {
  const ranked = chokepoints
    .map((c) => ({ c, d: primaryDelta(c) }))
    .filter((x): x is { c: Chokepoint; d: number } => x.d !== null)
    .filter((x) => x.d <= -CHOKEPOINT_DISRUPTED)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  const top = ranked[0];
  if (!top) return null;

  const { c, d } = top;
  const last7 = c.last7Avg[c.primaryField];
  const base = c.baseline90Avg[c.primaryField];
  const vessels = VESSEL_LABEL[c.primaryField] ?? 'ships';
  // A strait running below its own normal is freight not moving — a blockade,
  // a war-risk premium, a closed canal — and that reaches an ordinary life as
  // the price of everything that had to sail. Above normal is traffic
  // rerouted *to* here, which is the same disruption seen from the other end,
  // so only the quiet side is coloured: the app names the squeeze, not the
  // detour.

  return {
    id: `strait-${c.id}`,
    kind: 'reading',
    // Gated on its own data, so it says so: this card is here because the
    // strait went quiet this week, not because straits matter in general.
    lead: true,
    kicker: 'chokepoint',
    title: c.name,
    reading: last7 == null ? '—' : formatQuantity(last7),
    readingNote: `${vessels} a day`,
    // Built by hand rather than through `deltaFrom`, because this one is not
    // symmetric and `riseMeans` can only describe a symmetric pair. Quiet is
    // coloured; busy is not. A strait above its own normal is usually traffic
    // that was rerouted *to* here, which is the same disruption seen from the
    // other end, and the app names the squeeze rather than the detour.
    delta: straitDelta(d),
    whatItIs: c.blurb,
    changed:
      base != null
        ? `Its own 90-day normal is ${formatQuantity(base)} a day. This is the furthest any of the eleven straits has moved from its baseline.`
        : undefined,
    why: straitWhy(c),
    series: {
      values: c.series.total,
      periods: c.series.periods,
      label: 'all ships a day',
      unit: 'a day',
      highlight: 'last',
    },
    related: c.relatedArticles,
    sourceLabel: 'IMF PortWatch',
  };
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
function beliefCards(snapshot: TrendsSnapshot, articles: Article[]): BeliefCard[] {
  return snapshot.indicators
    .filter((i) => i.source === 'polymarket')
    .map((indicator, position) => {
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
        title: indicator.label,
        reading: `${Math.round(value)}%`,
        readingNote: 'priced today',
        // No valence, and this is the clearest case for the rule: a contract
        // on a ceasefire holding and a contract on a candidate winning move
        // the same way on the screen, and the app has no business tinting
        // either of them green.
        delta: deltaFrom(change, null, { unit: 'points' }),
        // The first card teaches the instrument fully; later cards keep a
        // one-sentence version. Repeating the long paragraph becomes filler,
        // but omitting an explanation would fail the swipe-piece contract: a
        // reader may arrive at any card after a refresh reorders the deck.
        whatItIs:
          position === 0
            ? 'The price of a contract that pays out if this happens — what people will stake on the outcome, not anyone’s forecast. It moves faster than any poll.'
            : 'A market price on whether this outcome happens, not a forecast or a measured fact.',
        // In points, never per cent: a contract going 26 → 86 moved 60 points,
        // and the chip says so. What is left for the sentence is the range,
        // which is the part that says how settled the belief is — a number
        // sitting at 88 having never been below 80 is a different fact from
        // one that got there from 30 last week.
        changed:
          extremes && extremes.max - extremes.min >= 1
            ? `As low as ${Math.round(extremes.min)}% (${extremes.minAt}) and as high as ${Math.round(extremes.max)}% (${extremes.maxAt}) inside the window held here.`
            : undefined,
        why: indicator.standing,
        series: {
          values: indicator.values,
          periods: indicator.periods,
          label: 'chance priced, per cent',
          unit: '%',
          highlight: 'last',
        },
        range: extremes
          ? { min: extremes.min, max: extremes.max, minAt: extremes.minAt, maxAt: extremes.maxAt }
          : undefined,
        related: relatedForTags(articles, indicator.topicTags),
        sourceLabel: indicator.sourceLabel,
        link: indicator.marketUrl,
      };
      return card;
    })
    .filter((c): c is BeliefCard => c !== null);
}

// ---------------------------------------------------------------------------
// Attention
// ---------------------------------------------------------------------------

/** Wikipedia's own label carries the source in it. The card already says
 *  where the numbers come from. */
const stripWikiSuffix = (label: string) => label.replace(/\s*—\s*Wikipedia views$/, '');

/**
 * What the world was actually looking up.
 *
 * Raw pageviews are a population ranking — the United States article is read
 * more than the Strait of Hormuz article every single day, and always will be.
 * Measured against each subject's own recent average, the same numbers say
 * something a reader cannot get anywhere else: where curiosity moved.
 *
 * It sits in `outlook` beside the prediction contracts rather than in `news`,
 * and that placement is the argument. Both are prices on what people believe —
 * one paid in dollars, one in attention — and neither is a measurement of what
 * is happening. Today the strait is closed and its article is being read at
 * seven-tenths of its own normal rate, which is the entire point of the card.
 *
 * This comment made that argument for a while before the axis caught up with
 * it: the contracts became their own section and attention stayed behind in
 * `markets`, filed with crude and the ten-year, which are measurements.
 */
function attentionCard(snapshot: TrendsSnapshot, articles: Article[]): Card | null {
  const wiki = snapshot.indicators.filter((i) => i.source === 'wikipedia');
  if (wiki.length < 3) return null;

  const scored = wiki
    .map((indicator) => {
      const values = indicator.values;
      if (values.length < 4) return null;
      const latest = values[values.length - 1];
      const history = values.slice(0, -1);
      const baseline = history.reduce((sum, v) => sum + v, 0) / history.length;
      if (latest == null || !Number.isFinite(latest) || !(baseline > 0)) return null;
      return { indicator, latest, baseline, ratio: latest / baseline };
    })
    .filter(
      (x): x is { indicator: Indicator; latest: number; baseline: number; ratio: number } =>
        x !== null,
    )
    .sort((a, b) => b.ratio - a.ratio);
  if (scored.length < 3) return null;

  // Furthest from its own normal, in either direction. A collapse in interest
  // is as much a fact as a spike, and often the more surprising one.
  const mover = [...scored].sort((a, b) => Math.abs(b.ratio - 1) - Math.abs(a.ratio - 1))[0];
  if (!mover) return null;

  const rows: CompareRow[] = scored.map(({ indicator, ratio }) => ({
    label: stripWikiSuffix(indicator.label),
    value: `${Math.round(ratio * 100)}%`,
    // Slate, every row, because the value printed *is* a move — per cent of a
    // subject's own normal — and the app has nothing to say about which way is
    // the good way. Untinted, these were the one comparison table in the app
    // whose rows were grey pills next to a table whose rows were coloured, and
    // the difference read as a missing signal rather than a withheld one.
    tone: 'neutral' as const,
    // Distance from normal, not the rate itself — otherwise the bars would
    // rank by how popular a subject is, which is the thing being corrected for.
    weight: Math.abs(ratio - 1),
    cc: indicator.countryTags?.[0],
  }));

  return {
    id: 'attention',
    kind: 'comparison',
    kicker: 'attention',
    title: 'What the world looked up',
    reading: `${Math.round(mover.ratio * 100)}%`,
    readingNote: `of normal · ${stripWikiSuffix(mover.indicator.label)}`,
    // Slate. Curiosity moving is not good news or bad news, and this is the
    // card that shows what the third tone is for: the arrow says a subject was
    // opened more than usual, and the colour declines to tell you whether that
    // is a good thing — which is a claim the app can stand behind, unlike
    // either sage or rose.
    delta: deltaFrom(
      { pct: (mover.ratio - 1) * 100, from: '', to: '', points: mover.indicator.values.length },
      null,
      { window: 'against its own normal' },
    ),
    whatItIs:
      'How many people opened each Wikipedia article today, set against that subject’s own recent average. It reads as where curiosity went, which is not where the news is.',
    changed: `${stripWikiSuffix(mover.indicator.label)} was opened ${formatCount(mover.latest)} times a day against its usual ${formatCount(mover.baseline)}. Everything else is listed against its own normal too, so a small subject can out-move a large one.`,
    why: mover.indicator.standing,
    rows,
    rowsLabel: 'against each subject’s own average',
    related: relatedForTags(articles, mover.indicator.topicTags),
    sourceLabel: mover.indicator.sourceLabel,
  };
}

// ---------------------------------------------------------------------------
// What is scheduled
// ---------------------------------------------------------------------------

/** How many of the calendar's entries reach the card. Four fits a screen and
 *  covers the near horizon; the rest are a list nobody reads standing up. */
const CALENDAR_LIMIT = 4;

/**
 * How close the next entry has to be before the calendar is worth a screen.
 *
 * The calendar is the one payload in the app that cannot go stale and cannot
 * be news either: every entry is correct for months and none of them changes.
 * Ungated it is the same four lines every morning — and the live file makes
 * that concrete, with a 34-day gap between the 5 November Bank of England
 * decision and the 9 December FOMC. That is the exact failure the freshness
 * gates in `lib/cards/conditions.ts` exist to prevent, arrived at from the
 * other direction: not data too old to be news, but data too far ahead to be.
 *
 * Ten days is about the distance at which a rate decision starts being priced
 * and written about rather than merely diarised.
 */
const CALENDAR_HORIZON_DAYS = 10;

/** The only card in the app about the future rather than the present. Most
 *  economic news is scheduled weeks ahead, which is itself the lesson: the
 *  surprise is never the date, only the number. */
function calendarCard(snapshot: TrendsSnapshot, now: Date): ConditionCard | null {
  const events = snapshot.events;
  if (!events || events.length === 0) return null;
  const today = now.toISOString().slice(0, 10);
  const horizon = new Date(now.getTime() + CALENDAR_HORIZON_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const upcoming: TrendEvent[] = events
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, CALENDAR_LIMIT);
  const next = upcoming[0];
  // Nothing inside the horizon means nothing to say this morning. The old
  // fallback here — show the first four entries whatever their dates — is
  // what made this furniture: on a day with no upcoming events it printed
  // *past* ones rather than admitting the column was shorter.
  if (!next || next.date > horizon) return null;
  const shown = upcoming;

  return {
    id: 'calendar',
    kind: 'condition',
    visualStyle: 'timeline',
    kicker: 'ahead',
    title: 'What is already scheduled',
    reading: String(shown.length),
    readingNote: 'decisions and releases coming',
    whatItIs:
      'Central-bank decisions and statistical releases are published on a calendar set months in advance. The date is never the surprise; only the number is.',
    changed: undefined,
    why: next.standing,
    figures: shown.map((e) => ({
      label: formatEventDate(e.date),
      value: e.title,
      note: e.institution,
      weight: Date.parse(e.date),
    })),
    sourceLabel: 'FRED · central-bank calendars',
  };
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "12 Aug" from "2026-08-12", without constructing a Date — the string is
 *  already the calendar day the institution published, and parsing it into a
 *  Date drags the device's timezone into a date that has none. */
function formatEventDate(iso: string): string {
  const [, month, day] = iso.split('-');
  const monthIndex = Number(month) - 1;
  const name = MONTH_NAMES[monthIndex];
  if (!name || !day) return iso;
  return `${Number(day)} ${name}`;
}

// ---------------------------------------------------------------------------

export interface InstrumentCardInputs {
  trends: TrendsSnapshot | null;
  chokepoints: Chokepoint[];
  /** Today's feed, for the tie-to-the-news line. */
  articles: Article[];
  /** Injected so the calendar card is testable without freezing the clock. */
  now?: Date;
}

/** One column per section that holds instruments. Keys match `SECTIONS`. */
export interface InstrumentColumns {
  prices: Card[];
  money: Card[];
  outlook: Card[];
}

const EMPTY_COLUMNS: InstrumentColumns = {
  prices: [],
  money: [],
  outlook: [],
};

/**
 * Build every instrument column.
 *
 * Order within a column is reading order, and each column opens with the card
 * that answers its own question most directly.
 *
 * `prices` opens with the nisab. It moves daily, it is the one price in the
 * app that is also an obligation, and it is the card no other news app
 * carries; the documented eat-then-burn order runs beneath it. On a day when a
 * strait has actually gone quiet, that card takes the head instead — freight
 * that has stopped moving is a price story before it is anything else, and it
 * arrives carrying the `today` mark.
 *
 * `money` opens with fifteen currencies, because "did mine move" is the
 * question, and the rows that were news follow it. The ten-year and the two
 * coins are the same question asked about borrowing and about money no state
 * issues.
 *
 * `outlook` opens with the contracts, which is also where the once-per-column
 * explainer lives (see `beliefCards`), then where curiosity went, then the
 * price of insuring against a fall, then what is already on the calendar.
 *
 * Every card returns null rather than a placeholder when its data is missing
 * or its gate does not clear, so a quiet day yields shorter columns and never
 * a broken screen.
 */
export function buildInstrumentCards({
  trends,
  chokepoints,
  articles,
  now = new Date(),
}: InstrumentCardInputs): InstrumentColumns {
  if (!trends) return EMPTY_COLUMNS;
  const keep = (cards: (Card | null)[]): Card[] => cards.filter((c): c is Card => c !== null);

  return {
    prices: keep([
      straitMovedCard(chokepoints),
      nisabCard(trends),
      staplesCard(trends, articles),
      indicatorCard(
        trends,
        articles,
        'brent',
        'energy',
        'The benchmark price for a barrel of crude. Most of the world’s oil is sold at a premium or discount to it, so it is the number under every fuel price.',
      ),
      metalsPairCard(trends, articles),
    ]),

    money: keep([
      currenciesCard(trends, articles),
      ...fxMoverCards(trends, articles),
      // The ten-year survives the cut that took the S&P and the NASDAQ with
      // it, on the rule that killed them: it can be explained in one sentence
      // to someone who has never met it, and it says something about an
      // ordinary life. An index *level* cannot do either.
      indicatorCard(
        trends,
        articles,
        'us-10y',
        'money',
        'What the United States pays to borrow for ten years. Almost every other long-term rate on earth — mortgages, sovereign debt, project finance — is priced off it.',
      ),
      indicatorCard(
        trends,
        articles,
        'btc',
        'crypto',
        'Money that no state issues and no bank clears. That is the argument for it and the argument against it, in the same sentence.',
        // Slate, from its absence in `RISE_MEANS`: bitcoin going up is good
        // news for whoever holds it and nothing at all to everyone else, and
        // an app that tints it sage has taken a position on whether you should.
      ),
      indicatorCard(
        trends,
        articles,
        'eth',
        'crypto',
        'The network most of the rest of crypto runs on. Tokens, exchanges and contracts settle there, so its price tracks the sector’s activity, not just its own.',
      ),
    ]),

    outlook: keep([
      ...beliefCards(trends, articles),
      attentionCard(trends, articles),
      // VIX files here rather than beside the ten-year, and the app's own
      // reasoning put it here: the S&P and the NASDAQ were cut because an
      // index level is not a fact about a life, and what saved VIX from the
      // same cut was its *fear* reading. A number that says what traders are
      // paying to insure against a fall next month is a price on a belief,
      // measured the same way a contract is. The kicker says so.
      indicatorCard(
        trends,
        articles,
        'vix',
        'what traders fear',
        'How much traders are paying to insure against a fall in US shares over the next month. It rises when people are frightened, which is why it is called the fear index.',
      ),
      calendarCard(trends, now),
    ]),
  };
}
