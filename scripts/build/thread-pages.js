// Thread page builder: emits /s/{id}.html for every active story in
// .story-ledger.json. Each page shows the arc (breaking/developing/
// ongoing), the editor-written summary, the context-brief timeline
// (when present), and a chronological list of every article in the
// thread — the standalone surface for a reader who lands on the arc
// from search, share, or a thread cross-reference.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { geoOrthographic, geoPath } from 'd3-geo'
import { feature, mesh } from 'topojson-client'

const ROOT = new URL('../..', import.meta.url).pathname

// Load the 110m world once; reused across every thread page.
let _world = null
const loadWorld = () => {
  if (_world) return _world
  const topoPath = join(ROOT, 'shared', 'data', 'countries-110m.json')
  if (!existsSync(topoPath)) return null
  const topo = JSON.parse(readFileSync(topoPath, 'utf8'))
  _world = {
    land: feature(topo, topo.objects.countries),
    borders: mesh(topo, topo.objects.countries, (a, b) => a !== b),
  }
  return _world
}

// Build a static orthographic SVG mini-map for the thread: centered on
// the mean point of all article locations, land in `--color-text-soft`
// equivalent, hairline borders, a crosshair per article. No JS; a hard
// anchor for the reader that ties the arc's geography to the timeline.
const threadMiniMapSvg = (articles) => {
  const world = loadWorld()
  if (!world) return ''
  const pts = articles
    .filter((a) => a.meta.lat != null && a.meta.lng != null)
    .map((a) => [Number(a.meta.lng), Number(a.meta.lat)])
  if (pts.length === 0) return ''

  const width = 720
  const height = 360
  const avgLng = pts.reduce((s, p) => s + p[0], 0) / pts.length
  const avgLat = pts.reduce((s, p) => s + p[1], 0) / pts.length
  const proj = geoOrthographic()
    .scale(height / 2.2)
    .translate([width / 2, height / 2])
    .rotate([-avgLng, -avgLat, 0])
    .clipAngle(90)
  const path = geoPath(proj)

  const landD = path(world.land) || ''
  const bordersD = path(world.borders) || ''
  const cx = width / 2
  const cy = height / 2
  const r = height / 2.2

  const pinSvg = pts
    .map(([lng, lat]) => {
      const xy = proj([lng, lat])
      if (!xy) return ''
      const [x, y] = xy
      return `<g class="thread-map-pin">
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="10" class="thread-map-pin-halo"/>
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" class="thread-map-pin-dot"/>
      </g>`
    })
    .join('')

  return `<section class="thread-map" aria-label="Places mentioned in this story">
    <svg viewBox="0 0 ${width} ${height}" role="img" class="thread-map-svg">
      <circle cx="${cx}" cy="${cy}" r="${r}" class="thread-map-ocean"/>
      <path d="${landD}" class="thread-map-land"/>
      <path d="${bordersD}" class="thread-map-borders"/>
      ${pinSvg}
    </svg>
  </section>`
}

const escHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const threadTemplate = `<!-- بسم الله الرحمن الرحيم -->
<!DOCTYPE html>
<html lang="en">
<head>
__HEAD__
  <link rel="alternate" type="application/atom+xml" title="zuhd.news" href="/feed.xml">
  <title>__LABEL__ — zuhd.news</title>
  <meta name="description" content="__DESC__">
  <link rel="canonical" href="https://zuhd.news/s/__ID__">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="zuhd.news">
  <meta property="og:title" content="__LABEL__">
  <meta property="og:description" content="__DESC__">
  <meta property="og:url" content="https://zuhd.news/s/__ID__">
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
    <article class="thread-page">
      <header class="thread-header">
        <span class="label">__ARC__ · __CATEGORY__</span>
        <h1 class="t-display thread-label">__LABEL__</h1>
        <p class="t-caption thread-meta">__META__</p>
      </header>
      __SUMMARY__
      __MAP__
      __TIMELINE__
      <section class="thread-articles">
        <h2 class="label thread-section-title">Articles · __COUNT__</h2>
        <ol class="thread-article-list">__ARTICLES__</ol>
      </section>
    </article>
  </main>
  <footer>
    <span class="update-status">Story since __FIRST_SEEN__</span>
    <nav class="footer-links">
      <a href="/about">about</a> <a href="/contact">contact</a> <a href="/privacy">privacy</a>
    </nav>
  </footer>
  <script type="module" src="/island-loader.js" defer></script>
</body>
</html>`

const contextTimelineHtml = (timeline) => {
  if (!Array.isArray(timeline) || timeline.length === 0) return ''
  const entries = timeline.map((e) => `
    <li class="thread-timeline-entry">
      ${e.year ? `<span class="thread-timeline-year">${escHtml(e.year)}</span>` : ''}
      ${e.heading ? `<p class="thread-timeline-heading">${escHtml(e.heading)}</p>` : ''}
      <p class="thread-timeline-body">${escHtml(e.body)}</p>
    </li>`).join('')
  return `<section class="thread-context">
    <h2 class="label thread-section-title">Context</h2>
    <ol class="thread-timeline">${entries}</ol>
  </section>`
}

const summaryHtml = (summary) => {
  if (!summary) return ''
  return `<section class="thread-summary">
    <p class="t-dek">${escHtml(summary)}</p>
  </section>`
}

export const buildThreadPages = ({ articlesBySlug, distDir, headCommon }) => {
  const ledgerPath = join(ROOT, 'content', '.story-ledger.json')
  const briefsPath = join(ROOT, 'content', '.context-briefs.json')
  if (!existsSync(ledgerPath)) return { count: 0, ids: [] }
  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'))
  const briefs = existsSync(briefsPath) ? JSON.parse(readFileSync(briefsPath, 'utf8')) : {}

  mkdirSync(join(distDir, 's'), { recursive: true })

  const ids = []
  for (const story of ledger.stories) {
    if (story.arc === 'fading' || story.importance < 2) continue
    if (!Array.isArray(story.articles) || story.articles.length === 0) continue

    const brief = briefs[story.id]
    const summary = story.summary || brief?.label || ''
    const first = new Date(story.firstSeen)
    const last = new Date(story.lastCovered || story.firstSeen)
    const daySpan = Math.max(1, Math.ceil((last - first) / 86400000))

    // Chronological (oldest → newest) — the arc unfolds this way for the reader.
    const resolvedArticles = [...story.articles]
      .map((slug) => articlesBySlug.get(slug))
      .filter(Boolean)
      .sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0))
    const articleRows = resolvedArticles
      .map((a) => `<li>
        <a class="thread-article-row" href="/a/${a.slug}">
          <time datetime="${escHtml(a.meta.date)}" class="t-tabular">${escHtml(a.dateFormatted)}</time>
          <span class="thread-article-title">${escHtml(a.title)}</span>
          ${a.sources[0]?.name ? `<span class="t-source-host">${escHtml(a.sources[0].name)}</span>` : ''}
        </a>
      </li>`).join('\n')

    if (!articleRows) continue

    const meta = [
      `${story.articles.length} article${story.articles.length > 1 ? 's' : ''}`,
      `${daySpan} day${daySpan > 1 ? 's' : ''}`,
      `importance ${story.importance}`,
    ].join(' · ')

    const html = threadTemplate
      .replace(/__HEAD__/g, headCommon)
      .replace(/__ID__/g, escHtml(story.id))
      .replace(/__LABEL__/g, escHtml(story.label))
      .replace(/__DESC__/g, escHtml(summary.slice(0, 180)))
      .replace(/__ARC__/g, escHtml((story.arc || 'ongoing').toUpperCase()))
      .replace(/__CATEGORY__/g, escHtml((story.category || 'politics').toUpperCase()))
      .replace(/__META__/g, escHtml(meta))
      .replace(/__SUMMARY__/g, summaryHtml(summary))
      .replace(/__MAP__/g, threadMiniMapSvg(resolvedArticles))
      .replace(/__TIMELINE__/g, contextTimelineHtml(brief?.timeline))
      .replace(/__COUNT__/g, String(story.articles.length))
      .replace(/__ARTICLES__/g, articleRows)
      .replace(/__FIRST_SEEN__/g, escHtml(first.toISOString().slice(0, 10)))

    writeFileSync(join(distDir, 's', `${story.id}.html`), html)
    ids.push(story.id)
  }

  return { count: ids.length, ids }
}
