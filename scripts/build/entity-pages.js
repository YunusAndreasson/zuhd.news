// Entity page builder: emits /e/{id}.html for every indicator in
// content/trends/<today>.json. Each page shows the current value, the series
// as a chart, the indicator description, and every article that mentions the
// entity via its frontmatter `entities[]` array. No chart library on the
// critical path — the geometry comes from `@shared/chart/series`, which emits
// SVG nodes as data, and this walks them into a string.
//
// The chart is complete before any script runs: the line, the rule, the axis,
// the extremes and every observation in a `<details>` table. `series-chart`
// then replaces it with the interactive one.
//
// Also emits a sibling /api/entity/{id}.json blob used by the
// entity-sheet island: identical numbers, lighter transport, consumed
// when a reader opens an entity sheet (from an article's entity strip
// or a future globe affordance) without leaving the page they're on.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { loadShared } from './shared-ts.js'

const ROOT = new URL('../..', import.meta.url).pathname

/**
 * Newest daily trends snapshot on disk, or null.
 *
 * Exported because build.js needs the same answer for `/api/trends.json`. It
 * used to look up `content/trends/${today}.json` directly, which is only
 * present after that day's fetch stage has run — so on any build that happened
 * before the fetch, or on a day the fetch failed, the endpoint silently did
 * not exist. Entity pages never had that problem because they came through
 * here; now neither does the API.
 */
export const latestTrendsPath = () => {
  const dir = join(ROOT, 'content', 'trends')
  if (!existsSync(dir)) return null
  const names = readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
  const latest = names[names.length - 1]
  return latest ? join(dir, latest) : null
}

const escHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const formatValue = (v, unit) => {
  if (v == null || !Number.isFinite(v)) return '—'
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B' + (unit ? ` ${unit}` : '')
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M' + (unit ? ` ${unit}` : '')
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(2).replace(/\.?0+$/, '') + 'K' + (unit ? ` ${unit}` : '')
  if (Number.isInteger(v) || Math.abs(v) >= 100) return `${v.toFixed(0)}${unit ? ' ' + unit : ''}`
  return `${v.toFixed(2)}${unit ? ' ' + unit : ''}`
}

/**
 * The chart, from the same geometry the map sheet and the entity sheet draw.
 *
 * This used to be its own thirty lines — a line, two dots, two labels, and
 * `preserveAspectRatio="none"`. That last one is the mistake that was found and
 * removed twice elsewhere in the repo and never here: a 720×160 box stretched
 * into a full-width frame is a non-uniform scale, so the axis labels came out
 * wide for their height and the end dots were ellipses. On the one page whose
 * entire subject is a chart.
 *
 * What lands here now is the complete no-JS chart: the line, the area, the
 * window's opening rule, the y-axis, the extremes marked where they fell, the
 * latest value named in words, and every observation in a `<details>` table.
 * The `series-chart` island then replaces it with the interactive one — a
 * cursor, a range control and a copy button, none of which mean anything
 * without a script, which is exactly why none of them are in the static markup.
 */
const chartHtml = (chart, record) => {
  const { seriesModel, staticFigure, renderMarkup } = chart
  const values = record.values ?? []
  const model = seriesModel({
    values,
    periods: record.periods ?? [],
    reference: 'open',
    referenceLabel: 'the window’s open',
    direction: 'window',
    palette: 'signed',
    unit: record.unit || '',
    step: record.kind === 'MONTHLY' ? 'months' : 'days',
    label: record.label,
  })
  if (!model.ok) return ''
  return renderMarkup(staticFigure(model, { caption: record.caption }))
}

/** Shape consumed by both the static page and the entity-sheet island.
 *  All numbers are precomputed here so the island stays tiny. */
const buildEntityRecord = (ind, mentions) => {
  const values = ind.values
  const periods = Array.isArray(ind.periods) ? ind.periods : []
  const last = values[values.length - 1]
  const first = values[0]
  const prev = values[values.length - 2]
  const dayChange = last != null && prev != null ? ((last - prev) / prev) * 100 : null
  const deltaTone = dayChange == null ? '' : dayChange > 0 ? 'pos' : dayChange < 0 ? 'neg' : ''
  /**
   * The day's move, and only the day's.
   *
   * This used to read "+2.33% day · −23.6% window" as one span tinted by the
   * *day* — so on Brent, a green line of type containing a large red number,
   * directly above a chart drawn red for the window. Two horizons sharing one
   * colour is the same mistake the market card was fixed for, one surface over.
   *
   * The window's change is not lost: the chart's readout states it against the
   * rule it draws, and it is the only place that can still be right once the
   * range control has narrowed what "the window" means.
   */
  const deltaLabel =
    dayChange == null ? '—' : `${dayChange >= 0 ? '+' : ''}${dayChange.toFixed(2)}% day`
  // No date range: the chart's x-axis prints its own start and end, and unlike
  // this string it reprints them when the reader changes the range.
  const caption = [ind.sourceLabel || ind.source, ind.cadence].filter(Boolean).join(' · ')

  return {
    id: ind.id,
    label: ind.label,
    kind: (ind.cadence || 'indicator').toUpperCase(),
    sourceLabel: ind.sourceLabel || ind.source || '',
    unit: ind.unit || '',
    currentFormatted: formatValue(last, ind.unit),
    current: last ?? null,
    deltaLabel,
    deltaTone,
    values,
    periods,
    caption,
    asOf: ind.asOf || '',
    mentions: mentions.map((a) => ({
      slug: a.slug,
      title: a.title,
      date: a.meta.date,
      dateFormatted: a.dateFormatted,
      source: a.sources?.[0]?.name || '',
    })),
  }
}

const entityTemplate = `<!-- بسم الله الرحمن الرحيم -->
<!DOCTYPE html>
<html lang="en">
<head>
__HEAD__
  <link rel="alternate" type="application/atom+xml" title="zuhd.news" href="/feed.xml">
  <title>__LABEL__ — zuhd.news</title>
  <meta name="description" content="__DESC__">
  <link rel="canonical" href="https://zuhd.news/e/__ID__">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="zuhd.news">
  <meta property="og:title" content="__LABEL__ — zuhd.news">
  <meta property="og:description" content="__DESC__">
  <meta property="og:url" content="https://zuhd.news/e/__ID__">
  <meta property="og:image" content="https://zuhd.news/og-image.png">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="__LABEL__ on zuhd.news">
  <meta property="og:locale" content="en_US">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="https://zuhd.news/og-image.png">
  <meta name="twitter:image:alt" content="__LABEL__ on zuhd.news">
</head>
<body class="archetype-page-body">
  <header class="article-page-header">
    <a href="/" class="wordmark">zuhd<span class="wordmark-dot">.</span><span class="wordmark-tld">news</span></a>
    <a href="/" class="article-back-link" aria-label="All stories">All stories</a>
  </header>
  <main class="article-page-main">
    <article class="entity-page">
      <header class="entity-header">
        <span class="label">__KIND__ · __SOURCE__</span>
        <h1 class="t-display entity-label">__LABEL__</h1>
        <div class="entity-hero">
          <span class="t-data-numeral entity-current">__CURRENT__</span>
          <span class="entity-delta t-tabular __DELTA_TONE__">__DELTA__</span>
        </div>
      </header>
      <!--
        The static chart is complete on its own; the island swaps in the
        interactive one on top of it. The series travels in a JSON script
        rather than a fetch — this page's entire content is that series, and
        making the reader wait for a second request to be able to hover it
        would be a round trip to deliver bytes already on the page.
      -->
      <div class="entity-chart" data-island-auto="series-chart">
        __SPARK__
        <script type="application/json" class="chart-source">__SERIES__</script>
      </div>
      __MENTIONED__
    </article>
    __SHARE_ROW__
  </main>
  <footer>
    <span class="update-status">__AS_OF__</span>
    <nav class="footer-links">
      <a href="/about">about</a> <a href="/contact">contact</a> <a href="/privacy">privacy</a>
    </nav>
    <!--
      Every other page type carries this row; the entity pages were built
      before it existed and never got it, so an indicator page was the one
      place on the site with no route to the feeds or either store.
    -->
    <nav class="footer-social" aria-label="Follow and download">
      <a href="https://x.com/zuhd_news" rel="me noopener" target="_blank">x</a>
      <a href="https://www.instagram.com/zuhdnews/" rel="me noopener" target="_blank">instagram</a>
      <a href="https://apps.apple.com/us/app/zuhd-news/id6760964753" rel="noopener" target="_blank">iphone</a>
      <a href="https://play.google.com/store/apps/details?id=news.zuhd.app" rel="noopener" target="_blank">android</a>
    </nav>
    <nav class="footer-maker" aria-label="Maker">
      <a class="footer-byline" href="https://andreassonphoto.com/about" target="_blank" rel="me noopener noreferrer">made by yunus andreasson</a>
      <span class="footer-maker-links">
        <a href="https://github.com/YunusAndreasson" target="_blank" rel="me noopener noreferrer">github</a>
        <a href="https://x.com/YunusAndreasson" target="_blank" rel="me noopener noreferrer">x</a>
        <a href="https://www.instagram.com/andreasson.photo/" target="_blank" rel="me noopener noreferrer">instagram</a>
        <a href="https://www.linkedin.com/in/yunusandreasson/" target="_blank" rel="me noopener noreferrer">linkedin</a>
      </span>
      <span class="footer-maker-links footer-other-apps">
        <a href="https://islam.se" target="_blank" rel="noopener noreferrer">islam.se</a>
        <a href="https://openarabic.io" target="_blank" rel="noopener noreferrer">open-arabic</a>
        <a href="https://al-ibadah.com" target="_blank" rel="noopener noreferrer">al-ibadah</a>
        <a href="https://qamar360.com" target="_blank" rel="noopener noreferrer">qamar360</a>
      </span>
    </nav>
  </footer>
  <script type="module" src="/island-loader.js__ISLAND_V__" defer></script>
</body>
</html>`

export const buildEntityPages = async ({
  sorted,
  distDir,
  headCommon,
  islandV = '',
  shareRowHtml = () => '',
}) => {
  const today = new Date().toISOString().slice(0, 10)
  const trendsPath = latestTrendsPath()
  if (!trendsPath) return { count: 0, ids: [] }
  const trends = JSON.parse(readFileSync(trendsPath, 'utf8'))
  const indicators = Array.isArray(trends.indicators) ? trends.indicators : []
  const chart = await loadShared('chart/series.ts')

  // Index articles by entity.indicatorId so each entity page can surface
  // its mentions. Use sorted (newest → oldest) to preserve the reading
  // order readers expect.
  const mentionsByEntity = {}
  for (const a of sorted) {
    const entities = Array.isArray(a.meta.entities) ? a.meta.entities : []
    for (const e of entities) {
      if (!e?.indicatorId) continue
      ;(mentionsByEntity[e.indicatorId] ??= []).push(a)
    }
  }

  mkdirSync(join(distDir, 'e'), { recursive: true })
  mkdirSync(join(distDir, 'api', 'entity'), { recursive: true })
  const ids = []
  for (const ind of indicators) {
    if (!ind?.id || !Array.isArray(ind.values) || ind.values.length < 2) continue

    const mentions = mentionsByEntity[ind.id] || []
    const record = buildEntityRecord(ind, mentions.slice(0, 30))

    const mentionedSection = mentions.length
      ? `<section class="entity-mentioned">
          <h2 class="label archive-section-title">Mentioned in · ${mentions.length}</h2>
          <ol class="archive-article-list">
            ${mentions.slice(0, 30).map((a) => `<li>
              <a class="archive-article-row" href="/a/${a.slug}">
                <time datetime="${escHtml(a.meta.date)}" class="t-tabular">${escHtml(a.dateFormatted)}</time>
                <span class="archive-article-title">${escHtml(a.title)}</span>
                ${a.sources[0]?.name ? `<span class="t-source-host">${escHtml(a.sources[0].name)}</span>` : ''}
              </a>
            </li>`).join('')}
          </ol>
        </section>`
      : ''

    const html = entityTemplate
      .replace(/__HEAD__/g, headCommon)
      // Was a bare `/island-loader.js`. Pages pins `.js` to its own four-hour
      // max-age and `_headers` cannot lower it, so without the build's cache
      // key an entity page kept loading whichever loader the edge last cached —
      // harmless while these pages mounted no islands, and not once they do.
      .replace(/__ISLAND_V__/g, islandV ? `?v=${islandV}` : '')
      .replace(/__SHARE_ROW__/g, shareRowHtml(`/e/${ind.id}`, `${ind.label} — zuhd.news`))
      .replace(/__ID__/g, escHtml(ind.id))
      .replace(/__LABEL__/g, escHtml(ind.label))
      .replace(/__DESC__/g, escHtml(`${ind.label} — ${ind.sourceLabel || ind.source}. ${mentions.length} related articles on zuhd.news.`))
      .replace(/__KIND__/g, escHtml(record.kind))
      .replace(/__SOURCE__/g, escHtml(record.sourceLabel))
      .replace(/__CURRENT__/g, escHtml(record.currentFormatted))
      .replace(/__DELTA__/g, escHtml(record.deltaLabel))
      .replace(/__DELTA_TONE__/g, record.deltaTone)
      .replace(/__SPARK__/g, chartHtml(chart, record))
      // `</` is the only sequence that can end a script element early, and
      // escaping it is what keeps a label like "S&P 500 </script>" from being
      // a way to write markup into this page. JSON keeps `<` as a `<` on
      // parse, so the payload is unchanged.
      .replace(
        /__SERIES__/g,
        JSON.stringify({
          values: record.values,
          periods: record.periods,
          unit: record.unit || '',
          kind: record.kind,
          label: record.label,
          caption: record.caption,
        }).replace(/</g, '\\u003c'),
      )
      .replace(/__MENTIONED__/g, mentionedSection)
      .replace(/__AS_OF__/g, escHtml(`As of ${record.asOf || trends.asOf || today}`))

    writeFileSync(join(distDir, 'e', `${ind.id}.html`), html)

    // Sheet JSON: same numbers, lighter transport. Consumed by the
    // entity-sheet island (opened from article entity strips).
    writeFileSync(join(distDir, 'api', 'entity', `${ind.id}.json`), JSON.stringify(record))

    ids.push(ind.id)
  }

  return { count: ids.length, ids }
}
