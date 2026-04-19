import { readFileSync, writeFileSync, mkdirSync, readdirSync, cpSync, existsSync, rmSync, statSync } from 'fs'
import { join, basename } from 'path'
import { parseFrontmatter } from './lib/frontmatter.js'
import { splitSentences as splitBodySentencesShared, ABBREVS } from './lib/sentences.js'

const ROOT = new URL('..', import.meta.url).pathname
const CONTENT_DIR = join(ROOT, 'content', 'articles')
const DIST_DIR = join(ROOT, 'dist')
const TEMPLATES_DIR = join(ROOT, 'templates')

const CATEGORY_ORDER = ['politics', 'economy', 'science', 'tech']

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

const markdownToHtml = (md) => {
  const html = smartQuotes(md)
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
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

  // Concept tags
  const concepts = Array.isArray(meta.concepts) ? meta.concepts : []
  const conceptsHtml = concepts.length > 0
    ? `<div class="article-concepts">${concepts.map(c => `<span class="concept-tag">${typeof c === 'object' ? c.label : c}</span>`).join('')}</div>`
    : ''

  const slug = basename(filename, '.md')
  return {
    slug, meta, body, sources, concepts,
    bodyHtml: splitSentences(markdownToHtml(body)) + sourcemark + conceptsHtml,
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

// Main build
console.log('Building zuhd.news...')

if (existsSync(DIST_DIR)) rmSync(DIST_DIR, { recursive: true })
mkdirSync(DIST_DIR, { recursive: true })

if (existsSync(join(ROOT, 'public')))
  cpSync(join(ROOT, 'public'), DIST_DIR, { recursive: true })

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
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="zuhd.news">
  <link rel="preload" href="/fonts/source-sans-3-var.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.json">
  <style>${cssContent}</style>`

const homepageTemplate = readFileSync(join(TEMPLATES_DIR, 'index.html'), 'utf-8')
  .replace('{{headCommon}}', headCommon)
  .replace('{{inlineJS}}', jsContent)

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

// Chokepoints snapshot — ambient globe layer on mobile. Missing file is a
// graceful degrade: the mobile hook treats a 404 as "no layer this run".
const chokepointsSrc = join(ROOT, 'content', '.chokepoints.json')
if (existsSync(chokepointsSrc)) {
  cpSync(chokepointsSrc, join(DIST_DIR, 'api', 'chokepoints.json'))
  const n = JSON.parse(readFileSync(chokepointsSrc, 'utf8')).chokepoints?.length ?? 0
  console.log(`  Built: api/chokepoints.json (${n} chokepoints)`)
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

// Homepage and static pages
const homepage = buildHomepage(sorted, cutoff, homepageTemplate)
  .replace(/{{audioBriefing}}/g, audioBriefingHtml)
  .replace('</body>', lastCycleTs ? `<script>window.__lastCycle="${lastCycleTs}"</script></body>` : '</body>')
writeFileSync(join(DIST_DIR, 'index.html'), homepage)
console.log(`  Built: index.html (${articles.length} articles)`)

for (const page of ['about', 'contact', 'sources', 'privacy', 'support', 'mcp']) {
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
