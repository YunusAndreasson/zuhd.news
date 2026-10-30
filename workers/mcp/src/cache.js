const SITE = 'https://zuhd.news'
const TTL = 5 * 60 * 1000 // 5 minutes
// TTL is only checked on read, so nothing else ever removes an entry.
const MAX_ENTRIES = 64

const mem = new Map() // key → { data, ts }, oldest write first

async function fetchJson(path) {
  const key = path
  const cached = mem.get(key)
  if (cached && Date.now() - cached.ts < TTL) return cached.data

  const res = await fetch(`${SITE}${path}`)
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`)
  const data = await res.json()
  mem.delete(key)
  mem.set(key, { data, ts: Date.now() })
  if (mem.size > MAX_ENTRIES) mem.delete(mem.keys().next().value)
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
  // The id is a client's, and `../map-archive.json?x=1` would resolve to another file.
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`Invalid context id: ${id}`)
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
