// A country's four trajectories, each as a headline, a sentence and a line
// against the world's median: how complex its exports are, what its people
// earn, what its prices are doing, and how many children are born.
//
// The series are `shared/data/country-cards.json` (the Harvard Growth Lab's
// Atlas and the World Bank), annual and refreshed by hand. This module is what
// turns them into words, and it takes the data as arguments so the site's
// build and the app can both call it.
//
// The app wrote these sentences first, inside its card components
// (`mobile/components/country-cards/*`), and still carries them there. Two
// things are deliberately different here. A sentence names the year it was
// measured from: the app says "since 2000" of a series that starts in 2008
// (Kosovo, South Sudan), and "in 1980" of one that starts in 1990
// (Palestine). And the complexity chart's scale reaches -4, because three
// countries sit below the app's -3 and were drawn under the plot.

export type YearValue = [year: number, value: number]

export interface CountryCardData {
  economy?: { gdpPerCapita?: YearValue[]; inflation?: YearValue[] }
  demography?: { fertility?: YearValue[]; population?: YearValue[] }
  complexity?: { eci?: YearValue[]; eciRank?: YearValue[] }
}

export interface GlobalBenchmarks {
  economy?: { gdpPerCapita?: YearValue[]; inflation?: YearValue[] }
  demography?: { fertility?: YearValue[] }
  complexity?: { eci?: YearValue[] }
}

/** How a card's values are printed. A name, so it can travel in JSON to the
 *  island that redraws the chart; `formatTrajectory` resolves it. */
export type TrajectoryFormat = 'index' | 'usd' | 'percent' | 'births'

export interface TrajectoryCard {
  key: 'complexity' | 'momentum' | 'prices' | 'demography'
  eyebrow: string
  headline: string
  subtitle: string
  source: string
  /** One label a year, first to last, with no year left out. */
  periods: string[]
  /** The country's series, `NaN` in a year it has no figure for. */
  values: number[]
  /** The world's median for the same years. */
  world: Array<number | null>
  format: TrajectoryFormat
  /** A fixed scale, where countries are meant to be compared card to card. */
  domain?: [number, number]
  reference?: { value: number; label: string }
  /** What the chart draws, for the table's caption and a screen reader. */
  label: string
  /**
   * How a year's change from the year before is stated in the table. A rate of
   * inflation and an index either side of zero move in points; a percentage of
   * either is a number about nothing.
   */
  change: 'percent' | 'points'
}

const latest = (series: YearValue[] | undefined): YearValue | null =>
  series?.[series.length - 1] ?? null

/** The observation nearest a year. The caller says which year it got. */
const near = (series: YearValue[] | undefined, year: number): YearValue | null => {
  let best: YearValue | null = null
  for (const p of series ?? []) {
    if (!best || Math.abs(p[0] - year) < Math.abs(best[0] - year)) best = p
  }
  return best
}

const grouped = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

const usd = (n: number): string => {
  if (n >= 100_000) return `$${Math.round(n / 1000)}K`
  if (n >= 10_000) return `$${(n / 1000).toFixed(1)}K`
  if (n >= 1_000) return `$${grouped(n)}`
  return `$${Math.round(n)}`
}

/** A year's price rise: `58.5%`, `220%` past a hundred, a true minus for a fall. */
const percent = (pct: number): string => {
  const size = Math.abs(pct) >= 100 ? grouped(Math.abs(pct)) : Math.abs(pct).toFixed(1)
  return `${pct < 0 ? '−' : ''}${size}%`
}

/** A value as its card prints it, by the card's `format`. */
export const formatTrajectory = (format: TrajectoryFormat, v: number): string => {
  if (!Number.isFinite(v)) return '—'
  if (format === 'usd') return usd(v)
  if (format === 'percent') return percent(v)
  if (format === 'births') return v.toFixed(1)
  // The complexity index runs either side of zero: a true minus, as the
  // percentages print theirs.
  return `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`
}

/**
 * The series laid out one value a year from its first year to its last, with
 * the world's median beside it, so a gap in either is a gap and not a join.
 */
const aligned = (series: YearValue[], world: YearValue[] | undefined) => {
  const first = series[0]
  const last = series[series.length - 1]
  if (!first || !last) return null
  const own = new Map(series)
  const median = new Map(world ?? [])
  const periods: string[] = []
  const values: number[] = []
  const medians: Array<number | null> = []
  for (let year = first[0]; year <= last[0]; year++) {
    periods.push(String(year))
    values.push(own.get(year) ?? Number.NaN)
    medians.push(median.get(year) ?? null)
  }
  // A line needs two observations; one figure is a headline with no card.
  return values.filter(Number.isFinite).length >= 2 ? { periods, values, world: medians } : null
}

function complexity(data: CountryCardData, world: GlobalBenchmarks): TrajectoryCard | null {
  const eci = data.complexity?.eci
  const rank = latest(data.complexity?.eciRank)
  const line = eci ? aligned(eci, world.complexity?.eci) : null
  if (!eci || !rank || !line) return null

  const was = near(data.complexity?.eciRank, 1995)
  let subtitle = 'Rank among the world’s exporters by how sophisticated the export basket is.'
  if (was && was[0] !== rank[0]) {
    const climbed = was[1] - rank[1]
    const from = `from #${was[1]} in ${was[0]}`
    if (climbed >= 20) subtitle = `A major climb in export sophistication, ${from}.`
    else if (climbed >= 8) subtitle = `Climbing the complexity rankings, ${from}.`
    else if (climbed <= -20) subtitle = `Slipping in export sophistication, ${from}.`
    else if (climbed <= -8) subtitle = `Sliding in the complexity rankings, ${from}.`
    else if (rank[1] <= 15) subtitle = `Holding a top-tier export basket since ${was[0]}.`
    else subtitle = `Roughly steady in the rankings since ${was[0]}.`
  }
  return {
    key: 'complexity',
    eyebrow: 'economic complexity',
    headline: `#${rank[1]}`,
    subtitle,
    source: 'Harvard Growth Lab',
    ...line,
    format: 'index',
    // One scale for every country, so two pages can be compared. The index
    // runs from Chad's -3.53 to Japan's 2.3.
    domain: [-4, 3],
    label: 'Economic complexity index',
    change: 'points',
  }
}

function momentum(data: CountryCardData, world: GlobalBenchmarks): TrajectoryCard | null {
  const series = data.economy?.gdpPerCapita
  const now = latest(series)
  const line = series ? aligned(series, world.economy?.gdpPerCapita) : null
  if (!now || !line) return null

  // What the figure is, and of which year: the series is annual, and for a few
  // countries it ends long ago (Eritrea's in 2011).
  const basis = `GDP per head in ${now[0]}, in current US dollars.`
  const then = near(series, 2000)
  let trend = ''
  if (then && then[0] !== now[0] && then[1] > 0) {
    const ratio = now[1] / then[1]
    const since = `since ${then[0]}`
    if (ratio >= 4) trend = `Quadrupled ${since}.`
    else if (ratio >= 2.5) trend = `Tripled ${since}.`
    else if (ratio >= 1.7) trend = `Roughly doubled ${since}.`
    else if (ratio >= 1.2) trend = `Up ${Math.round((ratio - 1) * 100)}% ${since}.`
    else if (ratio >= 0.85) trend = `Roughly flat ${since}.`
    else trend = `Down ${Math.round((1 - ratio) * 100)}% ${since}.`
  }
  return {
    key: 'momentum',
    eyebrow: 'economic momentum',
    headline: usd(now[1]),
    subtitle: trend ? `${trend} ${basis}` : basis,
    source: 'World Bank',
    ...line,
    format: 'usd',
    label: 'GDP per head, current US dollars',
    change: 'percent',
  }
}

function prices(data: CountryCardData, world: GlobalBenchmarks): TrajectoryCard | null {
  const series = data.economy?.inflation
  const now = latest(series)
  const line = series ? aligned(series, world.economy?.inflation) : null
  if (!now || !line) return null
  // The year is always said. The series is annual, so the newest figure is a
  // year or two old, and for a few countries much older: without the year it
  // reads as today's.
  const median = world.economy?.inflation?.find(([year]) => year === now[0])
  return {
    key: 'prices',
    eyebrow: 'prices',
    headline: percent(now[1]),
    subtitle: `A year’s rise in consumer prices, in ${now[0]}.${
      median ? ` The world’s median was ${percent(median[1])}.` : ''
    }`,
    source: 'World Bank',
    ...line,
    format: 'percent',
    label: 'Consumer price inflation, percent a year',
    change: 'points',
  }
}

function demography(data: CountryCardData, world: GlobalBenchmarks): TrajectoryCard | null {
  const series = data.demography?.fertility
  const now = latest(series)
  const line = series ? aligned(series, world.demography?.fertility) : null
  if (!now || !line) return null

  const rate = now[1]
  let subtitle: string
  if (rate >= 4.5) subtitle = 'High fertility: the population is still expanding fast.'
  else if (rate >= 2.5) subtitle = 'Above replacement: still growing.'
  else if (rate >= 1.9) subtitle = 'Near replacement (2.1): the population is stabilising.'
  else if (rate >= 1.5) subtitle = 'Below replacement: shrinking in the long run unless migration offsets it.'
  else subtitle = 'Far below replacement: rapid ageing ahead.'
  const then = near(series, 1980)
  if (then && then[0] !== now[0] && Math.abs(then[1] - rate) > 1) {
    subtitle += ` ${rate < then[1] ? 'Fell' : 'Rose'} from ${then[1].toFixed(1)} in ${then[0]}.`
  }
  return {
    key: 'demography',
    eyebrow: 'demographic curve',
    headline: `${rate.toFixed(1)} children per woman`,
    subtitle,
    source: 'World Bank',
    ...line,
    format: 'births',
    reference: { value: 2.1, label: 'replacement' },
    label: 'Children born per woman',
    change: 'percent',
  }
}

/**
 * The cards a country has, in the order the app shows them. One it has no
 * series for is left out: a card that says "no data" is a heading over nothing.
 */
export function trajectoryCards(
  data: CountryCardData | null | undefined,
  world: GlobalBenchmarks,
): TrajectoryCard[] {
  if (!data) return []
  return [complexity, momentum, prices, demography]
    .map((build) => build(data, world))
    .filter((card): card is TrajectoryCard => card !== null)
}
