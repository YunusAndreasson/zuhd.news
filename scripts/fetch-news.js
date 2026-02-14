import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { XMLParser } from 'fast-xml-parser'

const ROOT = new URL('..', import.meta.url).pathname
const CONTENT_DIR = join(ROOT, 'content', 'articles')
const RSS_URL = 'https://www.aljazeera.com/xml/rss/all.xml'

// Categories we cover (global hard news)
const RELEVANT_CATEGORIES = [
  'news', 'politics', 'economy', 'climate', 'health',
  'science', 'technology', 'human rights', 'conflict', 'war',
  'middle east', 'europe', 'africa', 'asia', 'americas',
  'united nations', 'environment', 'business'
]

function slugify(title, date) {
  const d = new Date(date)
  const datePrefix = d.toISOString().slice(0, 10)
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
    .replace(/-$/, '')
  return `${datePrefix}-${slug}`
}

function getExistingArticles() {
  if (!existsSync(CONTENT_DIR)) return new Set()
  return new Set(
    readdirSync(CONTENT_DIR)
      .filter(f => f.endsWith('.md') && f !== 'example.md' && f !== '.gitkeep')
      .map(f => basename(f, '.md'))
  )
}

async function fetchRSS() {
  const res = await fetch(RSS_URL)
  if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`)
  const xml = await res.text()

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_'
  })
  const feed = parser.parse(xml)

  const items = feed?.rss?.channel?.item || []
  return items.map(item => ({
    title: item.title || '',
    description: item.description || '',
    link: item.link || '',
    pubDate: item.pubDate || '',
    category: Array.isArray(item.category)
      ? item.category[0]
      : (item.category || 'news')
  }))
}

function isRelevant(item) {
  const cat = (item.category || '').toLowerCase()
  const title = (item.title || '').toLowerCase()
  // Filter out opinion, features, galleries, videos, sports, entertainment
  const exclude = ['opinion', 'features', 'gallery', 'photos', 'video', 'sport',
    'entertainment', 'culture', 'food', 'travel', 'lifestyle', 'podcast']
  for (const e of exclude) {
    if (cat.includes(e) || title.includes(e)) return false
  }
  return true
}

async function main() {
  const existing = getExistingArticles()
  const items = await fetchRSS()
  const relevant = items.filter(isRelevant)

  // Deduplicate against existing articles
  const fresh = relevant.filter(item => {
    const slug = slugify(item.title, item.pubDate)
    return !existing.has(slug)
  })

  // Output structured JSON for Claude to process
  const output = {
    fetchedAt: new Date().toISOString(),
    source: 'Al Jazeera',
    totalItems: items.length,
    relevantItems: relevant.length,
    freshItems: fresh.length,
    existingArticles: [...existing],
    stories: fresh.slice(0, 10).map(item => ({
      title: item.title,
      description: item.description,
      link: item.link,
      pubDate: item.pubDate,
      category: item.category,
      suggestedSlug: slugify(item.title, item.pubDate)
    }))
  }

  console.log(JSON.stringify(output, null, 2))
}

main().catch(err => {
  console.error('Fetch failed:', err.message)
  process.exit(1)
})
