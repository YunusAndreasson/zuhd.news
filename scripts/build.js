import { readFileSync, writeFileSync, mkdirSync, readdirSync, cpSync, existsSync, rmSync, statSync } from 'fs'
import { join, basename } from 'path'
import { parseFrontmatter } from './lib/frontmatter.js'

const ROOT = new URL('..', import.meta.url).pathname
const CONTENT_DIR = join(ROOT, 'content', 'articles')
const DIST_DIR = join(ROOT, 'dist')
const TEMPLATES_DIR = join(ROOT, 'templates')

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
      if (!line.startsWith('<h') && !line.startsWith('<hr') && !line.startsWith('<ul') && !line.startsWith('<li')) {
        result.push(`<p>${line}</p>`)
      } else {
        result.push(line)
      }
    }
  }
  if (inList) result.push('</ul>')

  return result.join('\n')
}

const splitSentences = (html) => {
  return html.replace(/<p>([\s\S]*?)<\/p>/g, (match, inner) => {
    const sentences = inner.split(/(?<=[.!?][\u201D\u2019]?(?:<\/em>)?)\s+(?=[A-Z\u00C0-\u024F])/)
    if (sentences.length <= 1) return match

    const spans = sentences.map(s => `<span class="s">${s}</span>`)
    return '<p>' + spans.join(' ') + '</p>'
  })
}

const formatDate = (dateStr) =>
  new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

const buildArticle = (filename) => {
  const raw = readFileSync(join(CONTENT_DIR, filename), 'utf-8')
  const { meta, body } = parseFrontmatter(raw)
  const sourcemark = meta.source ? `<p class="end-source">${meta.source}</p>` : ''
  const bodyHtml = splitSentences(markdownToHtml(body)) + sourcemark
  const slug = basename(filename, '.md')

  const title = smartQuotes(meta.title || 'Untitled')
  const dateFormatted = formatDate(meta.date)

  return { slug, meta, bodyHtml, title, dateFormatted }
}

const WINDOW_MS = 24 * 60 * 60 * 1000  // 24 hours
const MIN_PER_CATEGORY = 10             // always show at least 10 even if older

const buildHomepage = (articles, homepageTemplate) => {
  const sorted = articles.sort((a, b) => b.addedAt - a.addedAt)
  const cutoff = Date.now() - WINDOW_MS

  const grouped = {}
  for (const a of sorted) {
    const cat = a.meta.category || 'uncategorised'
    const list = grouped[cat] ??= []
    if (a.addedAt >= cutoff || list.length < MIN_PER_CATEGORY) {
      list.push({
        slug: a.slug,
        title: a.title,
        date: a.meta.date,
        addedAt: a.addedAt,
        bodyHtml: a.bodyHtml,
        sourceUrl: a.meta.sourceUrl || ''
      })
    }
  }

  const preferredOrder = ['politics', 'economy', 'science', 'tech']
  const categoryOrder = [
    ...preferredOrder.filter(c => c in grouped),
    ...Object.keys(grouped).filter(c => !preferredOrder.includes(c))
  ]
  const articleDataJson = JSON.stringify({ categoryOrder, articles: grouped })

  const includedSlugs = new Set(Object.values(grouped).flat().map(a => a.slug))
  const fallbackArticleList = sorted
    .filter(a => includedSlugs.has(a.slug))
    .map(a => `
      <article class="article-preview">
        <span class="category">${a.meta.category || ''}</span>
        <h2><a href="/#${a.slug}">${a.title}</a></h2>
        <time datetime="${a.meta.date}">${a.dateFormatted}</time>
      </article>`)
    .join('\n')

  return homepageTemplate
    .replace(/{{articleDataJson}}/g, articleDataJson)
    .replace(/{{fallbackArticleList}}/g, fallbackArticleList)
}

// Main build
console.log('Building zuhd.news...')

if (existsSync(DIST_DIR)) rmSync(DIST_DIR, { recursive: true })
mkdirSync(DIST_DIR, { recursive: true })

if (existsSync(join(ROOT, 'public'))) {
  cpSync(join(ROOT, 'public'), DIST_DIR, { recursive: true })
}

// Copy audio files to dist
const audioSrc = join(ROOT, 'content', 'audio')
if (existsSync(audioSrc)) {
  mkdirSync(join(DIST_DIR, 'audio'), { recursive: true })
  for (const f of readdirSync(audioSrc)) {
    if (f.endsWith('.mp3') || f === 'briefing-meta.json')
      cpSync(join(audioSrc, f), join(DIST_DIR, 'audio', f))
  }
}

// Shared <head> partial — DRYs charset, viewport, theme-color, favicon, fonts, inline CSS
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

const files = readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md') && f !== 'example.md')
const articles = []

for (const file of files) {
  const { slug, meta, bodyHtml, title, dateFormatted } = buildArticle(file)
  const parsed = meta.date ? new Date(meta.date).getTime() : NaN
  const addedAt = isNaN(parsed) ? statSync(join(CONTENT_DIR, file)).mtimeMs : parsed
  articles.push({ slug, meta, bodyHtml, title, dateFormatted, addedAt })
  console.log(`  Built: ${slug}`)
}

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
    const cycleStr = String(cycleHour).padStart(2, '0') + ':00'
    const briefingKey = meta.date + '-' + cycleStr.replace(':', '')
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
let lastCycleTs = ''
const lastCyclePath = join(ROOT, 'content', '.last-cycle.json')
if (existsSync(lastCyclePath)) {
  const cycle = JSON.parse(readFileSync(lastCyclePath, 'utf-8'))
  if (cycle.timestamp) lastCycleTs = cycle.timestamp
}

const homepage = buildHomepage(articles, homepageTemplate)
  .replace(/{{audioBriefing}}/g, audioBriefingHtml)
  .replace('</body>', lastCycleTs ? `<script>window.__lastCycle="${lastCycleTs}"</script></body>` : '</body>')
writeFileSync(join(DIST_DIR, 'index.html'), homepage)
console.log(`  Built: index.html (${articles.length} articles)`)

// Build static pages (about, sources)
const pageTemplate = readFileSync(join(TEMPLATES_DIR, 'about.html'), 'utf-8')
  .replace('{{headCommon}}', headCommon)

for (const page of ['about', 'sources', 'privacy']) {
  const pagePath = join(ROOT, 'content', `${page}.md`)
  if (!existsSync(pagePath)) continue
  const body = readFileSync(pagePath, 'utf-8')
  const html = pageTemplate
    .replace('{{content}}', markdownToHtml(body))
    .replace(/\{\{pageName\}\}/g, page)
    .replace('</body>', lastCycleTs ? `<script>!function(){var ts="${lastCycleTs}",el=document.querySelector(".update-status");if(!el||!ts)return;var ago=Date.now()-new Date(ts).getTime(),h=Math.floor(ago/36e5),m=Math.floor(ago%36e5/6e4);el.textContent="Updated "+(h>0?h+"h ago":m<2?"just now":m+" min ago")}()</script></body>` : '</body>')
  writeFileSync(join(DIST_DIR, `${page}.html`), html)
  console.log(`  Built: ${page}.html`)
}

console.log('Done.')
