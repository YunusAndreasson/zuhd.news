// Country page builder: emits /country/{ISO2}.html for every ISO-2 in
// shared/countries/iso.ts that also has CountryData. Reads the same
// datasets mobile's CountrySheet reads via @shared/countries/*.
// ~130 pages, each showing flag, capital/region/languages, a 26-metric
// block with percentile strips and rankings, and recent articles
// datelined in the country (best-effort lat/lng → country resolution).
//
// Since the build is Node and /shared/* is TypeScript, we transpile on
// import via a small esbuild wrapper in scripts/build/shared-ts.js.

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { loadShared } from './shared-ts.js'

const ROOT = new URL('../..', import.meta.url).pathname

const escHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** One row in the metric list: label · value · rank strip · source. */
const renderMetricRow = (metric, meta, value, rank, total) => {
  const pct = rank && total ? (1 - (rank - 1) / Math.max(1, total - 1)) : null
  const stripFill = pct != null ? Math.max(0, Math.min(1, pct)) : 0
  const rankText = rank && total ? `${rank} of ${total}` : '—'
  const source = meta.source ? escHtml(meta.source) : ''
  return `
    <li class="metric-row">
      <div class="metric-label">${escHtml(meta.label)}</div>
      <div class="metric-value t-tabular">${escHtml(value ?? '—')}</div>
      <div class="metric-strip" aria-label="${rankText}">
        <span class="metric-strip-fill" style="--fill:${(stripFill * 100).toFixed(1)}%"></span>
      </div>
      <div class="metric-rank t-tabular">${escHtml(rankText)}</div>
      ${source ? `<div class="metric-source t-source-host">${source}</div>` : ''}
    </li>`
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

export const buildCountryPages = async ({ sorted, distDir, templatesDir, headCommon }) => {
  const [
    { COUNTRY_DATA },
    { COUNTRY_AUGMENTED },
    { METRICS, getMetricValue, getRanking, parseStat },
    { codeFromTopojsonName },
    { geoContains },
    { feature },
  ] = await Promise.all([
    loadShared('countries/country-data.ts'),
    loadShared('countries/country-augmented.ts'),
    loadShared('countries/country-ranking.ts'),
    loadShared('countries/iso.ts'),
    import('d3-geo'),
    import('topojson-client'),
  ])

  const topo = JSON.parse(readFileSync(join(ROOT, 'shared', 'data', 'countries-110m.json'), 'utf8'))
  const countries = feature(topo, topo.objects.countries)

  // Map datelined articles to their containing country (best-effort).
  // Linking lat/lng → country lets country pages surface real coverage.
  const articlesByCountry = {}
  for (const a of sorted) {
    if (a.meta.lat == null || a.meta.lng == null) continue
    const name = resolveArticleCountry(geoContains, countries, Number(a.meta.lat), Number(a.meta.lng))
    if (!name) continue
    ;(articlesByCountry[name] ??= []).push(a)
  }

  const template = readFileSync(join(templatesDir, 'country.html'), 'utf-8').replace('{{headCommon}}', headCommon)

  mkdirSync(join(distDir, 'country'), { recursive: true })

  // Precompute rankings once per metric so the 130 × 26 = 3380 row
  // renders stay fast. getRanking() already caches internally, but
  // invoking it up-front makes the cost visible in one line of build log.
  const metricKeys = Object.keys(METRICS)
  const rankings = {}
  for (const m of metricKeys) rankings[m] = getRanking(m)

  const codes = []
  let emitted = 0
  for (const [name, data] of Object.entries(COUNTRY_DATA)) {
    const iso2 = codeFromTopojsonName(name)
    if (!iso2) continue // country we can't route

    const aug = COUNTRY_AUGMENTED[name] || {}
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
      const asc = meta.ascending === true
      const rank = asc ? (ranks.length - idx) : (idx + 1)
      return {
        key: m,
        meta,
        value,
        rank: idx >= 0 ? rank : null,
        total: ranks.length,
      }
    }).filter(Boolean)

    const metricRows = metricResults
      .map((r) => renderMetricRow(r.key, r.meta, r.value, r.rank, r.total))
      .join('\n')

    const recent = articlesByCountry[name] || []
    const coverageSection = recent.length
      ? `<section class="country-coverage">
          <h2 class="label country-section-title">Recent coverage · ${recent.length}</h2>
          <ol class="country-coverage-list">
            ${recent.slice(0, 20).map((a) => `
              <li>
                <a href="/a/${a.slug}" class="country-coverage-row">
                  <time datetime="${escHtml(a.meta.date)}" class="t-tabular">${escHtml(a.dateFormatted)}</time>
                  <span class="country-coverage-title">${escHtml(a.title)}</span>
                  <span class="category country-coverage-cat">${escHtml(a.meta.category || '')}</span>
                </a>
              </li>`).join('')}
          </ol>
        </section>`
      : ''

    const html = template
      .replace(/{{name}}/g, escHtml(name))
      .replace(/{{description}}/g, escHtml(`${name} country profile: ${metaLine}. ${recent.length} recent articles on zuhd.news.`))
      .replace(/{{iso2}}/g, iso2)
      .replace(/{{region}}/g, escHtml((data.region || '').toUpperCase()))
      .replace(/{{flag}}/g, data.flag || '')
      .replace(/{{metaLine}}/g, escHtml(metaLine))
      .replace(/{{metricRows}}/g, metricRows)
      .replace(/{{coverageSection}}/g, coverageSection)

    writeFileSync(join(distDir, 'country', `${iso2}.html`), html)

    // Lightweight JSON for the country-preview island — just what a hover/tap
    // sheet needs to render quickly. The full HTML page at /country/{iso2}
    // remains the deep-dive surface.
    const previewJson = {
      iso2,
      name,
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

  return { count: emitted, codes }
}
