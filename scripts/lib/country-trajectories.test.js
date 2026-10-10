// A country's four trajectories: the sentences, and the series they are drawn
// from.
//
// The sentences are thresholds over two numbers and a year, and the failure
// they have already had once is naming a year the series does not hold: the
// app says "since 2000" of a series that begins in 2008. So the year is read
// off the observation actually used, and the bundled data is swept to hold it.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { bundleIsland, scratchDir } from './island-bundle.js'
import { ROOT } from './paths.js'

const dir = scratchDir('country-trajectories')
const { trajectoryCards, formatTrajectory } = await import(
  await bundleIsland(dir, 'shared/countries/country-trajectories.ts', 'trajectories.mjs')
)
const DATA = JSON.parse(readFileSync(join(ROOT, 'shared/data/country-cards.json'), 'utf8'))

const years = (from, values) => values.map((v, i) => [from + i, v])
const card = (data, key, world = {}) => trajectoryCards(data, world).find((c) => c.key === key)

test('income is said against the year it was measured from', () => {
  const since = (from, values) => card({ economy: { gdpPerCapita: years(from, values) } }, 'momentum').subtitle
  // 2000 is in the series: the app's own sentences.
  assert.match(since(2000, [100, 200, 450]), /^Quadrupled since 2000\. GDP per head in 2002/)
  assert.match(since(2000, [100, 260]), /^Tripled since 2000\./)
  assert.match(since(2000, [100, 180]), /^Roughly doubled since 2000\./)
  assert.match(since(2000, [100, 130]), /^Up 30% since 2000\./)
  assert.match(since(2000, [100, 95]), /^Roughly flat since 2000\./)
  assert.match(since(2000, [100, 60]), /^Down 40% since 2000\./)
  // It is not: the nearest year is the base, and the sentence says which.
  assert.match(since(2008, [100, 180]), /^Roughly doubled since 2008\./)
  // One year of data is a figure with nothing to be measured from, and no line.
  assert.equal(card({ economy: { gdpPerCapita: [[2024, 500]] } }, 'momentum'), undefined)
  assert.equal(card({ economy: { gdpPerCapita: years(2000, [900, 1234.5]) } }, 'momentum').headline, '$1,235')
})

test('births are placed against replacement, and against where they were', () => {
  const of = (from, values) => card({ demography: { fertility: years(from, values) } }, 'demography')
  assert.equal(of(1980, [7.8, 5.9]).headline, '5.9 children per woman')
  assert.match(of(1980, [7.8, 5.9]).subtitle, /^High fertility.* Fell from 7\.8 in 1980\.$/)
  assert.match(of(1990, [6.8, 3.3]).subtitle, /Fell from 6\.8 in 1990\.$/, 'the year the series starts, not 1980')
  assert.match(of(1980, [2.0, 2.0]).subtitle, /^Near replacement \(2\.1\)/)
  assert.doesNotMatch(of(1980, [2.0, 2.0]).subtitle, /Fell|Rose/, 'under a child of change is not a sentence')
  assert.match(of(1980, [1.9, 1.2]).subtitle, /^Far below replacement/)
  assert.deepEqual(of(1980, [7.8, 5.9]).reference, { value: 2.1, label: 'replacement' })
})

test('complexity is a rank, and prices say their year', () => {
  const complex = (rankFrom, ranks) =>
    card({ complexity: { eci: years(1995, ranks.map(() => 0.5)), eciRank: years(rankFrom, ranks) } }, 'complexity')
  assert.equal(complex(1995, [40, 12]).headline, '#12')
  assert.match(complex(1995, [40, 12]).subtitle, /^A major climb.*from #40 in 1995\.$/)
  assert.match(complex(1995, [12, 40]).subtitle, /^Slipping.*from #12 in 1995\.$/)
  assert.match(complex(1995, [10, 9]).subtitle, /^Holding a top-tier export basket since 1995\.$/)
  assert.match(complex(2003, [60, 62]).subtitle, /^Roughly steady in the rankings since 2003\.$/)
  // Not ranked is no card, not a card that says so.
  assert.equal(card({ complexity: { eci: years(1995, [0.1, 0.2]) } }, 'complexity'), undefined)

  const prices = card(
    { economy: { inflation: years(2022, [9, 12, 58.5]) } },
    'prices',
    { economy: { inflation: years(2022, [8, 5, 3.1]) } },
  )
  assert.equal(prices.headline, '58.5%')
  assert.equal(prices.subtitle, 'A year’s rise in consumer prices, in 2024. The world’s median was 3.1%.')
  assert.deepEqual(prices.world, [8, 5, 3.1])
  assert.equal(formatTrajectory('percent', 23773), '23,773%')
  assert.equal(formatTrajectory('percent', -1.2), '−1.2%')
  assert.equal(formatTrajectory('index', -0.83), '−0.83')
  assert.equal(formatTrajectory('usd', 57_100), '$57.1K')
  assert.equal(formatTrajectory('births', Number.NaN), '—')
})

test('a missing year is a gap in the line, not a join across it', () => {
  const c = card(
    { economy: { gdpPerCapita: [[2000, 100], [2001, 110], [2004, 150]] } },
    'momentum',
    { economy: { gdpPerCapita: [[2000, 1000], [2004, 1400]] } },
  )
  assert.deepEqual(c.periods, ['2000', '2001', '2002', '2003', '2004'])
  assert.deepEqual(c.values.map((v) => (Number.isFinite(v) ? v : null)), [100, 110, null, null, 150])
  assert.deepEqual(c.world, [1000, null, null, null, 1400])
})

test('every bundled country yields cards the chart can draw, inside their scales', () => {
  let cards = 0
  for (const [iso2, data] of Object.entries(DATA.byIso2)) {
    for (const c of trajectoryCards(data, DATA.global)) {
      cards++
      assert.equal(c.periods.length, c.values.length, `${iso2} ${c.key}: a label for every year`)
      assert.equal(c.world.length, c.values.length, `${iso2} ${c.key}: the world's line is parallel`)
      assert.ok(c.values.filter(Number.isFinite).length >= 2, `${iso2} ${c.key}: enough to be a line`)
      assert.ok(c.headline && c.subtitle && c.source, `${iso2} ${c.key}: a card says what it is`)
      // Never a year the series does not hold.
      for (const named of c.subtitle.match(/(?:since|in) (\d{4})/g) ?? []) {
        assert.ok(c.periods.includes(named.slice(-4)), `${iso2} ${c.key} names ${named}, outside ${c.periods[0]}–${c.periods.at(-1)}`)
      }
      // A fixed scale holds everything it is fixed for, or a country is drawn
      // off the plot: three sat under the app's -3.
      if (c.domain) {
        for (const v of c.values) {
          if (Number.isFinite(v)) assert.ok(v >= c.domain[0] && v <= c.domain[1], `${iso2} ${c.key}: ${v} is outside the scale`)
        }
      }
    }
  }
  assert.ok(cards > 500, `only ${cards} cards from ${Object.keys(DATA.byIso2).length} countries`)
  assert.deepEqual(trajectoryCards(undefined, DATA.global), [])
})

test('a built country page draws each trajectory against the world, complete without script', (t) => {
  const pages = join(ROOT, 'dist/country')
  if (!existsSync(pages) || !existsSync(join(pages, 'SE.html'))) {
    t.skip('dist/country not built')
    return
  }
  const html = readFileSync(join(pages, 'SE.html'), 'utf8')
  const cards = [...html.matchAll(/<article class="country-trajectory">([\s\S]*?)<\/article>/g)].map((m) => m[1])
  assert.equal(cards.length, 4, 'Sweden has all four series')
  for (const c of cards) {
    assert.equal((c.match(/class="chart-compare"/g) ?? []).length, 1, 'one line for the world')
    assert.match(c, /class="chart-table"/, 'and the numbers, in a table, for a reader with no script or no sight')
  }
  // The rule is a threshold: drawn, and no percentage taken against it.
  assert.match(cards[3], /class="chart-ref"/)
  assert.doesNotMatch(cards[3], /% vs replacement/)
  // Under what is counted there, above the table of ranks.
  // (By the elements: the page inlines its stylesheet, which names both.)
  assert.ok(html.indexOf('class="country-trajectories"') < html.indexOf('class="country-metrics"'))
  // A country with no series has no section, not an empty one.
  const none = readdirSync(pages).find((f) => !/class="country-trajectory"/.test(readFileSync(join(pages, f), 'utf8')))
  if (none) assert.doesNotMatch(readFileSync(join(pages, none), 'utf8'), /class="country-trajectories"/)
})
