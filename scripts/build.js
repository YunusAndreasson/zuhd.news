import { readFileSync, writeFileSync, mkdirSync, readdirSync, cpSync, existsSync, rmSync, statSync } from 'fs'
import { join, basename } from 'path'
import { createHash } from 'crypto'
import { parseFrontmatter } from './lib/frontmatter.js'
import { splitSentences as splitBodySentencesShared, ABBREVS } from './lib/sentences.js'
import { buildOgPng } from './lib/og-image.js'
import { buildIslands } from './build/islands.js'
import { buildCountryPages } from './build/country-pages.js'
import { buildEntityPages } from './build/entity-pages.js'
import { loadShared } from './build/shared-ts.js'

const ROOT = new URL('..', import.meta.url).pathname
const CONTENT_DIR = join(ROOT, 'content', 'articles')
const DIST_DIR = join(ROOT, 'dist')
const TEMPLATES_DIR = join(ROOT, 'templates')

const CATEGORY_ORDER = ['politics', 'economy', 'science', 'tech']

// Build a subtle dark-mode starfield as an inline SVG data URI. The
// fixed-seed xorshift makes the output byte-identical across rebuilds
// (clean diffs, stable screenshots). Two tiers — dense dust + sparse
// highlights — give the field depth without reading as ornament. Star
// sizes and opacities follow the eye's natural perception of stars
// (most dim, a few bright) rather than uniform variance.
const buildStarfieldDataUri = () => {
  let s = 0xC0DE_FACE
  const rand = () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5
    return (s >>> 0) / 0x100000000
  }
  const W = 1200, H = 1200
  const r2 = (n) => Math.round(n * 100) / 100
  // Power-law brightness: rand²·range biases toward the dim end so most
  // stars sit just above the noise floor and a few outliers shine. The
  // dust tier is many small dim points; the highlight tier is the bright
  // few that sell the depth.
  const tiers = [
    { n: 140, rMin: 0.4, rMax: 0.9, oMin: 0.28, oMax: 0.6  }, // dust
    { n: 22,  rMin: 0.9, rMax: 1.6, oMin: 0.6,  oMax: 0.92 }, // highlights
  ]
  let circles = ''
  for (const t of tiers) {
    for (let i = 0; i < t.n; i++) {
      const cx = r2(rand() * W)
      const cy = r2(rand() * H)
      const r  = r2(t.rMin + rand() * rand() * (t.rMax - t.rMin))
      const op = r2(t.oMin + rand() * rand() * (t.oMax - t.oMin))
      circles += `<circle cx='${cx}' cy='${cy}' r='${r}' opacity='${op}'/>`
    }
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${H}'><g fill='white'>${circles}</g></svg>`
  return `url("data:image/svg+xml,${svg.replace(/</g, '%3C').replace(/>/g, '%3E')}")`
}
const STARFIELD_URI = buildStarfieldDataUri()

// Convert structured timeline array to HTML for web rendering
const contextToHtml = (timeline) => {
  if (!Array.isArray(timeline) || timeline.length === 0) return ''
  let html = ''
  for (const entry of timeline) {
    if (entry.heading) {
      html += `<p class="context-heading">${entry.heading}</p><p>${entry.body}</p>`
    } else {
      html += `<p>${entry.body}</p>`
    }
  }
  return html
}
const WINDOW_MS = 24 * 60 * 60 * 1000
const MIN_PER_CATEGORY = 10
const MAX_PER_CATEGORY = 13

const smartQuotes = (text) => text
  .replace(/(^|[\s(\[{])"(\S)/gm, '$1\u201C$2')
  .replace(/"/g, '\u201D')
  .replace(/(^|[\s(\[{])'(\S)/gm, '$1\u2018$2')
  .replace(/'/g, '\u2019')

// Pipeline-emitted country tags use the `country:XX` href scheme
// (e.g. `[Iran](country:IR)`). On the web these rewrite to the new
// /country/XX pages; mobile keeps the custom scheme via the markdown
// renderer's URL handler.
const rewriteLinkHref = (href) => {
  const m = href.match(/^country:([A-Za-z]{2})$/)
  if (m) return `/country/${m[1].toUpperCase()}`
  return href
}

const markdownToHtml = (md) => {
  const html = smartQuotes(md)
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
      const rewritten = rewriteLinkHref(href)
      const isCountry = rewritten.startsWith('/country/')
      if (isCountry) {
        // Country tags are popover triggers: the island-loader intercepts
        // primary clicks via `data-island` and opens the country-preview
        // sheet inline. The href stays as a real URL so middle-click /
        // Cmd-click / right-click still navigate to the full profile, and
        // the link works without JS.
        const iso2 = rewritten.replace('/country/', '')
        return `<a href="${rewritten}" class="country-link" data-island="country-preview" data-iso="${iso2}">${text}</a>`
      }
      return `<a href="${rewritten}">${text}</a>`
    })
    .replace(/^---$/gm, '<hr>')

  const result = []
  let inList = false
  for (const line of html.split('\n')) {
    if (line.startsWith('- ')) {
      if (!inList) { result.push('<ul>'); inList = true }
      result.push(`<li>${line.slice(2)}</li>`)
    } else {
      if (inList) { result.push('</ul>'); inList = false }
      if (line.trim() === '') continue
      if (!line.startsWith('<h') && !line.startsWith('<hr') && !line.startsWith('<ul') && !line.startsWith('<li'))
        result.push(`<p>${line}</p>`)
      else
        result.push(line)
    }
  }
  if (inList) result.push('</ul>')
  return result.join('\n')
}

// Shares ABBREVS with lib/sentences.js — prevents acronym list drift between
// the markdown-space validator (count check) and this HTML-space wrapper.
// Lookahead accepts `<` so sentences starting with rendered markdown links
// (country tags become `<a href="country:XX">…</a>`) still split correctly.
const splitSentences = (html) =>
  html.replace(/<p>([\s\S]*?)<\/p>/g, (match, inner) => {
    const masked = inner.replace(ABBREVS, m => m.replace('. ', '.\x00'))
    const sentences = masked.split(/(?<=[.!?][\u201D\u2019]?(?:<\/em>)?)\s+(?=[\p{Lu}<])/u)
    if (sentences.length <= 1) return match
    return '<p>' + sentences.map(s => `<span class="s">${s.replace(/\.\x00/g, '. ')}</span>`).join(' ') + '</p>'
  })

const formatDate = (dateStr) =>
  new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

const buildArticle = (filename) => {
  const raw = readFileSync(join(CONTENT_DIR, filename), 'utf-8')
  const { meta, body } = parseFrontmatter(raw)

  const sources = Array.isArray(meta.sources) ? meta.sources : []
  const primarySource = sources[0]?.name || ''

  // Source attribution — always use expandable details format
  let sourcemark = ''
  if (sources.length > 0) {
    const items = sources.map(s => {
      const country = s.country ? ` <span class="source-country">${s.country}</span>` : ''
      const link = s.url ? ` <a href="${s.url}" rel="noopener" target="_blank">&#8599;</a>` : ''
      return `<li>${s.name}${country}${link}</li>`
    }).join('')
    sourcemark = `<details class="article-sources"><summary class="source-count">${sources.length} source${sources.length > 1 ? 's' : ''}</summary><ul>${items}</ul></details>`
  }

  // `concepts` stays in the parsed article so API consumers (feed.json,
  // mobile) keep getting the list, but we no longer append a concept-chip
  // strip to the reader's HTML body.
  const concepts = Array.isArray(meta.concepts) ? meta.concepts : []

  // Wrap a leading `Location — ` prefix in a small-caps dateline. The em
  // dash is dropped; CSS handles the spacing. We strip the dateline from
  // the markdown source before HTML rendering (so smartQuotes doesn't
  // curl our attribute quotes), then inject the styled span back into
  // the first paragraph of the rendered HTML.
  const datelineMatch = body.match(/^([^\n—]+?)\s+—\s+/)
  const strippedBody = datelineMatch ? body.slice(datelineMatch[0].length) : body
  let renderedHtml = splitSentences(markdownToHtml(strippedBody))
  if (datelineMatch) {
    const location = datelineMatch[1].trim()
    renderedHtml = renderedHtml.replace(
      /^<p>/,
      `<p><span class="article-dateline">${location}</span>`,
    )
  }

  const slug = basename(filename, '.md')
  return {
    slug, meta, body, sources, concepts,
    bodyHtml: renderedHtml + sourcemark,
    title: smartQuotes(meta.title || 'Untitled'),
    dateFormatted: formatDate(meta.date),
    sourceCount: sources.length,
  }
}

// Applies rolling window per category; returns raw article objects grouped by category.
// Shared by homepage and API — each consumer maps to its own shape.
const groupByWindow = (sorted, cutoff) => {
  const grouped = {}
  for (const a of sorted) {
    const cat = a.meta.category || 'uncategorised'
    const list = grouped[cat] ??= []
    if (list.length >= MAX_PER_CATEGORY) continue
    if (a.addedAt >= cutoff || list.length < MIN_PER_CATEGORY) list.push(a)
  }
  return grouped
}

const buildHomepage = (sorted, cutoff, homepageTemplate) => {
  const rawGrouped = groupByWindow(sorted, cutoff)

  const grouped = Object.fromEntries(
    Object.entries(rawGrouped).map(([cat, articles]) => [
      cat,
      articles.map(({ slug, title, meta, addedAt, bodyHtml, sources, concepts, sourceCount }) => {
        const thread = threadLookup.get(slug)
        return {
          slug, title, addedAt,
          date: meta.date,
          bodyHtml,
          sources: sources.map(s => ({ name: s.name, url: s.url || '', country: s.country || null, sentiment: s.sentiment ? Number(s.sentiment) : null })),
          concepts: concepts.map(c => typeof c === 'object' ? c.label : c),
          sourceCount,
          eventCoverage: meta.eventCoverage ? Number(meta.eventCoverage) : null,
          sentimentDivergence: meta.sentimentDivergence ? Number(meta.sentimentDivergence) : null,
          // Coordinates so the ambient-globe island can rotate to the
          // article's location when the reader switches articles.
          ...(meta.lat != null && meta.lng != null
            ? { lat: Number(meta.lat), lng: Number(meta.lng) }
            : {}),
          ...(thread?.threadContext && { threadId: thread.threadId }),
        }
      })
    ])
  )

  const categoryOrder = [
    ...CATEGORY_ORDER.filter(c => c in grouped),
    ...Object.keys(grouped).filter(c => !CATEGORY_ORDER.includes(c))
  ]

  const includedSlugs = new Set(Object.values(grouped).flat().map(a => a.slug))
  const fallbackArticleList = sorted
    .filter(a => includedSlugs.has(a.slug))
    .map(({ slug, title, meta, dateFormatted }) => `
      <article class="article-preview">
        <span class="category">${meta.category || ''}</span>
        <h2><a href="/#${slug}">${title}</a></h2>
        <time datetime="${meta.date}">${dateFormatted}</time>
      </article>`)
    .join('\n')

  // Build contexts map — only include briefs referenced by articles on the page
  const referencedThreadIds = new Set(
    Object.values(grouped).flat().map(a => a.threadId).filter(Boolean)
  )
  const contexts = {}
  for (const id of referencedThreadIds) {
    const brief = contextBriefs[id]
    if (brief?.timeline) {
      contexts[id] = contextToHtml(brief.timeline)
    }
  }

  return homepageTemplate
    .replace(/{{articleDataJson}}/g, JSON.stringify({ categoryOrder, articles: grouped, contexts }))
    .replace(/{{fallbackArticleList}}/g, fallbackArticleList)
}

const escHtmlAttr = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

// Extract a clean OG/meta description from body: first 1-2 sentences, ≤170 chars.
const buildDescription = (body) => {
  if (!body) return 'Global news, no noise. Concise world news from 40 sources, curated by AI.'
  const firstPara = body.trim().split(/\n{2,}/)[0] || body.trim()
  const plain = firstPara.replace(/[*_`#>]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim()
  if (plain.length <= 170) return plain
  const cut = plain.slice(0, 167)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > 120 ? cut.slice(0, lastSpace) : cut) + '…'
}

// Background disclosure — matches the homepage reader's plain
// <details class="article-context"> affordance so /a/{slug} and the
// in-pane reader render identically.
const threadBlockHtml = (threadCtx) => {
  if (!threadCtx) return ''
  const bodyHtml = contextToHtml(threadCtx)
  if (!bodyHtml) return ''
  return `<details class="article-context"><summary class="context-label">Background</summary><div class="context-body">${bodyHtml}</div></details>`
}

// Entity strip — the reader-facing affordance for an article's
// frontmatter entities[]. Rendered as <a href="/e/{id}"> so no-JS
// clients and crawlers still follow through to the full page; the
// island loader hijacks the click on first tap and opens the entity
// sheet in place. Only entries whose indicatorId actually corresponds
// to a trends snapshot get rendered — anything else (e.g. the old
// `stocks:MRNA` shape we don't ship series for) is silently dropped.
const entityStripHtml = (entities, indicatorMap) => {
  if (!Array.isArray(entities) || !entities.length) return ''
  const rendered = entities
    .filter((e) => e?.indicatorId && indicatorMap?.has(e.indicatorId))
    .map((e) => {
      const ind = indicatorMap.get(e.indicatorId)
      return `<a class="article-entity-chip" href="/e/${escHtmlAttr(e.indicatorId)}" data-island="entity-sheet" data-id="${escHtmlAttr(e.indicatorId)}"><span class="article-entity-chip-label">${escHtmlAttr(ind.label || e.mention || e.indicatorId)}</span></a>`
    })
  if (!rendered.length) return ''
  return `<aside class="article-entities" aria-label="Related entities"><span class="label article-entities-label">Follows</span>${rendered.join('')}</aside>`
}

// Relative time-ago label — mirror of mobile/lib/article-utils.formatTimeAgo.
// Kicker shows this instead of a fixed date so the article header reads
// the same as mobile ("3h ago") rather than an abstract calendar date.
const formatTimeAgo = (addedAt) => {
  const diffMs = Date.now() - addedAt
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(addedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

const buildArticlePage = (article, prev, next, thread, template, indicatorMap) => {
  const { slug, meta, body, bodyHtml, title, dateFormatted, addedAt } = article
  const isoDate = meta.date || new Date(addedAt).toISOString()
  const category = meta.category || 'politics'
  const description = buildDescription(body)
  const timeAgo = formatTimeAgo(addedAt)
  const prevLink = prev
    ? `<a class="article-pagination-prev" href="/a/${prev.slug}" rel="prev"><span class="article-pagination-label">Previous</span><span class="article-pagination-title">${escHtmlAttr(prev.title)}</span></a>`
    : '<span class="article-pagination-prev"></span>'
  const nextLink = next
    ? `<a class="article-pagination-next" href="/a/${next.slug}" rel="next"><span class="article-pagination-label">Next</span><span class="article-pagination-title">${escHtmlAttr(next.title)}</span></a>`
    : '<span class="article-pagination-next"></span>'

  return template
    .replace(/{{slug}}/g, slug)
    .replace(/{{title}}/g, escHtmlAttr(title))
    .replace(/{{titleAttr}}/g, escHtmlAttr(title))
    .replace(/{{description}}/g, escHtmlAttr(description))
    .replace(/{{category}}/g, category)
    .replace(/{{dateFormatted}}/g, dateFormatted)
    .replace(/{{isoDate}}/g, isoDate)
    .replace(/{{timeAgo}}/g, escHtmlAttr(timeAgo))
    .replace(/{{bodyHtml}}/g, bodyHtml)
    .replace(/{{entityStrip}}/g, entityStripHtml(meta.entities, indicatorMap))
    .replace(/{{threadBlock}}/g, threadBlockHtml(thread?.threadContext))
    .replace(/{{prevLink}}/g, prevLink)
    .replace(/{{nextLink}}/g, nextLink)
}

// Main build
console.log('Building zuhd.news...')

if (existsSync(DIST_DIR)) rmSync(DIST_DIR, { recursive: true })
mkdirSync(DIST_DIR, { recursive: true })

if (existsSync(join(ROOT, 'public')))
  cpSync(join(ROOT, 'public'), DIST_DIR, {
    recursive: true,
    // Island source files are TypeScript — esbuild emits the runtime
    // bundles into dist/islands/ separately. Don't ship the sources.
    filter: (src) => !src.endsWith('.ts'),
  })

const audioSrc = join(ROOT, 'content', 'audio')
if (existsSync(audioSrc)) {
  mkdirSync(join(DIST_DIR, 'audio'), { recursive: true })
  for (const f of readdirSync(audioSrc).filter(f => f.endsWith('.mp3') || f === 'briefing-meta.json'))
    cpSync(join(audioSrc, f), join(DIST_DIR, 'audio', f))
}

const cssContent = readFileSync(join(ROOT, 'public', 'style.css'), 'utf-8')
const jsContent = readFileSync(join(ROOT, 'public', 'reader.js'), 'utf-8')
const headCommon = `<meta charset="utf-8">
  <meta name="color-scheme" content="light dark">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#fff" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#141414" media="(prefers-color-scheme: dark)">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="zuhd.news">
  <meta name="apple-itunes-app" content="app-id=6760964753">
  <link rel="preload" href="/fonts/source-sans-3-var.woff2" as="font" type="font/woff2" crossorigin fetchpriority="high">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.json">
  <script type="speculationrules">{"prerender":[{"where":{"and":[{"href_matches":"/*"},{"not":{"href_matches":"/api/*"}},{"not":{"href_matches":"/audio/*"}},{"not":{"href_matches":"/feed.xml"}},{"not":{"href_matches":"/sitemap.xml"}},{"not":{"href_matches":"/og-image.png"}}]},"eagerness":"moderate"}]}</script>
  <style>:root{--starfield:${STARFIELD_URI}}${cssContent}</style>`

const homepageTemplate = readFileSync(join(TEMPLATES_DIR, 'index.html'), 'utf-8')
  .replace('{{headCommon}}', headCommon)
  .replace('{{inlineJS}}', jsContent)

const articleTemplate = readFileSync(join(TEMPLATES_DIR, 'article.html'), 'utf-8')
  .replace('{{headCommon}}', headCommon)

// Story thread lookup — maps article slugs to their thread info from the ledger
const ledgerPath = join(ROOT, 'content', '.story-ledger.json')
const briefsPath = join(ROOT, 'content', '.context-briefs.json')
const threadLookup = new Map()
const contextBriefs = existsSync(briefsPath) ? JSON.parse(readFileSync(briefsPath, 'utf8')) : {}
if (existsSync(ledgerPath)) {
  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'))
  for (const story of ledger.stories) {
    if (story.arc === 'fading' || story.importance < 2) continue
    const firstDate = new Date(story.firstSeen)
    // Context comes from the separate briefs file (survives selector rewrites)
    const brief = contextBriefs[story.id]
    for (const slug of story.articles || []) {
      threadLookup.set(slug, {
        threadId: story.id,
        threadLabel: story.label,
        threadArc: story.arc,
        threadSummary: story.summary || null,
        threadDay: Math.max(1, Math.ceil((Date.now() - firstDate.getTime()) / 86400000)),
        threadArticleCount: story.articles.length,
        threadContext: brief?.timeline || null,
      })
    }
  }
  const briefCount = Object.keys(contextBriefs).length
  console.log(`  Ledger: ${threadLookup.size} articles mapped to ${ledger.stories.filter(s => s.arc !== 'fading' && s.importance >= 2).length} threads (${briefCount} context briefs)`)
}

// Context briefs: articles with slug-keyed briefs get context
let eduCount = 0
for (const [id, brief] of Object.entries(contextBriefs)) {
  const existing = threadLookup.get(id)
  if (existing?.threadContext) continue // already has thread context — skip
  threadLookup.set(id, {
    ...(existing || {}),
    threadId: id,
    threadLabel: existing?.threadLabel || brief.label,
    ...(existing?.threadArc && { threadArc: existing.threadArc }),
    ...(existing?.threadSummary && { threadSummary: existing.threadSummary }),
    ...(existing?.threadDay && { threadDay: existing.threadDay }),
    ...(existing?.threadArticleCount && { threadArticleCount: existing.threadArticleCount }),
    threadContext: brief.timeline,
  })
  eduCount++
}
if (eduCount > 0) console.log(`  Edu context: ${eduCount} articles with educational briefs`)

// Only process articles from the last 14 days — older ones don't appear in any output
// (homepage window is 24h + MIN_PER_CATEGORY backfill, heatmap is 72h, feed is 30 recent)
const BUILD_WINDOW_DAYS = 14
const buildCutoffDate = new Date(Date.now() - BUILD_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

const articles = readdirSync(CONTENT_DIR)
  .filter(f => f.endsWith('.md') && f !== 'example.md' && f.slice(0, 10) >= buildCutoffDate)
  .map(file => {
    const article = buildArticle(file)
    console.log(`  Built: ${article.slug}`)
    return { ...article, addedAt: statSync(join(CONTENT_DIR, file)).mtimeMs }
  })

// Sort once, compute cutoff once — shared by homepage and API
const sorted = articles.sort((a, b) => b.addedAt - a.addedAt)
const cutoff = Date.now() - WINDOW_MS

// Generate audio briefing player HTML
let audioBriefingHtml = ''
const briefingMetaPath = join(ROOT, 'content', 'audio', 'briefing-meta.json')
if (existsSync(briefingMetaPath)) {
  const meta = JSON.parse(readFileSync(briefingMetaPath, 'utf-8'))
  const age = Date.now() - new Date(meta.generated).getTime()
  if (age < 36 * 60 * 60 * 1000) {
    const genHour = new Date(meta.generated).getUTCHours()
    const cycles = [3, 9, 15, 21]
    const cycleHour = cycles.reduce((prev, c) => c <= genHour ? c : prev, 0)
    const briefingKey = meta.date + '-' + String(cycleHour).padStart(2, '0') + '00'
    const playSvg = '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><polygon points="3,1 12,7 3,13"/></svg>'
    const pauseSvg = '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="1" width="3.5" height="12"/><rect x="8.5" y="1" width="3.5" height="12"/></svg>'
    audioBriefingHtml = `<div class="audio-briefing" data-key="${briefingKey}">
      <button class="briefing-play" aria-label="Play briefing">${playSvg}</button>
      <span class="briefing-label">Today's briefing</span>
      <div class="briefing-track"><div class="briefing-bar"></div></div>
      <audio preload="none" src="/audio/briefing-${meta.date}.mp3"></audio>
    </div>
    <script>!function(){var b=document.querySelector('.audio-briefing');if(!b)return;
var a=b.querySelector('audio'),p=b.querySelector('.briefing-play'),l=b.querySelector('.briefing-label'),t=b.querySelector('.briefing-track'),r=b.querySelector('.briefing-bar'),k='briefing-listened-'+b.dataset.key;
var play='${playSvg.replace(/'/g, "\\'")}',pause='${pauseSvg.replace(/'/g, "\\'")}',txt='Today\\u2019s briefing';
var ms='mediaSession'in navigator?navigator.mediaSession:null;
function fmt(s){var m=Math.floor(s/60),ss=Math.floor(s%60);return m+':'+(ss<10?'0':'')+ss}
function syncPos(){if(ms&&a.duration){ms.setPositionState({duration:a.duration,playbackRate:a.playbackRate,position:a.currentTime})}}
function doPlay(){a.play();p.innerHTML=pause;if(ms)ms.playbackState='playing'}
function doPause(){a.pause();p.innerHTML=play;l.textContent=txt;if(ms)ms.playbackState='paused'}
if(localStorage.getItem(k))b.classList.add('listened');
b.style.cursor='pointer';
b.onclick=function(e){if(e.target.closest('.briefing-track'))return;a.paused?doPlay():doPause()};
a.ontimeupdate=function(){r.style.width=a.duration?(a.currentTime/a.duration*100)+'%':'0';if(a.duration&&!a.paused)l.textContent=fmt(a.duration-a.currentTime);if(a.currentTime>10&&!localStorage.getItem(k)){localStorage.setItem(k,'1');b.classList.add('listened')}syncPos()};
a.onended=function(){p.innerHTML=play;r.style.width='0';l.textContent=txt;localStorage.setItem(k,'1');b.classList.add('listened');if(ms)ms.playbackState='none'};
t.onclick=function(e){if(a.duration){a.currentTime=e.offsetX/t.offsetWidth*a.duration;syncPos()}};
if(ms){ms.metadata=new MediaMetadata({title:'Daily Briefing',artist:'zuhd.news',album:'${meta.date}',artwork:[{src:'/briefing-artwork-192.png',sizes:'192x192',type:'image/png'},{src:'/briefing-artwork.png',sizes:'512x512',type:'image/png'}]});
ms.setActionHandler('play',doPlay);
ms.setActionHandler('pause',doPause);
ms.setActionHandler('stop',function(){a.pause();a.currentTime=0;p.innerHTML=play;r.style.width='0';l.textContent=txt;ms.playbackState='none'});
ms.setActionHandler('seekto',function(d){if(d.fastSeek&&'fastSeek'in a)a.fastSeek(d.seekTime);else a.currentTime=d.seekTime;syncPos()});
ms.setActionHandler('seekbackward',function(d){a.currentTime=Math.max(0,a.currentTime-(d.seekOffset||15));syncPos()});
ms.setActionHandler('seekforward',function(d){a.currentTime=Math.min(a.duration||0,a.currentTime+(d.seekOffset||15));syncPos()});
}}()</script>`
  }
}

// Embed last cycle timestamp for reader.js
const lastCyclePath = join(ROOT, 'content', '.last-cycle.json')
const lastCycleTs = existsSync(lastCyclePath)
  ? (JSON.parse(readFileSync(lastCyclePath, 'utf-8')).timestamp ?? '')
  : ''

// Split body into sentences — shared with validate-articles.js
const splitBodySentences = splitBodySentencesShared

// (threadLookup moved above buildArticle calls)

// API feeds — pre-grouped, pre-split sentences for native rendering
const generated = new Date().toISOString()
const apiGrouped = groupByWindow(sorted, cutoff)
const apiCategories = Object.fromEntries(
  Object.entries(apiGrouped).map(([cat, articles]) => [
    cat,
    articles.map(({ slug, meta, addedAt, body, sources, concepts }) => {
      const thread = threadLookup.get(slug)
      return {
        slug,
        title: meta.title || 'Untitled',
        date: meta.date,
        addedAt,
        source: sources[0]?.name || null,
        sourceUrl: sources[0]?.url || null,
        sources: sources.map(s => ({ name: s.name, country: s.country || null, sentiment: s.sentiment != null ? Number(s.sentiment) : null })),
        concepts: concepts.map(c => typeof c === 'object' ? c.label : c).filter(Boolean),
        eventCoverage: meta.eventCoverage != null ? Number(meta.eventCoverage) : null,
        sentimentDivergence: meta.sentimentDivergence != null ? Number(meta.sentimentDivergence) : null,
        location: meta.location || null,
        lat: meta.lat != null ? Number(meta.lat) : null,
        lng: meta.lng != null ? Number(meta.lng) : null,
        ...(thread && {
          ...(thread.threadContext && { threadId: thread.threadId }),
          threadLabel: thread.threadLabel,
          threadArc: thread.threadArc,
          threadSummary: thread.threadSummary,
          threadDay: thread.threadDay,
          threadArticleCount: thread.threadArticleCount,
        }),
        sentences: splitBodySentences(body)
      }
    })
  ])
)
const apiArticles = Object.values(apiCategories).flat().sort((a, b) => b.addedAt - a.addedAt)

mkdirSync(join(DIST_DIR, 'api', 'articles'), { recursive: true })
mkdirSync(join(DIST_DIR, 'api', 'context'), { recursive: true })

// Write each context brief as a separate JSON file for mobile consumption
const contextIndex = {}
for (const [id, brief] of Object.entries(contextBriefs)) {
  if (!brief?.timeline) continue
  const payload = {
    id,
    type: brief.type || 'thread',
    label: brief.label,
    category: brief.category,
    articleCount: brief.articleCount,
    generatedAt: brief.generatedAt,
    timeline: brief.timeline,
    ...(Array.isArray(brief.sources) && brief.sources.length ? { sources: brief.sources } : {}),
    ...(Array.isArray(brief.blocks) && brief.blocks.length ? { blocks: brief.blocks } : {}),
  }
  writeFileSync(join(DIST_DIR, 'api', 'context', `${id}.json`), JSON.stringify(payload))
  contextIndex[id] = { type: brief.type || 'thread', label: brief.label, category: brief.category, articleCount: brief.articleCount, generatedAt: brief.generatedAt }
}
if (Object.keys(contextIndex).length > 0) {
  console.log(`  Built: api/context/ (${Object.keys(contextIndex).length} briefs)`)
}

// Chokepoints snapshot — ambient globe layer on mobile, and the data
// source the web chokepoint-sheet island reads when a reader taps a
// chokepoint marker. Web enriches the blob with `relatedArticles[]` so
// the sheet can show matching zuhd coverage without shipping the full
// article feed client-side. Missing input file is a graceful degrade:
// mobile + web both treat a 404 as "no layer this run".
const chokepointsSrc = join(ROOT, 'content', '.chokepoints.json')
if (existsSync(chokepointsSrc)) {
  const raw = JSON.parse(readFileSync(chokepointsSrc, 'utf8'))
  // Match articles against each chokepoint by topicTag. Tag hits against
  // title + concepts + location; lowercased whole-ish word match. Cheap
  // enough at 14-day window × 11 chokepoints (~200 × 11 = 2.2k lookups).
  const normalize = (s) => String(s || '').toLowerCase()
  const enriched = {
    ...raw,
    chokepoints: (raw.chokepoints || []).map((c) => {
      const tags = (c.topicTags || []).map(normalize)
      if (!tags.length) return { ...c, relatedArticles: [] }
      const hits = []
      for (const a of sorted) {
        const hay = [
          a.title,
          a.meta.location,
          ...(a.concepts || []).map((x) => (typeof x === 'object' ? x.label : x)),
        ].map(normalize).join(' ')
        if (tags.some((t) => hay.includes(t))) {
          hits.push({
            slug: a.slug,
            title: a.title,
            date: a.meta.date,
            dateFormatted: a.dateFormatted,
          })
          if (hits.length >= 8) break
        }
      }
      return { ...c, relatedArticles: hits }
    }),
  }
  writeFileSync(join(DIST_DIR, 'api', 'chokepoints.json'), JSON.stringify(enriched))
  console.log(`  Built: api/chokepoints.json (${enriched.chokepoints.length} chokepoints)`)
}

// Trends snapshot — full indicator catalog with values/periods. Mobile
// EntitySheet fetches this to render charts for any entity tapped in an
// article body. Ships today's snapshot as api/trends.json (single file,
// always current for this deploy); if mobile wants historical, /trends/
// per-date JSONs remain queryable via the git repo.
const today = new Date().toISOString().slice(0, 10)
const trendsSrc = join(ROOT, 'content', 'trends', `${today}.json`)
if (existsSync(trendsSrc)) {
  cpSync(trendsSrc, join(DIST_DIR, 'api', 'trends.json'))
  const n = JSON.parse(readFileSync(trendsSrc, 'utf8')).indicators?.length ?? 0
  console.log(`  Built: api/trends.json (${n} indicators)`)
}

// Legacy flat endpoint (backwards compatible)
writeFileSync(join(DIST_DIR, 'api', 'articles.json'), JSON.stringify({ generated, articles: apiArticles.map(a => ({ ...a, category: CATEGORY_ORDER.find(c => apiCategories[c]?.includes(a)) ?? 'politics', body: a.sentences.join(' ') })) }))
console.log(`  Built: api/articles.json (${apiArticles.length} articles)`)

// Per-category endpoints
for (const [cat, catArticles] of Object.entries(apiCategories)) {
  writeFileSync(join(DIST_DIR, 'api', 'articles', `${cat}.json`), JSON.stringify({ generated, category: cat, articles: catArticles }))
  console.log(`  Built: api/articles/${cat}.json (${catArticles.length} articles)`)
}

// Briefing availability for meta
const apiBriefingMetaPath = join(ROOT, 'content', 'audio', 'briefing-meta.json')
let briefingInfo = null
if (existsSync(apiBriefingMetaPath)) {
  const bm = JSON.parse(readFileSync(apiBriefingMetaPath, 'utf-8'))
  const age = Date.now() - new Date(bm.generated).getTime()
  if (age < 36 * 60 * 60 * 1000) {
    briefingInfo = { date: bm.date, available: true, duration: bm.duration ?? 0 }
  }
}

// Pre-grouped endpoint for mobile
writeFileSync(join(DIST_DIR, 'api', 'feed.json'), JSON.stringify({
  generated,
  categories: apiCategories,
  briefing: briefingInfo,
  contexts: contextIndex
}))
console.log(`  Built: api/feed.json (${apiArticles.length} articles, pre-grouped)`)

// Heatmap endpoint — 72h of geo-located article points for globe time-decay rendering
const HEATMAP_WINDOW_MS = 72 * 60 * 60 * 1000
const heatmapCutoff = Date.now() - HEATMAP_WINDOW_MS
const heatmapPoints = sorted
  .filter(a => a.addedAt >= heatmapCutoff && a.meta.lat != null && a.meta.lng != null)
  .map(a => {
    const tl = a.meta.threadLabel
    return {
      lat: Number(a.meta.lat),
      lng: Number(a.meta.lng),
      c: Number(a.meta.eventCoverage) || 0,
      t: Math.round(a.addedAt),
      l: tl ? (tl.includes(':') ? tl.slice(0, tl.indexOf(':')) : tl) : (a.meta.title || ''),
    }
  })
writeFileSync(join(DIST_DIR, 'api', 'heatmap.json'),
  JSON.stringify({ generated, points: heatmapPoints }))
console.log(`  Built: api/heatmap.json (${heatmapPoints.length} points, 72h)`)

// Atom feed for RSS readers
const escXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const feedArticles = sorted.filter(a => a.addedAt >= cutoff).slice(0, 30)
const atomEntries = feedArticles.map(a => `  <entry>
    <title>${escXml(a.meta.title || 'Untitled')}</title>
    <link href="https://zuhd.news/#${a.slug}" rel="alternate"/>
    <id>tag:zuhd.news,${a.meta.date?.slice(0, 10) || '2026'}:${a.slug}</id>
    <updated>${new Date(a.meta.date || a.addedAt).toISOString()}</updated>
    <category term="${escXml(a.meta.category || 'politics')}"/>
    <summary>${escXml(a.body.trim())}</summary>${a.sources[0] ? `\n    <source><title>${escXml(a.sources[0].name)}</title></source>` : ''}
  </entry>`).join('\n')

const atomFeed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>zuhd.news</title>
  <subtitle>Global news, no noise.</subtitle>
  <link href="https://zuhd.news/" rel="alternate"/>
  <link href="https://zuhd.news/feed.xml" rel="self"/>
  <id>tag:zuhd.news,2025:feed</id>
  <updated>${generated}</updated>
  <icon>https://zuhd.news/favicon.svg</icon>
${atomEntries}
</feed>
`
writeFileSync(join(DIST_DIR, 'feed.xml'), atomFeed)
console.log(`  Built: feed.xml (${feedArticles.length} entries)`)

writeFileSync(join(DIST_DIR, 'api', 'meta.json'), JSON.stringify({
  generated,
  total: apiArticles.length,
  categories: Object.fromEntries(CATEGORY_ORDER.filter(c => c in apiCategories).map(c => [c, apiCategories[c].length])),
  briefing: briefingInfo
}))
console.log('  Built: api/meta.json')

// Indicator map: id → {label, kind}. Drives the article entity strip
// so we only surface chips that actually resolve to a /e/{id} page +
// /api/entity/{id}.json blob. Computed once here; fed to every
// buildArticlePage() call.
const indicatorMap = new Map()
{
  const today = new Date().toISOString().slice(0, 10)
  const candidates = [join(ROOT, 'content', 'trends', `${today}.json`)]
  // Fall back to the most recent snapshot when today's hasn't been
  // generated yet — identical to what entity-pages.js does internally.
  const trendsDir = join(ROOT, 'content', 'trends')
  if (existsSync(trendsDir)) {
    const names = readdirSync(trendsDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
    if (names.length) candidates.push(join(trendsDir, names[names.length - 1]))
  }
  for (const p of candidates) {
    if (!existsSync(p)) continue
    const trends = JSON.parse(readFileSync(p, 'utf8'))
    for (const ind of trends.indicators || []) {
      if (ind?.id && !indicatorMap.has(ind.id)) {
        indicatorMap.set(ind.id, { label: ind.label, kind: ind.cadence || 'indicator' })
      }
    }
    if (indicatorMap.size) break
  }
}

// Homepage and static pages
const homepage = buildHomepage(sorted, cutoff, homepageTemplate)
  .replace(/{{audioBriefing}}/g, audioBriefingHtml)
  .replace('</body>', lastCycleTs ? `<script>window.__lastCycle="${lastCycleTs}"</script></body>` : '</body>')
writeFileSync(join(DIST_DIR, 'index.html'), homepage)
console.log(`  Built: index.html (${articles.length} articles)`)

// Per-article static pages at /a/{slug}.html — replaces the legacy
// functions/a/[slug].js runtime redirect with real, crawlable, share-ready
// HTML. Uses `sorted` so prev/next navigation follows reverse-chronological
// order (newest → oldest), matching the homepage list semantics.

mkdirSync(join(DIST_DIR, 'a'), { recursive: true })
for (let i = 0; i < sorted.length; i++) {
  const article = sorted[i]
  const prev = sorted[i + 1] ?? null
  const next = sorted[i - 1] ?? null
  const thread = threadLookup.get(article.slug) || null
  const html = buildArticlePage(article, prev, next, thread, articleTemplate, indicatorMap)
  writeFileSync(join(DIST_DIR, 'a', `${article.slug}.html`), html)
}
console.log(`  Built: a/ (${sorted.length} article pages)`)

// Islands: compile public/islands/*.ts via esbuild into dist/islands/*.js.
// Each island is an ESM entry that reader.js lazy-loads on first
// activation of its affordance (a <button data-island="..."> click).
const islandsResult = await buildIslands()
if (islandsResult.count > 0) {
  console.log(`  Built: islands/ (${islandsResult.count} entries)`)
}

// Per-article OG images at /api/og/{slug}.png — typography + monochrome
// orthographic map inset. Generated at build time; Cloudflare Pages serves
// the static PNGs from the edge with standard cache headers. OG scrapers
// (WhatsApp, X, iMessage, Facebook) dereference og:image URLs emitted by
// article pages and render rich previews with the article's map view.
//
// OG rendering dominates the build (~160 s for 852 articles). We cache
// each PNG outside dist/ keyed by a content hash of the render inputs,
// so cold builds stay expensive but warm rebuilds (the typical dev loop)
// are a pure file copy. SKIP_OG=1 bypasses generation entirely — used by
// `npm run dev` since local previews don't need share cards.
mkdirSync(join(DIST_DIR, 'api', 'og'), { recursive: true })
if (process.env.SKIP_OG === '1') {
  console.log('  Skipped: api/og/ (SKIP_OG=1)')
} else {
  const OG_CACHE_DIR = join(ROOT, '.cache', 'og')
  const OG_VERSION = 'v3' // bump when og-image.js rendering changes
  mkdirSync(OG_CACHE_DIR, { recursive: true })
  const ogStart = Date.now()
  let cached = 0
  let rendered = 0
  for (const article of sorted) {
    const inputs = {
      v: OG_VERSION,
      title: article.title,
      category: article.meta.category || null,
      date: article.meta.date,
      location: article.meta.location || null,
      lat: article.meta.lat != null ? Number(article.meta.lat) : null,
      lng: article.meta.lng != null ? Number(article.meta.lng) : null,
    }
    const key = createHash('sha1').update(JSON.stringify(inputs)).digest('hex')
    const cachePath = join(OG_CACHE_DIR, `${key}.png`)
    const dstPath = join(DIST_DIR, 'api', 'og', `${article.slug}.png`)
    let png
    if (existsSync(cachePath)) {
      png = readFileSync(cachePath)
      cached++
    } else {
      png = buildOgPng(inputs, 'light')
      writeFileSync(cachePath, png)
      rendered++
    }
    writeFileSync(dstPath, png)
  }
  console.log(
    `  Built: api/og/ (${sorted.length} OG images · ${cached} cached + ${rendered} rendered in ${((Date.now() - ogStart) / 1000).toFixed(1)}s)`,
  )
}

// Per-category pages at /c/{category}.html — chronological list of
// every article in the category within the build window. Each category
// page is a simple archetype: header + headline list, no reader chrome.
const categoryPageTemplate = `<!-- بسم الله الرحمن الرحيم -->
<!DOCTYPE html>
<html lang="en">
<head>
  __HEAD__
  <link rel="alternate" type="application/atom+xml" title="zuhd.news" href="/feed.xml">
  <title>__CAT_CAP__ — zuhd.news</title>
  <meta name="description" content="__DESC__">
  <link rel="canonical" href="https://zuhd.news/c/__CAT__">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="zuhd.news">
  <meta property="og:title" content="__CAT_CAP__ — zuhd.news">
  <meta property="og:description" content="__DESC__">
  <meta property="og:url" content="https://zuhd.news/c/__CAT__">
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
    <article class="category-page">
      <header class="category-page-header">
        <span class="label">Category</span>
        <h1 class="t-display category-page-title">__CAT_CAP__</h1>
        <p class="t-caption">__COUNT__ articles · last __DAYS__ days</p>
      </header>
      <ol class="category-article-list">__ROWS__</ol>
    </article>
  </main>
  <footer>
    <nav class="footer-links">
      <a href="/about">about</a> <a href="/contact">contact</a> <a href="/mcp">mcp</a> <a href="/privacy">privacy</a>
    </nav>
  </footer>
  <script type="module" src="/island-loader.js" defer></script>
</body>
</html>`

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)
mkdirSync(join(DIST_DIR, 'c'), { recursive: true })
const byCategory = {}
for (const a of sorted) {
  const cat = a.meta.category || 'politics'
  ;(byCategory[cat] ??= []).push(a)
}
// Group rows under a date heading so a 14-day archive scans without the
// date column repeating on every row. Days come in reverse-chronological
// order (newest first).
const formatDayHeading = (iso) => {
  const d = new Date(iso)
  const today = new Date()
  const yest = new Date(Date.now() - 86400000)
  const sameDay = (a, b) => a.toDateString() === b.toDateString()
  if (sameDay(d, today)) return 'Today'
  if (sameDay(d, yest)) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}
for (const cat of CATEGORY_ORDER) {
  const items = (byCategory[cat] || [])
    .slice()
    .sort((a, b) => (b.meta.date || '').localeCompare(a.meta.date || ''))
  if (items.length === 0) continue
  const groups = []
  let currentDay = null
  for (const a of items) {
    const day = (a.meta.date || '').slice(0, 10)
    if (day !== currentDay) {
      currentDay = day
      groups.push({ day, items: [] })
    }
    groups[groups.length - 1].items.push(a)
  }
  const rows = groups.map(g => `<li class="category-day-group">
      <h2 class="category-day-heading"><time datetime="${g.day}">${formatDayHeading(g.day)}</time></h2>
      <ol class="category-day-list">${g.items.map(a => `<li>
        <a class="category-article-row" href="/a/${a.slug}">
          <span class="category-article-title">${escHtmlAttr(a.title)}</span>
          ${a.sources[0]?.name ? `<span class="t-source-host">${escHtmlAttr(a.sources[0].name)}</span>` : ''}
        </a>
      </li>`).join('')}</ol>
    </li>`).join('\n')
  const html = categoryPageTemplate
    .replace(/__HEAD__/g, headCommon)
    .replace(/__CAT__/g, cat)
    .replace(/__CAT_CAP__/g, capitalize(cat))
    .replace(/__COUNT__/g, String(items.length))
    .replace(/__DAYS__/g, String(BUILD_WINDOW_DAYS))
    .replace(/__DESC__/g, escHtmlAttr(`${items.length} ${cat} articles on zuhd.news. Minimalist global news, typography-first.`))
    .replace(/__ROWS__/g, rows)
  writeFileSync(join(DIST_DIR, 'c', `${cat}.html`), html)
}
console.log(`  Built: c/ (${CATEGORY_ORDER.filter(c => (byCategory[c]||[]).length > 0).length} category pages)`)

// Per-entity pages at /e/{id}.html — stock/commodity/index/chokepoint.
// Renders a monochrome inline SVG sparkline + the articles that
// reference the entity via frontmatter entities[].indicatorId.
const entityResult = buildEntityPages({
  sorted,
  distDir: DIST_DIR,
  headCommon,
})
console.log(`  Built: e/ (${entityResult.count} entity pages)`)

// Per-country pages at /country/{ISO2}.html — country profile (flag,
// capital, 26 metrics × percentile strip × source attribution) + recent
// coverage for articles datelined in the country. Reads COUNTRY_DATA,
// COUNTRY_AUGMENTED, and country-ranking.ts directly from /shared/.
const countryResult = await buildCountryPages({
  sorted,
  distDir: DIST_DIR,
  templatesDir: TEMPLATES_DIR,
  headCommon,
})
console.log(`  Built: country/ (${countryResult.count} pages)`)

// sitemap.xml covers homepage, static pages, and all article pages.
// Cloudflare Pages serves /a/{slug}.html at /a/{slug} (extensionless).
const staticPages = ['about', 'contact', 'privacy', 'mcp']
const sitemapEntries = [
  `  <url><loc>https://zuhd.news/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>`,
  ...staticPages.map(p => `  <url><loc>https://zuhd.news/${p}</loc><changefreq>monthly</changefreq><priority>0.3</priority></url>`),
  ...sorted.map(a => `  <url><loc>https://zuhd.news/a/${a.slug}</loc><lastmod>${new Date(a.meta.date || a.addedAt).toISOString()}</lastmod><priority>0.8</priority></url>`),
  ...(countryResult.codes || []).map(cc => `  <url><loc>https://zuhd.news/country/${cc}</loc><changefreq>weekly</changefreq><priority>0.5</priority></url>`),
  ...CATEGORY_ORDER.filter(c => (byCategory[c]||[]).length > 0).map(c => `  <url><loc>https://zuhd.news/c/${c}</loc><changefreq>hourly</changefreq><priority>0.7</priority></url>`),
  ...(entityResult.ids || []).map(id => `  <url><loc>https://zuhd.news/e/${id}</loc><changefreq>daily</changefreq><priority>0.5</priority></url>`),
]
writeFileSync(join(DIST_DIR, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries.join('\n')}
</urlset>
`)
console.log(`  Built: sitemap.xml (${sitemapEntries.length} URLs)`)

for (const page of staticPages) {
  const pagePath = join(ROOT, 'content', `${page}.md`)
  if (!existsSync(pagePath)) continue
  const body = readFileSync(pagePath, 'utf-8')
  const pageContent = `<h1 class="page-title">${page}</h1><div class="about-body">${markdownToHtml(body)}</div>`
  writeFileSync(join(DIST_DIR, `${page}.html`), homepage
    .replace('<div class="article-view-inner"></div>', `<div class="article-view-inner">${pageContent}</div>`)
    .replace('article-view" aria-live="polite" hidden', `article-view" aria-live="polite" data-page="${page}"`)
    .replace('<title>zuhd.news</title>', `<title>zuhd.news — ${page}</title>`)
    .replace('<link rel="canonical" href="https://zuhd.news/">', `<link rel="canonical" href="https://zuhd.news/${page}">`)
    .replace('<meta property="og:title" content="zuhd.news">', `<meta property="og:title" content="zuhd.news — ${page}">`)
    .replace('<meta property="og:url" content="https://zuhd.news/">', `<meta property="og:url" content="https://zuhd.news/${page}">`)
    .replace(`href="/${page}"`, `href="/${page}" aria-current="page"`)
  )
  console.log(`  Built: ${page}.html`)
}

console.log('Done.')
