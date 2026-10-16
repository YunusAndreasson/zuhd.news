// Country page builder: emits /country/{ISO2}.html for every ISO-2 in
// shared/countries/iso.ts that also has CountryData. Reads the same
// datasets mobile's CountrySheet reads via @shared/countries/*.
// ~130 pages, each showing flag, capital/region/languages, a 26-metric
// block with percentile strips and rankings, and recent articles
// datelined in the country (best-effort lat/lng → country resolution).
//
// Since the build is Node and /shared/* is TypeScript, we transpile on
// import via a small esbuild wrapper in scripts/build/shared-ts.js.

import { countryHazards } from '../lib/country-hazards.js'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { largestPolygonCentroid } from '../lib/geo-point.js'
import { buildCountryOgPng } from '../lib/og-image.js'
import { escHtml } from '../lib/html.js'
import { footerStatusLine } from '../lib/site-chrome.js'
import { listRow } from '../lib/list-row.js'
import { loadShared } from './shared-ts.js'
import { ROOT } from '../lib/paths.js'


/**
 * One row in the metric list: label · value · rank strip · source.
 *
 * `rankStrip` is passed in rather than imported, because this module is loaded
 * before the esbuild wrapper has had a chance to transpile anything and the
 * page builder is already `async` for exactly that reason.
 *
 * The strip is `aria-hidden`: the rank it encodes is printed in full in the
 * next cell, so announcing it twice makes a 26-row table read as 52 facts. It
 * used to carry an `aria-label` of its own, which is what produced that.
 */
const renderMetricRow = (rankStrip, meta, value, rank, total) => {
  const strip = rankStrip(rank, total)
  const source = meta.source ? escHtml(meta.source) : ''
  return `
    <li class="metric-row">
      <div class="metric-label">${escHtml(meta.label)}</div>
      <div class="metric-value t-tabular">${escHtml(value ?? '—')}</div>
      <div class="metric-strip" aria-hidden="true">
        <span class="metric-strip-fill" style="--fill:${strip.css}"></span>
      </div>
      <div class="metric-rank t-tabular">${escHtml(strip.text)}</div>
      ${source ? `<div class="metric-source t-source-host">${source}</div>` : ''}
    </li>`
}

/**
 * What the hazard sources count in this country, above its metrics: its people
 * in crisis or worse, its last reported week of conflict, and the alerts on it.
 *
 * Statements, each with whose count it is and of when, because both of the
 * first two are old when they are read. Nothing at all for a country none of
 * the three sources names: an empty section would be a heading over the
 * absence of a famine.
 *
 * @param {import('../lib/country-hazards.js').CountryHazards | undefined} h
 * @param {any} FACTS `shared/countries/country-facts.ts`
 */
const hazardsHtml = (h, FACTS) => {
  if (!h) return ''
  const fact = (label, title, detail) =>
    `<div class="country-fact">
        <dt class="label">${escHtml(label)}</dt>
        <dd>
          <p class="country-fact-title">${escHtml(title)}</p>
          ${detail ? `<p class="t-caption country-fact-detail">${escHtml(detail)}</p>` : ''}
        </dd>
      </div>`
  const rows = []
  if (h.hunger) {
    const line = FACTS.hungerLine(h.hunger)
    rows.push(fact('hunger', line.title, line.detail))
  }
  if (h.conflict) {
    rows.push(
      fact(
        'conflict',
        FACTS.conflictLine(h.conflict),
        `${FACTS.weekWindow(h.conflict.windowStart, h.conflict.windowEnd)}, the latest week from UCDP`,
      ),
    )
  }
  if (h.alerts.length) {
    // Orange and Red by name. Green is the level of an earthquake nobody felt,
    // and Papua New Guinea holds twenty-two of them: counted beside a graver
    // alert, and on their own not a reason for the section to exist.
    const lower = h.lowerAlerts
      ? `and ${FACTS.formatCount(h.lowerAlerts)} at the lowest level`
      : ''
    rows.push(
      fact(
        'alerts',
        h.alerts.map((a) => `${a.name} (${a.level.toLowerCase()})`).join(' · '),
        [lower, 'GDACS'].filter(Boolean).join(' · '),
      ),
    )
  }
  if (!rows.length) return ''
  return `<section class="country-facts" aria-label="Hunger, conflict and alerts">
        <dl class="country-fact-list">
          ${rows.join('\n')}
        </dl>
      </section>`
}

/** JSON for an inline `<script>`: `<` escaped, so no value can close the tag. */
const chartSource = (data) => JSON.stringify(data).replace(/</g, '\\u003c')

/**
 * A country's trajectories: where it stands and how it got there, each against
 * the world's median.
 *
 * One column on every width, a card under a card. The chart's type is in
 * viewBox units, so two cards side by side on a desktop would print their axes
 * at half size. Each card is a label, a figure, a sentence and the one chart the
 * site has (`seriesModel`): the country's line with the world's thin beside it,
 * and for births the replacement rate as its rule. The page is complete with
 * no script; the numbers under each chart are in its table. With one, the
 * `series-chart` island replaces each figure with the same chart and a cursor:
 * the options it is built from ride beside the figure, as the options the
 * figure itself was built with.
 *
 * @param {any[]} cards `trajectoryCards` for this country
 * @param {any} TRAJECTORIES `shared/countries/country-trajectories.ts`
 * @param {any} CHART `shared/chart/series.ts`
 */
const trajectoriesHtml = (cards, TRAJECTORIES, CHART) => {
  const { seriesModel, staticFigure, renderMarkup } = CHART
  const drawn = cards
    .map((card) => {
      // One set of options for the figure here and the chart the island draws
      // over it. `format` is a name on both sides: a function cannot travel.
      const options = {
        comparison: { values: card.world, label: 'world median' },
        ...(card.domain ? { domain: card.domain } : {}),
        // A threshold, not a base: the readout takes no percentage against it.
        ...(card.reference
          ? {
              reference: card.reference.value,
              referenceLabel: card.reference.label,
              referenceChange: false,
            }
          : {}),
        format: card.format,
        change: card.change,
        step: 'years',
      }
      const model = seriesModel({
        values: card.values,
        periods: card.periods,
        ...options,
        formatValue: (v) => TRAJECTORIES.formatTrajectory(card.format, v),
        palette: 'neutral',
        label: card.label,
      })
      if (!model.ok) return ''
      const caption = [
        card.source,
        'thin line is the world’s median',
        card.reference ? `rule marks ${card.reference.label} (${card.reference.value})` : '',
      ]
        .filter(Boolean)
        .join(' · ')
      return `<article class="country-trajectory">
          <h3 class="label">${escHtml(card.eyebrow)}</h3>
          <p class="country-trajectory-headline">${escHtml(card.headline)}</p>
          <p class="t-caption country-trajectory-subtitle">${escHtml(card.subtitle)}</p>
          <div class="country-trajectory-chart" data-island-auto="series-chart">
            ${renderMarkup(staticFigure(model, { caption }))}
            <script type="application/json" class="chart-source">${chartSource({
              // `NaN` is not JSON: a year with no figure travels as `null`.
              values: card.values.map((v) => (Number.isFinite(v) ? v : null)),
              periods: card.periods,
              label: card.label,
              caption,
              options,
            })}</script>
          </div>
        </article>`
    })
    .filter(Boolean)
  if (!drawn.length) return ''
  return `<section class="country-trajectories">
        <h2 class="label section-title">Trajectories</h2>
        ${drawn.join('\n')}
      </section>`
}

/** Greedy point-in-country resolver using a naive bbox test against the
 *  topojson features. Fast enough for the few hundred datelined
 *  articles per build. Duplicates the logic in mobile's findCountry()
 *  without the nudge fallback — article coordinates are editor-chosen
 *  and generally land squarely inside borders. */
const resolveArticleCountry = (feat, countries, lat, lng) => {
  for (const f of countries.features) {
    const g = f.geometry
    if (!g) continue
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    const walk = (c) => {
      if (typeof c[0] === 'number') {
        if (c[0] < minX) minX = c[0]; if (c[0] > maxX) maxX = c[0]
        if (c[1] < minY) minY = c[1]; if (c[1] > maxY) maxY = c[1]
      } else for (const cc of c) walk(cc)
    }
    walk(g.coordinates)
    if (lng < minX || lng > maxX || lat < minY || lat > maxY) continue
    if (feat(f, [lng, lat])) return f.properties?.name ?? null
  }
  return null
}

/**
 * @param {{ sorted: any[], distDir: string, template: string,
 *           skipOg?: boolean,
 *           hazards?: { totals?: any[], conflict?: any, alerts?: any[] },
 *           shareRowHtml?: (target: string, title: string) => string }} opts
 *        `hazards` is what the build's hazard snapshots hold: the IPC's country
 *        totals, UCDP's week and the GDACS alerts. Passed in rather than read
 *        here, because build.js has just parsed all three.
 *        `template` arrives already resolved. This module used to read
 *        `country.html` and substitute `{{headCommon}}` and `{{v}}` itself,
 *        which was a second copy of build.js's `loadTemplate` that then had to
 *        be told about every new placeholder — the page furniture landed there
 *        first and this one would silently have emitted the literal
 *        `{{footerNav}}`.
 *        `shareRowHtml` is passed in rather than imported because build.js owns
 *        it; the default is a no-op for callers that do not want a share row.
 *        Its signature has to be declared here — a default of `() => ''` infers
 *        a zero-argument function, which makes the two real call sites read as
 *        passing two arguments too many.
 */
export const buildCountryPages = async ({
  sorted,
  distDir,
  template,
  shareRowHtml = () => '',
  skipOg = false,
  hazards = {},
}) => {
  const [
    { COUNTRY_DATA },
    { METRICS, getMetricValue, getRanking },
    { codeFromTopojsonName },
    { displayCountryName },
    { rankStrip },
    FACTS,
    TRAJECTORIES,
    CHART,
    { geoContains, geoCentroid, geoArea },
    { feature },
  ] = await Promise.all([
    loadShared('countries/country-data.ts'),
    // country-augmented.ts is deliberately not loaded here: country-ranking.ts
    // imports it directly, and the only thing this module ever did with it was
    // bind a variable that nothing read.
    loadShared('countries/country-ranking.ts'),
    loadShared('countries/iso.ts'),
    loadShared('place-names.ts'),
    loadShared('chart/rank-strip.ts'),
    loadShared('countries/country-facts.ts'),
    loadShared('countries/country-trajectories.ts'),
    loadShared('chart/series.ts'),
    import('d3-geo'),
    import('topojson-client'),
  ])

  const topo = JSON.parse(readFileSync(join(ROOT, 'shared', 'data', 'countries-110m.json'), 'utf8'))
  const countries = /** @type {import('geojson').FeatureCollection} */ (/** @type {unknown} */ (feature(topo, topo.objects.countries)))

  // Map datelined articles to their containing country (best-effort).
  // Linking lat/lng → country lets country pages surface real coverage.
  const articlesByCountry = {}
  for (const a of sorted) {
    if (a.meta.lat == null || a.meta.lng == null) continue
    const name = resolveArticleCountry(geoContains, countries, Number(a.meta.lat), Number(a.meta.lng))
    if (!name) continue
    // biome-ignore lint/suspicious/noAssignInExpressions: the (x ??= []) group-by idiom, in statement position. The rule is here for `if (a = b)`.
    ;(articlesByCountry[name] ??= []).push(a)
  }

  // Where each country's share card points its globe, keyed by the same raw
  // topojson name that indexes COUNTRY_DATA.
  const anchors = new Map()
  for (const f of countries.features) {
    const name = f.properties?.name
    if (!name || anchors.has(name)) continue
    const anchor = largestPolygonCentroid(f, geoCentroid, geoArea)
    if (anchor) anchors.set(name, anchor)
  }

  // What the hazard sources count in each country. Events are placed at 1:50m:
  // at 1:110m Gaza is too small to be a polygon and seventeen of its eighteen
  // events fell in no country at all.
  const topo50 = JSON.parse(readFileSync(join(ROOT, 'shared', 'data', 'countries-50m.json'), 'utf8'))
  const countries50 = /** @type {import('geojson').FeatureCollection} */ (/** @type {unknown} */ (feature(topo50, topo50.objects.countries)))
  const hazardsByCountry = countryHazards(hazards, {
    iso2At: (lat, lng) => {
      const name = resolveArticleCountry(geoContains, countries50, lat, lng)
      return name ? codeFromTopojsonName(name) : null
    },
    iso2OfName: (name) => codeFromTopojsonName(name),
  })

  // The annual series the trajectory cards are drawn from, by ISO2, and the
  // world's medians they are drawn against.
  const cardsData = JSON.parse(readFileSync(join(ROOT, 'shared', 'data', 'country-cards.json'), 'utf8'))

  mkdirSync(join(distDir, 'country'), { recursive: true })

  // Share cards, same content-hash disk cache the article cards use: country
  // data moves about once a year, so after the first build this is a file copy.
  const OG_CACHE_DIR = join(ROOT, '.cache', 'og-country')
  const OG_VERSION = 'v4' // bump when buildCountryOgSvg or rasterizeSvg changes
  if (!skipOg) {
    mkdirSync(OG_CACHE_DIR, { recursive: true })
    mkdirSync(join(distDir, 'api', 'og', 'country'), { recursive: true })
  }

  // Precompute rankings once per metric so the 130 × 26 = 3380 row
  // renders stay fast. getRanking() already caches internally, but
  // invoking it up-front makes the cost visible in one line of build log.
  const metricKeys = Object.keys(METRICS)
  const rankings = {}
  for (const m of metricKeys) rankings[m] = getRanking(m)

  const codes = []
  let emitted = 0
  let ogCached = 0
  let ogRendered = 0
  for (const [name, data] of Object.entries(COUNTRY_DATA)) {
    const iso2 = codeFromTopojsonName(name)
    // `name` stays the raw key — it indexes COUNTRY_DATA, COUNTRY_AUGMENTED and
    // the ranking tables. Only what the reader sees is corrected: Natural
    // Earth's cartographic abbreviations, and the names countries have since
    // chosen for themselves.
    const label = displayCountryName(name) ?? name
    if (!iso2) continue // country we can't route

    const metaLine = [
      data.capital,
      data.population ? `pop. ${data.population}` : null,
      data.languages,
      data.currency ? `${data.currency}` : null,
      data.landlocked ? 'landlocked' : null,
    ].filter(Boolean).join(' · ')

    // Per-metric {value, rank, total} for this country.
    const metricResults = metricKeys.map((m) => {
      const meta = METRICS[m]
      const value = getMetricValue(name, data, m)
      if (value == null) return null
      const ranks = rankings[m]
      const idx = ranks.findIndex((e) => e.name === name)
      // getRanking() has *already* applied the metric's direction — it reads
      // METRICS[m].ascending and sorts so that rank #1 lands at index 0. This
      // used to flip it a second time for ascending metrics, which inverted
      // exactly the three the flag exists to correct: the page claimed Eritrea
      // was rank 1 of 139 for press freedom and Colombia rank 1 of 117 for
      // Gini, i.e. it awarded first place to the least free and the least
      // equal. The position in the sorted list is the rank; nothing to flip.
      const rank = idx + 1
      return {
        key: m,
        meta,
        value,
        rank: idx >= 0 ? rank : null,
        total: ranks.length,
      }
    }).filter(Boolean)

    const metricRows = metricResults
      .map((r) => renderMetricRow(rankStrip, r.meta, r.value, r.rank, r.total))
      .join('\n')

    const hazardsSection = hazardsHtml(hazardsByCountry.get(iso2), FACTS)
    const trajectoriesSection = trajectoriesHtml(
      TRAJECTORIES.trajectoryCards(cardsData.byIso2?.[iso2], cardsData.global ?? {}),
      TRAJECTORIES,
      CHART,
    )

    const recent = articlesByCountry[name] || []
    const coverageSection = recent.length
      ? `<section class="country-coverage">
          <h2 class="label section-title">Recent coverage · ${recent.length}</h2>
          <ol class="country-coverage-list">
            ${recent.map((a) => `<li>${listRow({
              title: a.title,
              url: `/a/${a.slug}`,
              date: a.meta.date,
              dateFormatted: a.dateFormatted,
              category: a.meta.category || '',
              variant: 'date-title-category',
            })}</li>`).join('')}
          </ol>
        </section>`
      : ''

    // The best-ranked three, which is what the share card carries — a rank is
    // what turns a metric into something worth passing on.
    const topMetrics = metricResults
      .filter((r) => r.rank != null)
      .sort((a, b) => a.rank / a.total - b.rank / b.total)
      .slice(0, 3)
      .map((r) => ({ label: r.meta.label, value: r.value, rank: r.rank, total: r.total }))

    if (!skipOg) {
      const anchor = anchors.get(name) || null
      const inputs = {
        v: OG_VERSION,
        name: label,
        region: data.region || null,
        metaLine,
        metrics: topMetrics,
        lat: anchor?.lat ?? null,
        lng: anchor?.lng ?? null,
      }
      const key = createHash('sha1').update(JSON.stringify(inputs)).digest('hex')
      const cachePath = join(OG_CACHE_DIR, `${key}.png`)
      let png
      if (existsSync(cachePath)) {
        png = readFileSync(cachePath)
        ogCached++
      } else {
        png = buildCountryOgPng(inputs, 'light')
        writeFileSync(cachePath, png)
        ogRendered++
      }
      writeFileSync(join(distDir, 'api', 'og', 'country', `${iso2}.png`), png)
    }

    const html = template
      .replace(/{{name}}/g, escHtml(label))
      .replace(/{{description}}/g, escHtml(`${label} country profile: ${metaLine}. ${recent.length} recent articles on zuhd.news.`))
      .replace(/{{shareRow}}/g, shareRowHtml(`/country/${iso2}`, `${label} — zuhd.news`))
      .replace(/{{iso2}}/g, iso2)
      .replace(/{{region}}/g, escHtml((data.region || '').toUpperCase()))
      .replace(/{{flag}}/g, data.flag || '')
      .replace(/{{metaLine}}/g, escHtml(metaLine))
      .replace(/{{hazards}}/g, hazardsSection)
      .replace(/{{trajectories}}/g, trajectoriesSection)
      .replace(/{{metricRows}}/g, metricRows)
      .replace(/{{coverageSection}}/g, coverageSection)
      .replace(/{{footerStatus}}/g, footerStatusLine({ sources: 'REST Countries · World Bank · OWID' }))

    writeFileSync(join(distDir, 'country', `${iso2}.html`), html)

    // Lightweight JSON for the country-preview island — just what a hover/tap
    // sheet needs to render quickly. The full HTML page at /country/{iso2}
    // remains the deep-dive surface.
    const previewJson = {
      iso2,
      name: label,
      flag: data.flag || '',
      region: data.region || '',
      metaLine,
      // Top 6 metrics where this country has a meaningful rank (top quartile
      // bias), formatted for at-a-glance reading.
      highlights: metricResults
        .filter((r) => r.rank != null)
        .sort((a, b) => (a.rank / a.total) - (b.rank / b.total))
        .slice(0, 6)
        .map((r) => ({
          label: r.meta.label,
          value: r.value,
          rank: r.rank,
          total: r.total,
        })),
      // Every metric, in page order. The map's country card opens the full
      // profile over the map rather than navigating to /country/{iso2} — a
      // reader who clicked a country to find out about it should not lose the
      // view that prompted the question. This is what that card reads; the
      // standalone page stays canonical for shared links and crawlers.
      metrics: metricResults.map((r) => ({
        label: r.meta.label,
        value: r.value,
        rank: r.rank,
        total: r.total,
      })),
      coverage: recent.slice(0, 5).map((a) => ({
        slug: a.slug,
        title: a.title,
        dateFormatted: a.dateFormatted,
        category: a.meta.category || '',
      })),
    }
    mkdirSync(join(distDir, 'api', 'country'), { recursive: true })
    writeFileSync(join(distDir, 'api', 'country', `${iso2}.json`), JSON.stringify(previewJson))

    codes.push(iso2)
    emitted++
  }

  // By ISO2, for `/api/country-hazards.json`: the map's country card states
  // what the page's section states, from a file that turns over with the
  // snapshots rather than with `/api/country/*`'s day.
  return { count: emitted, codes, ogCached, ogRendered, hazards: Object.fromEntries(hazardsByCountry) }
}
