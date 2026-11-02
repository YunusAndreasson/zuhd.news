import { z } from 'zod'
import { getFeed, getArticlesByCategory, getHeatmap, getContext, getAllArticles } from './cache.js'
import { searchArticles } from './search.js'
import { classifyRegion } from './region.js'

const CATEGORIES = ['politics', 'economy', 'science', 'tech']

// Threads have no id in the feed except where a brief exists, so a label's slug
// is the id clients are given, and what a thread_id is matched against.
function threadSlug(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function summarizeArticle(a, full = false) {
  const sentences = a.sentences || []
  return {
    slug: a.slug,
    title: a.title,
    date: a.date,
    category: a.category,
    source: a.source,
    location: a.location || null,
    concepts: a.concepts || [],
    sentences: full ? sentences : sentences.slice(0, 3),
    thread: a.threadLabel ? {
      id: threadSlug(a.threadLabel) || null,
      label: a.threadLabel,
      arc: a.threadArc || null,
      day: a.threadDay || null,
      articleCount: a.threadArticleCount || null,
      summary: a.threadSummary || null
    } : null
  }
}

// One story as the feed holds it: `story` is the thread's articles there, or one
// article with no thread. `threadSummary` is left out, being null by decision
// (build.js), and the rest of the thread is only counted: it has left the feed.
function storyContext(story) {
  const { threadLabel, threadArc, threadDay, threadArticleCount } = story[0]
  return {
    thread: threadLabel ? {
      id: threadSlug(threadLabel) || null,
      label: threadLabel,
      arc: threadArc || null,
      day: threadDay || null,
      articleCount: threadArticleCount || null,
      articlesInFeed: story.length
    } : null,
    articles: [...story]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map(a => {
        const { thread: _thread, ...article } = summarizeArticle(a, true)
        const sources = (a.sources || []).map(({ name, country, angle }) => ({ name, country, angle }))
        return { ...article, sources }
      })
  }
}

export function registerTools(server) {

  // 1. get_briefing
  server.registerTool('get_briefing', {
    title: 'Get Briefing',
    description: 'Get today\'s top stories across all categories. Returns a concise overview of current news. Optionally focus on a specific category.',
    inputSchema: z.object({
      focus: z.enum(['politics', 'economy', 'science', 'tech']).optional()
        .describe('Optional category to focus on')
    }),
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async (args) => {
    const feed = await getFeed()
    const focus = args.focus
    const categories = focus ? [focus] : CATEGORIES
    const result = {}

    for (const cat of categories) {
      const articles = feed.categories[cat]
      if (!Array.isArray(articles)) continue
      result[cat] = articles.slice(0, 5).map(a => ({
        slug: a.slug,
        title: a.title,
        source: a.source,
        location: a.location || null,
        summary: (a.sentences || []).slice(0, 2).join(' '),
        thread: a.threadLabel || null
      }))
    }

    const meta = {
      generated: feed.generated,
      briefing: feed.briefing || null,
      categories: Object.fromEntries(
        Object.entries(feed.categories).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])
      )
    }

    return {
      content: [{ type: 'text', text: JSON.stringify({ meta, stories: result }, null, 2) }]
    }
  })

  // 2. get_articles
  server.registerTool('get_articles', {
    title: 'Get Articles',
    description: 'Retrieve articles, optionally filtered by category. Returns article metadata with first 3 sentences. Use "full" parameter for complete text.',
    inputSchema: z.object({
      category: z.enum(['politics', 'economy', 'science', 'tech']).optional()
        .describe('Filter by category'),
      limit: z.number().int().min(1).max(30).default(10).optional()
        .describe('Number of articles to return (default 10, max 30)'),
      full: z.boolean().default(false).optional()
        .describe('Return full article text instead of first 3 sentences')
    }),
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async (args) => {
    const category = args.category
    const limit = args.limit || 10
    const full = args.full || false

    let articles
    if (category) {
      const data = await getArticlesByCategory(category)
      articles = data.articles.map(a => ({ ...a, category }))
    } else {
      articles = await getAllArticles()
    }

    articles.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const result = articles.slice(0, limit).map(a => summarizeArticle(a, full))

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    }
  })

  // 3. search_articles
  server.registerTool('search_articles', {
    title: 'Search Articles',
    description: 'Search articles by keyword across titles, concepts, locations, and content. Useful for finding coverage of specific topics, people, or places.',
    inputSchema: z.object({
      query: z.string().describe('Search query (keywords)'),
      category: z.enum(['politics', 'economy', 'science', 'tech']).optional()
        .describe('Optional category filter'),
      limit: z.number().int().min(1).max(30).default(10).optional()
        .describe('Max results (default 10)')
    }),
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async (args) => {
    let articles = await getAllArticles()
    if (args.category) {
      articles = articles.filter(a => a.category === args.category)
    }

    const results = searchArticles(articles, args.query, args.limit || 10)
    return {
      content: [{
        type: 'text',
        text: results.length
          ? JSON.stringify(results.map(a => summarizeArticle(a)), null, 2)
          : `No articles found for "${args.query}".`
      }]
    }
  })

  // 4. get_story_context
  server.registerTool('get_story_context', {
    title: 'Get Story Context',
    description: 'What the site holds on a story now: its thread (arc, day running, article count) and the thread\'s articles in the current feed, oldest first, in full, with each source\'s angle. Most threads are a single new article, and earlier ones may have left the feed, so articleCount can exceed articlesInFeed. A thread_id no longer in the feed may return a written background brief; those stopped in 2026, so check generatedAt. Provide a thread_id (or label) from article thread data, or an article slug.',
    inputSchema: z.object({
      thread_id: z.string().optional().describe('Thread id or label'),
      article_slug: z.string().optional().describe('Article slug to find its thread')
    }),
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async (args) => {
    const articles = await getAllArticles()

    let story = []
    if (args.thread_id) {
      const id = threadSlug(args.thread_id)
      if (id) story = articles.filter(a => a.threadLabel && threadSlug(a.threadLabel) === id)
    } else if (args.article_slug) {
      const article = articles.find(a => a.slug === args.article_slug)
      if (article) {
        story = article.threadLabel ? articles.filter(a => a.threadLabel === article.threadLabel) : [article]
      }
    }

    if (story.length) {
      return { content: [{ type: 'text', text: JSON.stringify(storyContext(story), null, 2) }] }
    }

    if (!args.thread_id) {
      return { content: [{ type: 'text', text: 'No story found. Provide a thread_id, or the slug of an article in the current feed.' }] }
    }

    // The briefs are frozen: a thread still running has none, and only a few
    // older threads' files are still published.
    const threadId = args.thread_id
    try {
      const ctx = await getContext(threadId)
      return { content: [{ type: 'text', text: JSON.stringify(ctx, null, 2) }] }
    } catch {
      const { contexts } = await getFeed()
      if (contexts && Object.hasOwn(contexts, threadId)) {
        return { content: [{ type: 'text', text: JSON.stringify(contexts[threadId], null, 2) }] }
      }
      return { content: [{ type: 'text', text: `No story found for thread "${threadId}".` }] }
    }
  })

  // 5. get_source_perspectives
  server.registerTool('get_source_perspectives', {
    title: 'Get Source Perspectives',
    description: 'Analyze source diversity for a story. Shows which countries and outlets are covering it, sentiment differences, and missing perspectives. Helps understand media coverage bias.',
    inputSchema: z.object({
      article_slug: z.string().optional().describe('Article slug'),
      thread_id: z.string().optional().describe('Thread ID to analyze all articles in the thread')
    }),
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async (args) => {
    const allArticles = await getAllArticles()

    let target = []
    if (args.article_slug) {
      const article = allArticles.find(a => a.slug === args.article_slug)
      if (article) target = [article]
    } else if (args.thread_id) {
      // Find articles sharing a thread label that matches
      const id = args.thread_id
      target = allArticles.filter(a => {
        if (!a.threadLabel) return false
        const derived = threadSlug(a.threadLabel)
        return derived === id || derived.includes(id)
      })
    }

    if (!target.length) {
      return { content: [{ type: 'text', text: 'No articles found for the given identifier.' }] }
    }

    // Aggregate sources
    const allSources = target.flatMap(a => a.sources || [])
    const countries = [...new Set(allSources.map(s => s.country).filter(Boolean))]
    const outlets = [...new Set(allSources.map(s => s.name))]
    const sentiments = allSources.map(s => s.sentiment).filter(s => s != null)

    const allKnownRegions = ['US', 'GB', 'FR', 'DE', 'QA', 'IL', 'IN', 'KR', 'AU', 'ZA', 'BR', 'CA', 'PK', 'BD', 'MY', 'ID', 'EG', 'NG', 'SE', 'NZ', 'AR', 'TR', 'HK', 'RU', 'KE']
    const missingRegions = allKnownRegions.filter(r => !countries.includes(r))

    const result = {
      articleCount: target.length,
      outlets,
      countries,
      missingRegions: missingRegions.slice(0, 10),
      sentiment: sentiments.length ? {
        min: Math.min(...sentiments),
        max: Math.max(...sentiments),
        mean: +(sentiments.reduce((a, b) => a + b, 0) / sentiments.length).toFixed(3),
        divergence: target[0].sentimentDivergence
      } : null,
      eventCoverage: target[0].eventCoverage || null
    }

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  })

  // 6. get_coverage_map
  server.registerTool('get_coverage_map', {
    title: 'Get Coverage Map',
    description: 'Get geographic distribution of news coverage from the last 72 hours. Shows where stories are happening. Optionally filter by bounding box region.',
    inputSchema: z.object({
      region: z.object({
        north: z.number().describe('Northern latitude bound'),
        south: z.number().describe('Southern latitude bound'),
        east: z.number().describe('Eastern longitude bound'),
        west: z.number().describe('Western longitude bound')
      }).optional().describe('Bounding box to filter by region')
    }),
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async (args) => {
    const data = await getHeatmap()
    let points = data.points || []

    if (args.region) {
      const { north, south, east, west } = args.region
      points = points.filter(p =>
        p.lat >= south && p.lat <= north &&
        p.lng >= west && p.lng <= east
      )
    }

    // Group by approximate region
    const regions = {}
    for (const p of points) {
      const region = classifyRegion(p.lat, p.lng)
      if (!regions[region]) regions[region] = []
      regions[region].push({ title: p.l, lat: p.lat, lng: p.lng, coverage: p.c })
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          generated: data.generated,
          totalPoints: points.length,
          regions
        }, null, 2)
      }]
    }
  })
}
