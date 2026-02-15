import { readFileSync, writeFileSync, mkdirSync, readdirSync, cpSync, existsSync, rmSync } from 'fs'
import { join, basename } from 'path'

const ROOT = new URL('..', import.meta.url).pathname
const CONTENT_DIR = join(ROOT, 'content', 'articles')
const DIST_DIR = join(ROOT, 'dist')
const TEMPLATES_DIR = join(ROOT, 'templates')

const parseFrontmatter = (content) => {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { meta: {}, body: content }

  const meta = {}
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
  }
  return { meta, body: match[2].trim() }
}

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
    // Extract source mark before splitting
    const sourceRe = /(\s*<span class="end-source">[\s\S]*?<\/span>)$/
    const sourceMatch = inner.match(sourceRe)
    const content = sourceMatch ? inner.replace(sourceRe, '') : inner
    const source = sourceMatch ? sourceMatch[1] : ''

    const sentences = content.split(/(?<=[.!?][\u201D\u2019]?(?:<\/em>)?)\s+(?=[A-Z\u00C0-\u024F])/)
    if (sentences.length <= 1) return '<p>' + content + source + '</p>'

    const spans = sentences.map(s => `<span class="s">${s}</span>`)
    // Attach source to last sentence
    spans[spans.length - 1] = `<span class="s">${sentences[sentences.length - 1]}${source}</span>`
    return '<p>' + spans.join('') + '</p>'
  })
}

const formatDate = (dateStr) =>
  new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

const formatTime = (dateStr) =>
  new Date(dateStr).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })

const buildArticle = (filename, articleTemplate) => {
  const raw = readFileSync(join(CONTENT_DIR, filename), 'utf-8')
  const { meta, body } = parseFrontmatter(raw)
  const sourcemark = meta.source ? ` <span class="end-source">\u00B7 ${meta.source}</span>` : ''
  const bodyHtml = splitSentences(markdownToHtml(body).replace(/<\/p>\s*$/, `${sourcemark}</p>`))
  const slug = basename(filename, '.md')

  const title = smartQuotes(meta.title || 'Untitled')
  const dateFormatted = formatDate(meta.date)
  const timeFormatted = formatTime(meta.date)
  const description = body.split(/[.!?]/)[0]?.trim().slice(0, 200) || title

  const html = articleTemplate
    .replace(/{{title}}/g, title)
    .replace(/{{slug}}/g, slug)
    .replace(/{{description}}/g, description)
    .replace(/{{date}}/g, dateFormatted)
    .replace(/{{category}}/g, meta.category || '')
    .replace(/{{source}}/g, meta.source || '')
    .replace(/{{sourceUrl}}/g, meta.sourceUrl || '#')
    .replace(/{{content}}/g, bodyHtml)

  return { slug, html, meta, bodyHtml, title, dateFormatted, timeFormatted }
}

const PER_CATEGORY_LIMIT = 5

const buildHomepage = (articles, homepageTemplate) => {
  const sorted = articles.sort((a, b) => new Date(b.meta.date) - new Date(a.meta.date))

  const grouped = {}
  for (const a of sorted) {
    const cat = a.meta.category || 'uncategorised'
    if ((grouped[cat]?.length ?? 0) >= PER_CATEGORY_LIMIT) continue;
    (grouped[cat] ??= []).push({
      slug: a.slug,
      title: a.title,
      date: a.meta.date,
      dateFormatted: a.dateFormatted,
      timeFormatted: a.timeFormatted,
      source: a.meta.source || '',
      sourceUrl: a.meta.sourceUrl || '#',
      category: cat,
      bodyHtml: a.bodyHtml
    })
  }

  const preferredOrder = ['politics', 'conflict', 'economy', 'science', 'tech']
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
        <h2><a href="/articles/${a.slug}.html">${a.title}</a></h2>
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
mkdirSync(join(DIST_DIR, 'articles'), { recursive: true })

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

// Read assets for inlining
const cssContent = readFileSync(join(ROOT, 'public', 'style.css'), 'utf-8')
const jsContent = readFileSync(join(ROOT, 'public', 'reader.js'), 'utf-8')

const articleTemplate = readFileSync(join(TEMPLATES_DIR, 'article.html'), 'utf-8')
  .replace('{{inlineCSS}}', cssContent)
const homepageTemplate = readFileSync(join(TEMPLATES_DIR, 'index.html'), 'utf-8')
  .replace('{{inlineCSS}}', cssContent)
  .replace('{{inlineJS}}', jsContent)

const files = readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md') && f !== 'example.md')
const articles = []

for (const file of files) {
  const { slug, html, meta, bodyHtml, title, dateFormatted, timeFormatted } = buildArticle(file, articleTemplate)
  writeFileSync(join(DIST_DIR, 'articles', `${slug}.html`), html)
  articles.push({ slug, meta, bodyHtml, title, dateFormatted, timeFormatted })
  console.log(`  Built: ${slug}`)
}

// Generate audio briefing player HTML
let audioBriefingHtml = ''
const briefingMetaPath = join(ROOT, 'content', 'audio', 'briefing-meta.json')
if (existsSync(briefingMetaPath)) {
  const meta = JSON.parse(readFileSync(briefingMetaPath, 'utf-8'))
  const age = Date.now() - new Date(meta.generated).getTime()
  if (age < 36 * 60 * 60 * 1000) {
    audioBriefingHtml = `<div class="audio-briefing">
      <button class="briefing-play" aria-label="Play daily briefing">\u25B6</button>
      <span class="briefing-label">Daily briefing</span>
      <div class="briefing-track"><div class="briefing-bar"></div></div>
      <audio preload="none" src="/audio/briefing-${meta.date}.mp3"></audio>
    </div>
    <script>!function(){var b=document.querySelector('.audio-briefing');if(!b)return;var a=b.querySelector('audio'),p=b.querySelector('.briefing-play'),t=b.querySelector('.briefing-track'),r=b.querySelector('.briefing-bar');p.onclick=function(){a.paused?(a.play(),p.textContent='\\u275A\\u275A'):(a.pause(),p.textContent='\\u25B6')};a.ontimeupdate=function(){r.style.width=a.duration?(a.currentTime/a.duration*100)+'%':'0'};a.onended=function(){p.textContent='\\u25B6';r.style.width='0'};t.onclick=function(e){if(a.duration){a.currentTime=e.offsetX/t.offsetWidth*a.duration}}}()</script>`
  }
}

const homepage = buildHomepage(articles, homepageTemplate)
  .replace(/{{audioBriefing}}/g, audioBriefingHtml)
writeFileSync(join(DIST_DIR, 'index.html'), homepage)
console.log(`  Built: index.html (${articles.length} articles)`)

// Build static pages (about, sources)
const pageTemplate = readFileSync(join(TEMPLATES_DIR, 'about.html'), 'utf-8')
  .replace('{{inlineCSS}}', cssContent)

for (const page of ['about', 'sources', 'navigation', 'contact', 'privacy']) {
  const pagePath = join(ROOT, 'content', `${page}.md`)
  if (!existsSync(pagePath)) continue
  const body = readFileSync(pagePath, 'utf-8')
  const html = pageTemplate
    .replace('{{content}}', markdownToHtml(body))
    .replace(/zuhd\.news — about/, `zuhd.news — ${page}`)
  writeFileSync(join(DIST_DIR, `${page}.html`), html)
  console.log(`  Built: ${page}.html`)
}

console.log('Done.')
