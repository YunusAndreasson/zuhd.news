import type {
  Article,
  Chokepoint,
  CompareRow,
  Indicator,
  TrendEvent,
  TrendsSnapshot,
} from '@shared/types';
import { CHOKEPOINT_DISRUPTED, chokepointValence, riseMeansFor, valenceOfChange } from '../valence';
import type { WindowChange } from './format';
import {
  deltaFrom,
  formatCount,
  formatMagnitudePct,
  formatQuantity,
  formatReading,
  formatSignedPct,
  formatSignedPoints,
  isFresh,
  labelledWhy,
  latestOf,
  nisab,
  plotWindow,
  readingParts,
  relatedForTags,
  seriesExtremes,
  unitDenominator,
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
 * arrived with: `commodities` (what things cost — the zakat threshold, the two
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
    const per = unitDenominator(unit);
    return per ? `dollars ${per}` : 'dollars';
  }
  return unit;
}

/**
 * The unit as the *tick labels* should carry it, which is not always as the
 * caption carries it.
 *
 * `axisCaption` names the unit once, in English, directly above the chart.
 * Repeating it on both ticks is a data column pasted onto a card — and it is
 * not free: "105.3 $/bbl" is wide enough that the axis label wraps to two
 * lines, so the noise costs layout as well as attention.
 *
 * Two units are pure decoration and drop out entirely. `index` is a kind, not
 * a denominator — the same judgement `readingParts` makes about the note, and
 * on the VIX card the word appeared three more times after that one was
 * removed. A currency pair (`ZAR / USD`) is the raw column the caption was
 * just rewritten to stop showing; leaving it on the ticks kept it on screen.
 * Both are still spoken: the accessibility label leads with the caption.
 */
function tickUnit(unit: string | undefined): string | undefined {
  if (!unit || unit === 'index' || unit.includes(' / ')) return undefined;
  return unit;
}

/**
 * The window behind part one: the chip under the reading, and the line under
 * the title.
 *
 * The chip used to be a sentence — "−5.2% since 22 Jul." — sitting where part
 * three goes. A percentage and a date is not prose and gains nothing from
 * being set as prose; it gains a line of a screen the card is fighting to fit
 * inside, and it loses the one thing it should have, which is being visible
 * without being read. A daily series holds observations rather than calendar
 * days, so the window is still named from the period labels and never as
 * "month on month".
 *
 * What this returns is the window itself rather than the finished chip,
 * because the chart has to draw exactly it. It used to return the chip alone
 * and the series was then handed to `TrendBlock` whole. On the three FRED
 * cards those are not the same window: `DAILY_WINDOW` is thirty observations
 * and `brent` ships sixty-one, so the card read **up 33%, since Jul 7** above
 * a line running from 26 May to 18 Aug and falling across the width of the
 * screen. The number and the picture were answering different questions, and
 * nothing on the card said so.
 *
 * Returning the `WindowChange` itself is what makes that impossible rather
 * than merely fixed: `plotWindow` slices from the same object the chip was
 * built from, so a second span can never be computed here and drift from the
 * first.
 */
function readingWindow(indicator: Indicator): {
  change: WindowChange | null;
  options: { window?: string; unit?: 'points' };
} {
  const monthly = indicator.cadence === 'monthly';
  const span = monthly ? MONTH : DAILY_WINDOW;
  const window = monthly ? { window: 'on the month' } : {};
  // A series already measured in per cent gets its move in points, which
  // `windowPointChange` documents as mandatory. The ten-year printed "4.69%"
  // at display size with "▲3.3%" directly beneath it: two percentages on one
  // line, one a level and one a relative change, and nothing on the card
  // separating them. The move was fifteen basis points.
  //
  // The guard sits above the cadence split rather than inside one half of it.
  // It was written into the daily branch only, which made a property of the
  // *unit* conditional on the *cadence* — nothing in today's payload is both
  // monthly and per cent, so the hole was invisible, and the day the pipeline
  // gives `us-10y` a monthly cadence the fixed bug comes back with no test
  // touching it.
  if (indicator.unit === '%') {
    return {
      change: windowPointChange(indicator, span),
      options: { ...window, unit: 'points' },
    };
  }
  return { change: windowChange(indicator, span), options: window };
}

/** The year, once the chip has taken the month. Two windows are worth having
 *  on a monthly series — a grain that is flat this month and a fifth cheaper
 *  than last year is two different facts — but only one of them fits in the
 *  chip. */
function describeYearChange(indicator: Indicator): string | undefined {
  // Same rule as the chip above it, for the same reason: a series already in
  // per cent moves in points, and this sentence would otherwise be the one
  // place on the card still calling fifteen basis points "+3.3%".
  const points = indicator.unit === '%';
  const yoy = points ? windowPointChange(indicator, YEAR) : windowChange(indicator, YEAR);
  if (!yoy) return undefined;
  const signed = points ? formatSignedPoints(yoy.pct) : formatSignedPct(yoy.pct);
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
    // Wheat's paragraph, said to be wheat's. It opens "The world price of
    // milling wheat…" and never reaches rice, which on a card titled "Wheat
    // and rice" read as the card explaining half of itself without saying
    // which half. Rice has a `standing` of its own and both will not fit; the
    // label is what makes printing one of them honest.
    ...labelledWhy(wheat.standing, 'on wheat'),
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
  const { reading, note } = readingParts(value, indicator.unit);
  // One window, two renderings of it. The chip names it in words and the chart
  // draws it, and both come off the same `WindowChange` — see `readingWindow`
  // for the three cards where they used to differ by a month of trading days.
  const { change, options } = readingWindow(indicator);
  const plot = plotWindow(indicator, change);
  return {
    id,
    kind: 'reading',
    kicker,
    title: indicator.label,
    reading,
    readingNote: note,
    delta: deltaFrom(change, riseMeans, options),
    whatItIs: definitionUnlessStanding(whatItIs, indicator.standing),
    // A daily series has said everything it has to say in the chip; only a
    // monthly one has a second window worth a sentence.
    changed: monthly ? describeYearChange(indicator) : undefined,
    why: indicator.standing,
    series: {
      values: plot.values,
      periods: plot.periods,
      baseline: plot.baseline,
      label: axisCaption(indicator.unit, indicator.label),
      unit: tickUnit(indicator.unit),
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
  const nisabPlot = plotWindow(bindingIndicator, move);
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
      // The window the chip measured, and only it — the metal's series and
      // `DAILY_WINDOW` happen to coincide on today's payload, and `plotWindow`
      // is what keeps them coinciding on a payload that changes length.
      values: nisabPlot.values,
      periods: nisabPlot.periods,
      baseline: nisabPlot.baseline,
      // Lowercased: every other chart caption in the app is set as a phrase
      // rather than a proper noun ("dollars a barrel", "the ratio, day by day"),
      // and this one printed "Silver, dollars an ounce" from the data label.
      label: `${bindingIndicator.label.split(' (')[0]?.toLowerCase()}, ${axisCaption(bindingIndicator.unit, 'dollars an ounce')}`,
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
  // The ratio's own history, with any period either metal failed to price
  // dropped along with its label — `ratioSeries` carries NaN there, and a
  // chart cannot draw one.
  const ratioPlot = ratioSeries.reduce<{ values: number[]; periods: string[] }>(
    (acc, v, i) => {
      if (Number.isFinite(v)) {
        acc.values.push(v);
        acc.periods.push(gold.periods[i] ?? '');
      }
      return acc;
    },
    { values: [], periods: [] },
  );
  // Measured on the series the chart draws, not on the one with the holes in
  // it. Read from `ratioSeries` the chip could disagree with the picture two
  // ways: a NaN exactly `DAILY_WINDOW` back makes `windowChange` return null,
  // so the chip vanishes from a card whose chart still shows the move; and
  // any interior gap shifts the window, so `since ${from}` named a period the
  // chart's own ticks had dropped.
  const ratioChange = windowChange(ratioPlot, DAILY_WINDOW);
  const delta = deltaFrom(ratioChange, null);
  const ratioWindow = plotWindow(ratioPlot, ratioChange);

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
      // "The two metals wealth has been measured in for as long as it has been
      // measured" was a sentence that circled back to its own subject and told
      // the reader nothing. A date does the work an aphorism was doing.
      'Wealth has been held in these two metals for millennia. The ratio between them is the oldest price still quoted.',
    changed:
      goldMove && silverMove
        ? `Since ${goldMove.from}, gold ${formatSignedPct(goldMove.pct)} and silver ${formatSignedPct(silverMove.pct)}.`
        : undefined,
    // No `why`, and this is the case a label cannot rescue. `paxg.standing`
    // describes the *instrument the price is read from* — "A token backed
    // one-for-one by allocated gold bullion, so its price tracks an ounce of
    // gold" — which arrived under the title "Gold against silver" as the app's
    // teaching sentence about gold. Calling it "on gold" would only make the
    // mislabelling explicit. A proxy is a sourcing decision, and this card
    // already discloses it where sourcing belongs, in `sourceLabel`.
    //
    // Nothing is lost: part two teaches the ratio, part three gives both
    // moves, and the two prices are figures. This is the same resolution
    // `currenciesCard` reached, for the same reason.
    figures: [
      { label: 'gold', value: `$${formatReading(goldNow)}` },
      { label: 'silver', value: `$${formatReading(silverNow)}` },
    ],
    // The ratio, which is what the reading and the chip already measure — and
    // the only reading card in the app whose chart was not its own reading.
    //
    // Two lines on one axis is right for wheat and rice, which sit inside a
    // factor of two of each other. Gold and silver sit at ninety-four to one,
    // and `types.ts` guards the wrong half of that: it warns against two
    // *units* on one axis, and this was two magnitudes. Silver rendered as a
    // flat line pinned to the axis floor for the whole window — the reader
    // could not see it move, could not read its level off an axis labelled in
    // thousands, and could not see the one thing the card exists to show,
    // which is which of the two is currently the cheaper. Both prices are
    // figures directly above it; neither needed a second rendering that
    // teaches less than the figure does.
    series: {
      values: ratioWindow.values,
      periods: ratioWindow.periods,
      baseline: ratioWindow.baseline,
      // Not the `readingNote` verbatim, which is what this was: "ounces of
      // silver to one of gold" printed under the reading and again over the
      // chart, the same thirty-one characters twice on one screen. What the
      // chart adds to the reading is time, so the caption says that instead.
      label: 'the ratio, day by day',
      highlight: 'last',
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

  // Counted on the same floor the rows are coloured on, because the headline
  // and the table have to be answering one question. Counting every positive
  // rate change instead made the card contradict itself in the live payload:
  // "4 of 15 weakened" over a table in which the fourth of those four — the
  // Lebanese pound, a tenth of a per cent — was painted slate, the app's word
  // for *no claim*. A reader who counts the rose pills gets three, and the two
  // numbers cannot both be the app's position.
  const weakened = scored.filter((s) => s.change.pct >= FX_NOISE_FLOOR);
  const rows: CompareRow[] = scored.map(({ indicator, change }) => ({
    // The pipeline's label already reads as a currency name; the unit carries
    // the pairing ("PKR / USD"), so the row does not repeat it.
    label: indicator.label,
    // `tabular`, because this is the one place in the app where fifteen of
    // these stack into a rail. Left to prose rounding the column printed
    // "+1%" beside "+0.8%" and "+3%" beside "+3.5%" — three pill widths and
    // two decimal positions describing moves measured the same way over the
    // same window, which reads as a difference in precision the data does not
    // have.
    value: formatSignedPct(currencyMove(change.pct), { tabular: true }),
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
        ? `${first.indicator.label} moved furthest since ${window.from}, ${formatSignedPct(currencyMove(first.change.pct))}.`
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
  // What "biggest faller" is biggest *of*. Counted from the same filter the
  // movers are drawn from, so the claim cannot outgrow the set behind it.
  const tracked = snapshot.indicators.filter((i) => i.source === 'oer').length;
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
      const plot = plotWindow(indicator, change);
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
        // "Biggest faller", not "Weakened further than any other currency the
        // app follows". Three things were wrong with that: a newspaper does
        // not say what it itself follows, "more than all but one" is a riddle
        // whose answer is "second", and the verb repeated the chip directly
        // above it. The rank is the news here and it should be the first word.
        changed: `${rank === 0 ? 'Biggest' : 'Second-biggest'} ${weakened ? 'faller' : 'riser'} of the ${tracked} currencies tracked, in the month to ${change.to}.`,
        why: indicator.standing,
        series: {
          values: plot.values,
          periods: plot.periods,
          // The rate the window opened at. It is the level "weaker since Jul
          // 24" is measured from, so the line ending above it *is* the chip,
          // drawn — and on this one card that reads backwards on purpose:
          // above the reference is a rate that rose, which is a currency that
          // fell. That is what the caption below is for.
          baseline: plot.baseline,
          // The one chart in the app that has to name its own direction.
          //
          // The card quotes the currency and the chart quotes the rate, so a
          // ruble 5.3% weaker arrives as a **down** caret above a line
          // climbing 78 → 83. Both are correct and the reader has to know the
          // denominator to see it; the standing paragraph says so, four
          // paragraphs below the chart, which is three parts too late.
          //
          // Plotting the reciprocal instead would put an unreadable 0.0121 on
          // the axis, and indexing to 100 at the window start would invent a
          // series the source never published. Six words on the caption cost
          // nothing and are true of the line directly beneath them.
          //
          // It was also the last raw data column left on a chart caption —
          // "RUB / USD" where every other card reads its unit aloud ("dollars
          // a barrel", "chance priced, per cent").
          //
          // Just the direction, because the unit is already on screen: this
          // caption read "RUB to the dollar · higher is weaker" directly under
          // a `readingNote` of "RUB to the dollar", two lines apart. The four
          // words the chart adds are the four the card does not have anywhere
          // else, and they are the whole reason this caption exists.
          label: 'higher is weaker',
          // Not `indicator.unit` — see `tickUnit`. Every tick was printing the
          // same "ZAR⁠/⁠USD" the caption above had just been rewritten to stop
          // showing, wide enough to wrap each label onto two lines.
          unit: tickUnit(indicator.unit),
          highlight: 'last' as const,
          // The caption above is what the card does about the inversion. The
          // column index cannot caption a 56×24 line, so it reads this and
          // plots the reciprocal instead — see `CardSeries.inverted`.
          inverted: true,
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

/**
 * How old a PortWatch reading may be and still lead a column.
 *
 * The gate this adds is the one `lib/cards/conditions.ts` was written to
 * enforce, arrived at from the other side: that file killed a whole section
 * for shipping standing data as news, and this card — the only other one in
 * the app carrying the `today` mark — had no freshness test at all.
 *
 * Fourteen days, not seven, because the source's own cadence is the floor: in
 * the live payload all eleven straits carry `asOf` six days behind the file
 * that holds them, so a one-week gate would drop every strait every day and
 * the gate would read as a bug. Fourteen clears one missed publication and no
 * more.
 *
 * The lag is also why `readingNote` names the week the count belongs to. The
 * `today` mark says *this card is here because its data moved*, and it was
 * sitting above a figure a reader would reasonably take for this morning's.
 */
const FRESH_DAYS_STRAIT = 14;

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
 * and it leads `commodities` carrying the `today` mark.
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
 *
 * ── Why this returns a list, and why that used to be `ranked[0]` ───────────
 *
 * The paragraph above describes a real failure and then accepts it. It is
 * only forced while the column can afford exactly one strait, and that has
 * stopped being true: a column is an index now, and a strait costs a *row*.
 * Today three clear the gate — Kerch at −95.5%, Hormuz at −69.4% on tankers,
 * the Bosporus at −27.9% on dry bulk — and shipping `ranked[0]` alone means a
 * fifth of the world's oil moving at a third of its normal rate is not in the
 * app at all. Ranking is still the right way to *order* them; it was never a
 * good way to choose one.
 *
 * The cap is three rather than none because the gate is a threshold, not a
 * quota: a genuinely bad week could clear it on six or seven straits, and
 * seven near-identical rows would bury the four cards `commodities` exists to
 * carry. Three is the most that can lead a column without becoming the column.
 */
const MAX_STRAIT_CARDS = 3;

/** "the widest gap", "the second-widest", "the third-widest".
 *
 *  The superlative is a claim about the column, and only the first card can
 *  make it. Three cards each saying "the widest gap of the 11 straits
 *  tracked" would be three cards contradicting each other one swipe apart —
 *  the same failure `formatReading` and `axisDecimals` exist to prevent, in
 *  words instead of digits. Bounded by `MAX_STRAIT_CARDS`. */
const GAP_RANK = ['the widest gap', 'the second-widest gap', 'the third-widest gap'];

function straitMovedCards(chokepoints: Chokepoint[], now: Date): ReadingCard[] {
  const ranked = chokepoints
    .map((c) => ({ c, d: primaryDelta(c) }))
    .filter((x): x is { c: Chokepoint; d: number } => x.d !== null)
    .filter((x) => x.d <= -CHOKEPOINT_DISRUPTED)
    .filter((x) => isFresh(x.c.asOf, now, FRESH_DAYS_STRAIT))
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .slice(0, MAX_STRAIT_CARDS);

  // The denominator is the set actually behind the claim, not a literal.
  // `fxMoverCards` already derives its own ("the claim cannot outgrow the set
  // behind it") and this line did not — it said "of the 11 straits tracked"
  // whatever arrived, so the day PortWatch adds a twelfth the card would have
  // gone on saying eleven with nothing to catch it.
  const tracked = chokepoints.length;
  return ranked.map(({ c, d }, position) => straitCard(c, d, position, tracked));
}

function straitCard(c: Chokepoint, d: number, position: number, tracked: number): ReadingCard {
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
    // The window, named. `last7Avg` is a seven-day average and PortWatch
    // publishes with a lag, so on the live payload this figure closed six days
    // before the file it arrived in — under a kicker reading "today ·
    // chokepoint", which is the app telling a reader its data moved this
    // morning. The mark is right (the card *is* here because the strait went
    // quiet) and the reading is right; only the silence about which week it
    // counted was wrong, and the chart's last tick was the sole place a reader
    // could have found out.
    // No fallback for a missing `asOf`: `isFresh` above rejects anything it
    // cannot date, so a chokepoint without one never reaches this line.
    readingNote: `${vessels} a day, week to ${formatEventDate(c.asOf)}`,
    // Built by hand rather than through `deltaFrom`, because this one is not
    // symmetric and `riseMeans` can only describe a symmetric pair. Quiet is
    // coloured; busy is not. A strait above its own normal is usually traffic
    // that was rerouted *to* here, which is the same disruption seen from the
    // other end, and the app names the squeeze rather than the detour.
    delta: straitDelta(d),
    whatItIs: c.blurb,
    // One name for the level, not two — "90-day normal" in the first sentence
    // and "its baseline" in the second were the same number, and the chip above
    // and the dashed rule on the chart are both pointing at it as well. "The
    // widest gap of the eleven" replaces "the furthest any of the eleven
    // straits has moved from", which is nine words doing the work of four.
    changed:
      base != null
        ? `Its 90-day normal is ${formatQuantity(base)} a day — ${GAP_RANK[position] ?? 'among the widest gaps'} of the ${tracked} straits tracked.`
        : undefined,
    why: straitWhy(c),
    series: {
      values: c.series.total,
      periods: c.series.periods,
      // The one card whose chip compares against a *level* rather than a
      // window — "vs its 90-day normal" — so the reference line is that
      // normal. The ninety days plotted are the ninety the normal is the mean
      // of, so the line and the level are measured over the same period.
      //
      // `n_total`, not `primaryField`, because `series.total` is the only
      // series PortWatch ships and it counts every hull. Seven of the eleven
      // straits have a primary field that is not the total — Panama is read on
      // container traffic, Hormuz on tankers — and their normals differ by a
      // factor of four (Panama: 8.1 container against 30.9 all ships). Drawn
      // from the primary field the rule would have sat a quarter of the way up
      // a chart it has nothing to do with, and looked exactly like a
      // measurement. Kerch is `n_total` and would never have shown it.
      //
      // What the reading counts is named beside it ("tankers a day") and what
      // the chart counts is named on the caption ("all ships a day"); this
      // keeps the chart internally consistent, which is as far as one series
      // allows.
      baseline: c.baseline90Avg.n_total,
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
/** How far back "recently" reaches when ranking beliefs. A week of
 *  observations: long enough that one quiet day does not demote a contract,
 *  short enough that a move a fortnight ago has stopped being the news. */
const BELIEF_RECENT_WINDOW = 7;

/** How many points a contract has moved lately, as the ranking key. Absolute:
 *  a belief collapsing is as much the news as one firming. */
function recentBeliefMove(indicator: Indicator): number {
  const change = windowPointChange(indicator, BELIEF_RECENT_WINDOW);
  return change ? Math.abs(change.pct) : 0;
}

/**
 * The range a belief has travelled inside the window we hold, as one sentence.
 *
 * `null` when the contract has not moved a whole point across the window —
 * there is no range to describe and the chip has already said "unchanged".
 */
function describeBeliefRange(
  extremes: ReturnType<typeof seriesExtremes>,
  latest: number,
): string | undefined {
  if (!extremes || extremes.max - extremes.min < 1) return undefined;
  const low = Math.round(extremes.min);
  const high = Math.round(extremes.max);
  const now = Math.round(latest);
  const atHigh = now >= high;
  const atLow = now <= low;
  // "the period shown", not "the window held here". The app holds about a
  // month and must not imply an all-time high, so the scope has to be stated —
  // but "the window held here" is five words of the app talking about its own
  // storage, and the reader has no idea what window that is. The chart draws
  // exactly this period now, dated at both ends, so pointing at it is both
  // shorter and the only version a reader can check.
  if (atHigh) return `A high for the period shown, against a low of ${low}% (${extremes.minAt}).`;
  if (atLow) return `A low for the period shown, against a high of ${high}% (${extremes.maxAt}).`;
  return `Between ${low}% (${extremes.minAt}) and ${high}% (${extremes.maxAt}) over the period shown.`;
}

/** How many contracts `outlook` will carry, however many arrive.
 *
 *  Four leaves room for the other three cards the column exists to hold —
 *  attention, VIX, the calendar — which is the difference between a column
 *  about what is not yet a fact and a column about Polymarket. */
const BELIEF_LIMIT = 4;

function beliefCards(snapshot: TrendsSnapshot, articles: Article[]): BeliefCard[] {
  return (
    snapshot.indicators
      .filter((i) => i.source === 'polymarket')
      // Ranked by what actually moved, not by the order the feed happened to
      // list them in — the app's own rule ("a card ships because it changed")
      // applied to the one column that was still ignoring it.
      //
      // The live payload is the argument. Feed order opened `outlook` with the
      // Fed and closed it with "Ocasio-Cortez wins the 2028 US presidency?",
      // flat at 13% for twelve straight days, resolving in two years, carrying
      // no `standing` — so the column's weakest card also took the third screen.
      // In the middle sat a contract on a US-Iran ceasefire holding to 31
      // August, eight points in three days, tied to three of today's stories.
      //
      // Sorting before the map matters twice: the once-per-column explainer is
      // keyed on `position === 0`, so it now lands on the card a reader arriving
      // from the section rail actually meets — and it lands on the contract that
      // has no `standing` of its own, which is where the column most needed it.
      .sort((a, b) => recentBeliefMove(b) - recentBeliefMove(a))
      // Dropped *before* the position is handed out, not after. `position`
      // decides which card carries the once-per-column explainer, and taking
      // it from the `.map` index over the unfiltered list meant that if the
      // top-ranked contract had no usable last value, the card the reader
      // actually met was `position === 1` and the column rendered with no
      // explainer at all. Sorting made index 0 meaningful; this makes it true.
      .filter((indicator): indicator is Indicator => latestOf(indicator) != null)
      // Capped, and the cap goes exactly here: after the sort, after the
      // `latestOf` filter, before the map.
      //
      // Both neighbours are load-bearing and the comments above say why, so
      // this one has to respect both — slice before the sort and the column
      // keeps whichever contracts the feed listed first; slice after the map
      // and `position === 0` has already been handed to a card that may be
      // about to be dropped, taking the once-per-column explainer with it.
      //
      // There was no cap at all, which was safe only because the pipeline
      // ships three contracts. It ships three because
      // `scripts/lib/trends-sources/polymarket.js` takes the top 20 by 24-hour
      // volume before its decided-band and dedupe filters run, and the day
      // that number is raised — which is the only way to get more predictions,
      // since nothing in this app was ever limiting them — an uncapped builder
      // turns `outlook` into a Polymarket mirror. The axis is cut by reader
      // question, and "what is not yet a fact" is a question, not a feed:
      // where curiosity went and the price of insuring against a fall belong
      // on that screen too.
      .slice(0, BELIEF_LIMIT)
      .map((indicator, position) => {
        const value = latestOf(indicator) as number;
        const extremes = seriesExtremes(indicator);
        const change = windowPointChange(indicator, indicator.values.length - 1);
        const beliefPlot = plotWindow(indicator, change);
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
          // Once per column, not once per card.
          //
          // This paragraph is the same 200 characters on every prediction card,
          // and the column is three cards deep — so a reader swiping through it
          // met the identical explanation of what a prediction contract is three
          // times in under a minute, while two of the three cards had no
          // `standing` and therefore nothing else to say. That is the shape of
          // filler: text that is correct, is not wrong anywhere, and stops being
          // read after the first screen.
          //
          // It stays on the first card because a reader who lands here from the
          // section rail does need it once. After that the kicker ("what traders
          // think") and the note under the number ("priced today") carry it, and
          // they carry it in four words instead of forty.
          //
          // And it goes through `definitionUnlessStanding` like every other
          // builder, because "once per column" and "once per screen" are two
          // different guarantees and this had only the first. The comment above
          // the sort claims index 0 "lands on the contract that has no
          // `standing` of its own" — that was a property of the payload it was
          // written against, not of the ranking, and the live file disproved it:
          // the US-Iran ceasefire contract sorted first *and* carried a
          // `standing` paragraph, so the top card of `outlook` printed a
          // definition of a prediction contract, a chart, and then a second
          // definition of a prediction contract. That is the collision
          // `definitionUnlessStanding` exists to make structurally impossible,
          // and this was the one call site still deciding it by hand.
          //
          // It matters more here than anywhere else: this is the first prose on
          // the first card of the column, so a reader who opens the app every
          // morning met both copies every morning.
          whatItIs:
            position === 0
              ? definitionUnlessStanding(
                  'The price of a contract that pays out if this happens — what people will stake on the outcome, not anyone’s forecast. It moves faster than any poll.',
                  indicator.standing,
                )
              : undefined,
          // In points, never per cent: a contract going 26 → 86 moved 60 points,
          // and the chip says so. What is left for the sentence is the range,
          // which is the part that says how settled the belief is — a number
          // sitting at 88 having never been below 80 is a different fact from
          // one that got there from 30 last week.
          //
          // When today *is* the extreme the sentence says so instead of dating
          // it, because dating it reads as a different day: the live ceasefire
          // contract printed "as high as 91% (Aug 20)" while the number above it
          // was 91% today, which invites a reader to look for a fall that never
          // happened. "The highest it has been" is the same arithmetic and the
          // better fact — a belief at its own ceiling is news; a belief that
          // touched that ceiling three days ago and came back is a different
          // story, and the old sentence could not tell them apart.
          changed: describeBeliefRange(extremes, value),
          why: indicator.standing,
          series: {
            values: beliefPlot.values,
            periods: beliefPlot.periods,
            // What the contract was priced at when the window opened, so the
            // sixty points in the chip are a height on the chart rather than a
            // figure to take on trust.
            baseline: beliefPlot.baseline,
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
      .filter((c): c is BeliefCard => c !== null)
  );
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
    // No chip, and this is the one card in the app where that is right.
    //
    // Everywhere else the reading is a level and the chip is the move, which
    // are two facts. Here the reading *is* the move — per cent of a subject's
    // own normal — so the chip could only restate it, and it did, word for
    // word: "131% · OF NORMAL · SYRIA · ▲31% AGAINST ITS OWN NORMAL". One
    // number, printed twice, four words apart, on the line the whole card
    // hangs from. foundation.md is explicit that information appears exactly
    // once.
    //
    // Nor is the colour an argument for keeping it. The chip was slate — the
    // app declining to say whether curiosity moving is good news — and a
    // withheld claim does not need a second pill to be withheld in.

    whatItIs:
      // Says nothing about the normalisation, deliberately: the reading note
      // ("of normal"), the column header ("against each subject's own average")
      // and part three ("278 times a day, against its usual 453") all state it
      // already, and all three are above this line on the same screen. What is
      // left for part two is what the number *is* and the one caveat nothing
      // else carries.
      'How many people opened each Wikipedia article today. It shows where attention went, not where the news was.',
    // The second sentence — "Everything else is listed against its own normal
    // too, so a small subject can out-move a large one" — said what the column
    // header ("against each subject's own average") and part two both already
    // say. Three statements of one normalisation on one screen.
    changed: `${stripWikiSuffix(mover.indicator.label)} was opened ${formatCount(mover.latest)} times a day, against its usual ${formatCount(mover.baseline)}.`,
    // The mover's paragraph, said to be the mover's. It is written about one
    // subject — "Daily readership of the English Wikipedia article on Syria" —
    // and sat under a fifteen-row table as if it described the table.
    ...labelledWhy(mover.indicator.standing, `on ${stripWikiSuffix(mover.indicator.label)}`),
    rows,
    rowsLabel: 'against each subject’s own average',
    related: relatedForTags(articles, mover.indicator.topicTags),
    sourceLabel: mover.indicator.sourceLabel,
  };
}

// ---------------------------------------------------------------------------
// What is scheduled
// ---------------------------------------------------------------------------

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
  // The horizon is the whole gate, and it is applied to every entry rather
  // than only to the first.
  //
  // It used to filter on `date >= today`, take the first four by date, and
  // then test only *that first one* against the horizon. So the card shipped
  // four entries of which two routinely sat weeks past the window that had
  // justified showing any of them: on 23 August it listed 26 Aug, 26 Aug,
  // 10 Sep and 16 Sep — eighteen and twenty-four days out, under a ten-day
  // gate whose entire purpose is "close enough to be news".
  //
  // Filtering both ends makes `shown.length` a fact about the world rather
  // than about `CALENDAR_LIMIT`, which is why that constant is gone. The old
  // reading was `String(shown.length)` — a headline number that changed when
  // someone edited a limit and never when anything happened, which is "say
  // what it is, not what the app does" broken at the top of a card. It also
  // makes "a headline count must equal what the table paints" true by
  // construction here instead of by coincidence: one array feeds both.
  const shown: TrendEvent[] = events
    .filter((e) => e.date >= today && e.date <= horizon)
    .sort((a, b) => a.date.localeCompare(b.date));
  const next = shown[0];
  // Nothing inside the horizon means nothing to say this morning. The older
  // fallback here — show the first four entries whatever their dates — is
  // what made this furniture: on a day with no upcoming events it printed
  // *past* ones rather than admitting the column was shorter.
  if (!next) return null;

  return {
    id: 'calendar',
    kind: 'condition',
    kicker: 'ahead',
    title: 'What is already scheduled',
    // The date, not the count.
    //
    // This read `String(shown.length)` — the row on the column index was the
    // word "scheduled" over the numeral **4**, which is the least informative
    // projection a collection has. It is also the one no calendar anywhere
    // uses: the FT's economic diary prints the next date and what lands on
    // it, because "when, and what" is the entire question a reader brings to
    // a calendar. The count answers a question nobody asks.
    //
    // The count survives in the note, where it belongs — it is the scope of
    // the list below, not the headline. And the reading stays inside
    // `LONG_READING` (9 characters) so it keeps display size on the card.
    reading: formatEventDate(next.date),
    // Not "decisions and releases" — that named the *kind* of thing, which
    // the title and the kicker ("ahead") between them already say twice. What
    // neither of them can say is which one is next.
    readingNote: shown.length > 1 ? `${next.title}, and ${shown.length - 1} more` : next.title,
    whatItIs:
      'Central-bank decisions and statistical releases are scheduled months ahead. The date is never the surprise; only the number is.',
    // Part three, at last. This was `undefined` on the one card in the app
    // about the future, while the pipeline wrote a `recent` paragraph on 13 of
    // the 16 events and nothing rendered any of them. Its own doc comment in
    // `shared/types.ts` reads "why it matters right now, tied to recent
    // coverage", which is part three's job stated in part three's words.
    //
    // The strait card joins `recent` into part *four* instead (`straitWhy`),
    // and that is the deviation, not this: `types.ts` says part four is
    // `standing`, verbatim. Worth reconciling — one field with two homes is
    // how this app has produced most of its silent bugs — but not by copying
    // the deviation into a second builder.
    changed: next.recent,
    // The next release's paragraph, said to be the next release's. Four dates
    // are listed above it and this explains one of them — a reader met a
    // paragraph on the quarterly output estimate under a card whose reading
    // was the numeral "4" and whose title is "What is already scheduled".
    // The reading names that release now, which makes the label agree with
    // the top of the card rather than merely rescue it.
    // The label names the release and no longer dates it. The date is the
    // card's reading now, two lines above, and the app's rule about repetition
    // is explicit that the failure mode is a fact arriving twice from two
    // files neither of which can see the other.
    ...labelledWhy(next.standing, `on ${next.title}`),
    figures: shown.map((e) => ({
      label: formatEventDate(e.date),
      value: e.title,
      note: e.institution,
    })),
    // Part five, also new, and scoped to `next` alone. 11 of the 16 events
    // carry build-time-resolved refs of exactly this type — the articles the
    // `recent` paragraph above was written from — so these are the stories
    // that back the sentence a reader has just read, and not a union across
    // every date on the card. A tie to the wrong story is worse than no tie.
    related: next.relatedArticles,
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
  commodities: Card[];
  money: Card[];
  outlook: Card[];
}

const EMPTY_COLUMNS: InstrumentColumns = {
  commodities: [],
  money: [],
  outlook: [],
};

/**
 * Build every instrument column.
 *
 * Order within a column is reading order, and each column opens with the card
 * that answers its own question most directly.
 *
 * `commodities` opens with the nisab. It moves daily, it is the one price in the
 * app that is also an obligation, and it is the card no other news app
 * carries; the documented eat-then-burn order runs beneath it. On a day when a
 * strait has actually gone quiet, those cards take the head instead — freight
 * that has stopped moving is a price story before it is anything else, and
 * they arrive carrying the `today` mark. Plural: every strait that clears the
 * gate leads, ranked, up to `MAX_STRAIT_CARDS`. Shipping only the worst of
 * them put Hormuz on the floor at −69% on tankers.
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
    commodities: keep([
      ...straitMovedCards(chokepoints, now),
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
      // The kickers below say something rather than naming a bucket, for the
      // reason the VIX comment further down already gives: a kicker is the
      // one line a reader gets before the number, and on the column index it
      // is also the fallback for the note under the title. `us-10y` carried
      // `money` — the name of the column it sits in — so the row read "US 10y
      // Treasury / MONEY" inside MONEY, and `btc`/`eth` carried `crypto`
      // twice in a row. An asset class is not what the number counts, and it
      // is the one thing the reader can already see from where they are
      // standing.
      indicatorCard(
        trends,
        articles,
        'us-10y',
        'what borrowing costs',
        'What the United States pays to borrow for ten years. Almost every other long-term rate on earth — mortgages, sovereign debt, project finance — is priced off it.',
      ),
      indicatorCard(
        trends,
        articles,
        'btc',
        'money no state issues',
        'Money that no state issues and no bank clears. That is the argument for it and the argument against it, in the same sentence.',
        // Slate, from its absence in `RISE_MEANS`: bitcoin going up is good
        // news for whoever holds it and nothing at all to everyone else, and
        // an app that tints it sage has taken a position on whether you should.
      ),
      indicatorCard(
        trends,
        articles,
        'eth',
        'where crypto settles',
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
