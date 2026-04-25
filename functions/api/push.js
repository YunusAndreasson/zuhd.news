// Pages Function: send breaking news push via Expo Push API
// Called by run-cycle.sh after deploying articles with arc:"breaking"

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const BATCH_SIZE = 100

export async function onRequestPost({ request, env }) {
  // Auth check
  const auth = request.headers.get('Authorization')
  if (auth !== `Bearer ${env.PUSH_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let articles
  try {
    const body = await request.json()
    articles = body.articles
    if (!Array.isArray(articles) || articles.length === 0) {
      return Response.json({ error: 'No articles' }, { status: 400 })
    }
  } catch {
    return Response.json({ error: 'Bad request' }, { status: 400 })
  }

  // Filter out already-pushed articles
  const toPush = []
  for (const article of articles) {
    const existing = await env.PUSH_DATA.get(`pushed:${article.slug}`)
    if (!existing) toPush.push(article)
  }

  if (toPush.length === 0) {
    return Response.json({ pushed: 0, skipped: articles.length })
  }

  // Collect all tokens (paginate if >1000)
  const tokens = []
  let cursor = null
  do {
    const opts = { prefix: 'token:', limit: 1000 }
    if (cursor) opts.cursor = cursor
    const list = await env.PUSH_DATA.list(opts)
    for (const key of list.keys) {
      tokens.push(key.name.slice(6)) // strip "token:" prefix
    }
    cursor = list.list_complete ? null : list.cursor
  } while (cursor)

  if (tokens.length === 0) {
    return Response.json({ pushed: 0, skipped: 0, reason: 'No registered tokens' })
  }

  // Send pushes in batches
  let totalSent = 0
  for (const article of toPush) {
    // Per-article channel/priority/data overrides — defaults match the
    // original breaking-news contract so existing callers don't change.
    // The daily-briefing push uses channelId: 'briefing' (DEFAULT importance)
    // and a `data.kind: 'briefing'` so the mobile tap handler can route it
    // to the briefing player rather than treating it as an article slug.
    const channelId = article.channelId || 'breaking'
    const priority = article.priority || 'high'
    const data = article.data || { slug: article.slug, url: `https://zuhd.news/${article.slug}` }
    const messages = tokens.map(token => ({
      to: token,
      title: article.title,
      body: article.body || article.title,
      data,
      sound: 'default',
      channelId,
      priority,
    }))

    // Batch into groups of 100
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE)
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(batch),
      })
    }

    // Mark as pushed (7-day TTL)
    await env.PUSH_DATA.put(`pushed:${article.slug}`, '1', { expirationTtl: 7 * 86400 })
    totalSent++
  }

  return Response.json({
    pushed: totalSent,
    skipped: articles.length - toPush.length,
    tokens: tokens.length,
  })
}
