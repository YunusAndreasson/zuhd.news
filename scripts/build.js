import { readFileSync, writeFileSync, mkdirSync, readdirSync, cpSync, existsSync } from 'fs'
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

const markdownToHtml = (md) => {
  const html = md
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

const formatDate = (dateStr) =>
  new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

const formatTime = (dateStr) =>
  new Date(dateStr).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })

const buildArticle = (filename, articleTemplate) => {
  const raw = readFileSync(join(CONTENT_DIR, filename), 'utf-8')
  const { meta, body } = parseFrontmatter(raw)
  const bodyHtml = markdownToHtml(body)
  const slug = basename(filename, '.md')

  const html = articleTemplate
    .replace(/{{title}}/g, meta.title || 'Untitled')
    .replace(/{{date}}/g, formatDate(meta.date))
    .replace(/{{time}}/g, formatTime(meta.date))
    .replace(/{{category}}/g, meta.category || '')
    .replace(/{{source}}/g, meta.source || '')
    .replace(/{{sourceUrl}}/g, meta.sourceUrl || '#')
    .replace(/{{content}}/g, bodyHtml)

  return { slug, html, meta, bodyHtml }
}

const buildHomepage = (articles, homepageTemplate) => {
  const sorted = articles.sort((a, b) => new Date(b.meta.date) - new Date(a.meta.date))

  const grouped = {}
  for (const a of sorted) {
    const cat = a.meta.category || 'uncategorised';
    (grouped[cat] ??= []).push({
      slug: a.slug,
      title: a.meta.title || 'Untitled',
      date: a.meta.date,
      dateFormatted: formatDate(a.meta.date),
      timeFormatted: formatTime(a.meta.date),
      source: a.meta.source || '',
      sourceUrl: a.meta.sourceUrl || '#',
      category: cat,
      bodyHtml: a.bodyHtml
    })
  }

  const categoryOrder = Object.keys(grouped)
  const articleDataJson = JSON.stringify({ categoryOrder, articles: grouped })

  const fallbackArticleList = sorted
    .map(a => `
      <article class="article-preview">
        <span class="category">${a.meta.category || ''}</span>
        <h2><a href="/articles/${a.slug}.html">${a.meta.title || 'Untitled'}</a></h2>
        <time datetime="${a.meta.date}">${formatDate(a.meta.date)}</time>
      </article>`)
    .join('\n')

  const lastUpdated = new Date().toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
  })

  return homepageTemplate
    .replace(/{{articleDataJson}}/g, articleDataJson)
    .replace(/{{fallbackArticleList}}/g, fallbackArticleList)
    .replace(/{{lastUpdated}}/g, lastUpdated)
}

// Main build
console.log('Building zuhd.news...')

mkdirSync(join(DIST_DIR, 'articles'), { recursive: true })

if (existsSync(join(ROOT, 'public'))) {
  cpSync(join(ROOT, 'public'), DIST_DIR, { recursive: true })
}

const articleTemplate = readFileSync(join(TEMPLATES_DIR, 'article.html'), 'utf-8')
const homepageTemplate = readFileSync(join(TEMPLATES_DIR, 'index.html'), 'utf-8')

const files = readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md') && f !== '.gitkeep')
const articles = []

for (const file of files) {
  if (file === 'example.md') continue
  const { slug, html, meta, bodyHtml } = buildArticle(file, articleTemplate)
  writeFileSync(join(DIST_DIR, 'articles', `${slug}.html`), html)
  articles.push({ slug, meta, bodyHtml })
  console.log(`  Built: ${slug}`)
}

const homepage = buildHomepage(articles, homepageTemplate)
writeFileSync(join(DIST_DIR, 'index.html'), homepage)
console.log(`  Built: index.html (${articles.length} articles)`)
console.log('Done.')
