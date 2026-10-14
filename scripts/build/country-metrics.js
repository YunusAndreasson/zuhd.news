// Per-metric country payloads for the map's land tint.
//
// The country pages already render all 27 metrics as text, ranked, one country
// at a time. This emits the same numbers arranged the other way round — one
// file per metric, every country in it — so the map can colour the whole world
// by a single dimension and let the reader compare rather than look up.
//
// One file per metric rather than one big table: the map holds exactly one
// metric at a time, and 27 metrics × ~150 countries in a single payload would
// be ~27× more bytes than any reader ever needs. These are fetched on demand,
// so only the default metric costs anything at first paint.
//
// Reads the same datasets as scripts/build/country-pages.js via the same
// esbuild-on-import wrapper; adds no data of its own.

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadShared } from './shared-ts.js'

/**
 * Where each country's value sits on the land ramp, 0 (darkest) to 1 (lightest).
 *
 * This used to be a percentile — position in the sorted order rather than
 * position on the scale. It was chosen to stop skewed metrics pinning every
 * country at the ramp's floor, which is a real problem correctly identified,
 * but rank is the wrong instrument for it and it cost more than it bought:
 *
 *   - Percentile is uniform *by construction*, so exactly a fifth of the world
 *     landed in each fifth of the ramp on all twenty-seven metrics. The
 *     histogram of tones on screen was therefore identical whichever metric was
 *     showing; only which country held which tone changed. A reader flipping
 *     through the picker saw the same picture rearranged, which is not what
 *     "shade the world by a number" promises.
 *
 *   - It mis-calibrated in opposite directions on the two families. Measured
 *     over the built payloads: the light half of the ramp covered 14.5% of the
 *     value range on adult literacy — half the visible lightness spent on
 *     90%→100%, so Oman at 97% read as a different kind of country from Lesotho
 *     at 90% — and 99.7% of it on GDP, where the entire story from $72B to
 *     $27.3T was crushed into the top two stops while the dark half carefully
 *     distinguished $1B from $72B.
 *
 * So the position is now the value itself, on the scale the metric is actually
 * read in — `METRICS[key].scale`, an editorial field, `'linear'` for bounded
 * indices and rates and `'log'` for counts, money and long-tailed rates. Log
 * keeps ratios legible (China's 899K articles against Vietnam's 11K) without
 * flattening them to adjacent ranks; linear lets a bunched distribution look
 * bunched, which on literacy or internet access is the fact worth showing.
 *
 * The direction is the `ascending` flag, which already means "lower is better"
 * for the three metrics that carry it. It now turns the ramp around too, so
 * Norway is the lightest country on press freedom rather than the darkest —
 * the picker says "press freedom" and the ramp had been painting Eritrea as the
 * brightest example of it. On the twenty-four metrics without the flag the ramp
 * still means "more of the named thing", and the legend prints the values at
 * both ends so the direction is read off the scale rather than inferred.
 *
 * Zeros are floored to the smallest positive value in the set before the log,
 * which puts them at the bottom of the ramp — where a zero belongs. Costa Rica
 * spends $0 on its military and Brunei hosts no refugees; both are the darkest
 * tone, alongside the smallest non-zero country, and that is the truth.
 *
 * The ends are the values at the `RAMP_CLIP` percentiles, not the extremes,
 * and anyone past an end takes its tone. With the extremes, one outlier set
 * the floor: Greenland's 57K people held the darkest tone alone, and 80% of
 * countries shared a 1.38:1 band. The tone is still the value on the metric's
 * scale; only the few countries beyond each end are tied there, and the legend
 * says so (`≤`, `≥`).
 */
export const RAMP_CLIP = 0.02

export const rampPositions = (entries, { scale, ascending }) => {
  const out = new Map()
  if (!entries.length) return { positions: out, low: null, high: null }

  // `Math.min(...xs)` blows the stack somewhere in the tens of thousands of
  // arguments. These sets are ~170 long, but the reduce costs nothing and this
  // file should not acquire a size limit nobody would think to look for.
  const smallestPositive = entries.reduce(
    (m, e) => (e.numeric > 0 && e.numeric < m ? e.numeric : m),
    Number.POSITIVE_INFINITY,
  )
  const floor = Number.isFinite(smallestPositive) ? smallestPositive : 1
  const project =
    scale === 'log' ? (n) => Math.log(Math.max(n, floor)) : (n) => n

  const projected = entries.map((e) => project(e.numeric))
  const order = entries
    .map((e, i) => ({ e, x: projected[i] }))
    .sort((a, b) => a.x - b.x || a.e.numeric - b.e.numeric)
  const last = order.length - 1
  const lo = order[Math.round(RAMP_CLIP * last)].x
  const hi = order[Math.round((1 - RAMP_CLIP) * last)].x
  const span = hi - lo

  entries.forEach((e, i) => {
    // A metric where every country reports the same figure has no scale to
    // place anyone on; the floor is the honest answer rather than a divide by
    // zero. Nothing in the corpus does this, but a future single-value series
    // would, and it would do it silently.
    const q = span > 0 ? Math.min(1, Math.max(0, (projected[i] - lo) / span)) : 0
    out.set(e.name, ascending ? 1 - q : q)
  })
  // Each end is named by the figure that bounds everyone sharing its tone: the
  // largest at the dark end, the smallest at the light. A floored zero shares
  // the floor with the smallest positive figure, so it never names the end.
  // `beyond` is whether anyone in that group has another figure.
  const atLow = order.filter((o) => o.x <= lo)
  const atHigh = order.filter((o) => o.x >= hi)
  const lowEnd = atLow[atLow.length - 1].e
  const highEnd = atHigh[0].e
  return {
    positions: out,
    low: { entry: lowEnd, beyond: atLow.some((o) => o.e.numeric !== lowEnd.numeric) },
    high: { entry: highEnd, beyond: atHigh.some((o) => o.e.numeric !== highEnd.numeric) },
  }
}

export const buildCountryMetrics = async ({ distDir }) => {
  const [{ METRICS, getRanking }, { codeFromTopojsonName }] = await Promise.all([
    loadShared('countries/country-ranking.ts'),
    loadShared('countries/iso.ts'),
  ])

  const outDir = join(distDir, 'api', 'metric')
  mkdirSync(outDir, { recursive: true })

  const index = []
  for (const [key, meta] of Object.entries(METRICS)) {
    // getRanking() is already sorted by the metric's editorial direction, so
    // index 0 is rank #1 as METRICS documents it. The percentile is computed
    // from `numeric` independently — see percentiles() above.
    const ranked = getRanking(key)

    // Resolve to ISO2 *before* placing anyone on the ramp.
    //
    // `r` and `total` describe the full ranking, because that is what the
    // country page prints and the two surfaces have to agree. `p` is a
    // different quantity for a different job: it positions a country within the
    // set the map can actually draw, so it is computed over exactly that set.
    //
    // Computing it over the full ranking instead leaves the ends of the ramp
    // unreachable — the least populous entry in COUNTRY_DATA is Antarctica,
    // which has no ISO2 and is never drawn, so p=0 went to nobody and the
    // darkest tone was never used by any country on screen.
    const routable = []
    let skipped = 0
    ranked.forEach((entry, idx) => {
      const iso2 = codeFromTopojsonName(entry.name)
      if (!iso2) {
        skipped++
        return
      }
      routable.push({ ...entry, iso2, rank: idx + 1 })
    })

    const ascending = meta.ascending === true
    const scale = meta.scale
    const { positions: p, low, high } = rampPositions(routable, { scale, ascending })

    const values = {}
    for (const entry of routable) {
      values[entry.iso2] = {
        p: Number(p.get(entry.name).toFixed(4)),
        v: entry.value,
        r: entry.rank,
      }
    }

    /**
     * The values at the two ends of the ramp, formatted as the country pages
     * print them, in the order the legend draws the gradient.
     *
     * A gradient with nothing written on it is a scale with no units, and prose
     * alone cannot carry the direction on the three metrics that turn the ramp
     * around. Printing both ends says which way it runs and how much of a thing
     * a shade is worth.
     *
     * An end is the value where its tone begins, from `rampPositions`, the
     * same set `p` is placed on. Where countries lie past it the label says so,
     * `≤` at the low end and `≥` at the high, since they share that tone.
     */
    const label = (end, sign) => (end ? `${end.beyond ? sign : ''}${end.entry.value}` : '')
    const ends = ascending
      ? { dark: label(high, '≥ '), light: label(low, '≤ ') }
      : { dark: label(low, '≤ '), light: label(high, '≥ ') }

    writeFileSync(
      join(outDir, `${key}.json`),
      JSON.stringify({
        key,
        label: meta.label,
        description: meta.description ?? '',
        source: meta.source ?? '',
        sourceUrl: meta.sourceUrl ?? '',
        ascending,
        scale,
        domain: { dark: ends.dark, light: ends.light },
        total: ranked.length,
        values,
      }),
    )

    index.push({
      key,
      label: meta.label,
      count: Object.keys(values).length,
      skipped,
    })
  }

  // One small index so the picker can be built without fetching 27 files.
  writeFileSync(join(outDir, 'index.json'), JSON.stringify({ metrics: index }))

  return { count: index.length, index }
}
