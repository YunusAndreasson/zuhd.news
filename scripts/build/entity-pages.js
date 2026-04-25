// Entity page builder: emits /e/{id}.html for every indicator in
// content/trends/<today>.json. Each page shows the current value, a
// 180-day monochrome sparkline rendered as static SVG, the indicator
// description, and every article that mentions the entity via its
// frontmatter `entities[]` array. No chart library on the critical
// path — the SVG is inline and rendered once, zero runtime JS needed.
//
// Also emits a sibling /api/entity/{id}.json blob used by the
// entity-sheet island: identical numbers, lighter transport, consumed
// when a reader opens an entity sheet (from an article's entity strip
// or a future globe affordance) without leaving the page they're on.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'

const ROOT = new URL('../..', import.meta.url).pathname

const latestTrendsPath = () => {
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

/** Inline SVG sparkline for the indicator series. Monochrome, hairline,
 *  start/end dots. No axes — labels are set in adjacent HTML. */
const sparklineSvg = (values, periods, { w = 720, h = 160 } = {}) => {
  if (!values.length || values.length < 2) return ''
  const pad = { l: 12, r: 12, t: 24, b: 24 }
  const innerW = w - pad.l - pad.r
  const innerH = h - pad.t - pad.b
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const scaleX = (i) => pad.l + (i / (values.length - 1)) * innerW
  const scaleY = (v) => pad.t + innerH - ((v - min) / range) * innerH
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${scaleX(i).toFixed(2)},${scaleY(v).toFixed(2)}`).join('')
  const first = values[0]
  const last = values[values.length - 1]
  const firstLabel = periods?.[0] ?? ''
  const lastLabel = periods?.[periods.length - 1] ?? ''

  return `<svg class="entity-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Series chart">
    <path d="${d}" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${scaleX(0)}" cy="${scaleY(first)}" r="3" fill="currentColor"/>
    <circle cx="${scaleX(values.length - 1)}" cy="${scaleY(last)}" r="3" fill="currentColor"/>
    <text x="${scaleX(0)}" y="${h - 6}" class="entity-spark-label" text-anchor="start">${escHtml(firstLabel)}</text>
    <text x="${scaleX(values.length - 1)}" y="${h - 6}" class="entity-spark-label" text-anchor="end">${escHtml(lastLabel)}</text>
  </svg>`
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
  const rangeChange = last != null && first != null ? ((last - first) / first) * 100 : null
  const deltaTone = dayChange == null ? '' : dayChange > 0 ? 'pos' : dayChange < 0 ? 'neg' : ''
  const deltaLabel = dayChange == null
    ? '—'
    : `${dayChange >= 0 ? '+' : ''}${dayChange.toFixed(2)}% day  ·  ${rangeChange >= 0 ? '+' : ''}${rangeChange.toFixed(1)}% window`
  const caption = [
    periods.length ? `${periods[0]} → ${periods[periods.length - 1]}` : null,
    ind.sourceLabel || ind.source,
    ind.cadence,
  ].filter(Boolean).join(' · ')

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
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="https://zuhd.news/og-image.png">
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
      <figure class="entity-chart">
        __SPARK__
        <figcaption class="t-caption">__CAPTION__</figcaption>
      </figure>
      __MENTIONED__
    </article>
  </main>
  <footer>
    <span class="update-status">__AS_OF__</span>
    <nav class="footer-links">
      <a href="/about">about</a> <a href="/contact">contact</a> <a href="/privacy">privacy</a>
    </nav>
  </footer>
  <script type="module" src="/island-loader.js" defer></script>
</body>
</html>`

export const buildEntityPages = ({ sorted, distDir, headCommon }) => {
  const today = new Date().toISOString().slice(0, 10)
  const trendsPath = latestTrendsPath()
  if (!trendsPath) return { count: 0, ids: [] }
  const trends = JSON.parse(readFileSync(trendsPath, 'utf8'))
  const indicators = Array.isArray(trends.indicators) ? trends.indicators : []

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
          <h2 class="label thread-section-title">Mentioned in · ${mentions.length}</h2>
          <ol class="thread-article-list">
            ${mentions.slice(0, 30).map((a) => `<li>
              <a class="thread-article-row" href="/a/${a.slug}">
                <time datetime="${escHtml(a.meta.date)}" class="t-tabular">${escHtml(a.dateFormatted)}</time>
                <span class="thread-article-title">${escHtml(a.title)}</span>
                ${a.sources[0]?.name ? `<span class="t-source-host">${escHtml(a.sources[0].name)}</span>` : ''}
              </a>
            </li>`).join('')}
          </ol>
        </section>`
      : ''

    const html = entityTemplate
      .replace(/__HEAD__/g, headCommon)
      .replace(/__ID__/g, escHtml(ind.id))
      .replace(/__LABEL__/g, escHtml(ind.label))
      .replace(/__DESC__/g, escHtml(`${ind.label} — ${ind.sourceLabel || ind.source}. ${mentions.length} related articles on zuhd.news.`))
      .replace(/__KIND__/g, escHtml(record.kind))
      .replace(/__SOURCE__/g, escHtml(record.sourceLabel))
      .replace(/__CURRENT__/g, escHtml(record.currentFormatted))
      .replace(/__DELTA__/g, escHtml(record.deltaLabel))
      .replace(/__DELTA_TONE__/g, record.deltaTone)
      .replace(/__SPARK__/g, sparklineSvg(record.values, record.periods))
      .replace(/__CAPTION__/g, escHtml(record.caption))
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
