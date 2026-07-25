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

import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { loadShared } from './shared-ts.js'

/**
 * Percentile position of every value in its own distribution.
 *
 * Deliberately *not* derived from `getRanking`'s ordering. That ordering
 * encodes an editorial direction — the `ascending` flag flips three metrics so
 * "better" sorts first — and the direction is only meaningful for the metrics
 * that have one. `population` and `area` have no better end; `refugeesProduced`
 * and `co2PerCapita` sort with their *worst* end first because they carry no
 * flag. Colouring by that ordering would mean light-is-bad on some metrics,
 * light-is-good on others, and light-is-meaningless on the rest.
 *
 * So the ramp encodes magnitude and nothing else: `p = 1` is the largest value
 * of whatever the metric measures. Which end is desirable is a sentence, and
 * `METRICS[key].description` already writes it ("0–100; LOWER = freer").
 *
 * Percentile rather than linear because these distributions are heavily skewed
 * — population and GDP span four orders of magnitude, and a linear ramp would
 * leave all but a handful of countries pinned at the floor. This is the same
 * reasoning that put beacon size on a percentile of `eventCoverage`.
 *
 * Ties share the lower position, so two countries with the same value cannot
 * be given different shades.
 */
const percentiles = (entries) => {
  const sorted = [...entries].sort((a, b) => a.numeric - b.numeric)
  const n = sorted.length
  const out = new Map()
  // Single-country metrics would divide by zero; give the lone value the top.
  if (n === 1) return out.set(sorted[0].name, 1), out
  let i = 0
  while (i < n) {
    let j = i
    while (j + 1 < n && sorted[j + 1].numeric === sorted[i].numeric) j++
    const p = i / (n - 1)
    for (let k = i; k <= j; k++) out.set(sorted[k].name, p)
    i = j + 1
  }
  return out
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

    // Resolve to ISO2 *before* computing percentiles.
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

    const p = percentiles(routable)

    const values = {}
    for (const entry of routable) {
      values[entry.iso2] = {
        p: Number(p.get(entry.name).toFixed(4)),
        v: entry.value,
        r: entry.rank,
      }
    }

    writeFileSync(
      join(outDir, `${key}.json`),
      JSON.stringify({
        key,
        label: meta.label,
        description: meta.description ?? '',
        source: meta.source ?? '',
        sourceUrl: meta.sourceUrl ?? '',
        ascending: meta.ascending === true,
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
