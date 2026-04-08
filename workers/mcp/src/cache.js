const SITE = 'https://zuhd.news'
const TTL = 5 * 60 * 1000 // 5 minutes

const mem = new Map() // key → { data, ts }

async function fetchJson(path) {
  const key = path
  const cached = mem.get(key)
  if (cached && Date.now() - cached.ts < TTL) return cached.data

  const res = await fetch(`${SITE}${path}`)
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`)
  const data = await res.json()
  mem.set(key, { data, ts: Date.now() })
  return data
}

export async function getMeta() {
  return fetchJson('/api/meta.json')
}

export async function getFeed() {
  return fetchJson('/api/feed.json')
}

export async function getArticlesByCategory(category) {
  return fetchJson(`/api/articles/${category}.json`)
}

export async function getHeatmap() {
  return fetchJson('/api/heatmap.json')
}

export async function getContext(id) {
  return fetchJson(`/api/context/${id}.json`)
}

export async function getAllArticles() {
  const feed = await getFeed()
  const all = []
  for (const cat of Object.keys(feed.categories)) {
    const articles = feed.categories[cat]
    if (Array.isArray(articles)) {
      all.push(...articles.map(a => ({ ...a, category: cat })))
    }
  }
  return all
}
