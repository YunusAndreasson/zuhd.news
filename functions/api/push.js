// Pages Function: send breaking news push via Expo Push API
// Called by run-cycle.sh after deploying articles with arc:"breaking"

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const BATCH_SIZE = 100
// How Expo names this app in an error, from `mobile/app.json`'s owner and slug.
const EXPERIENCE = '@edenmind/zuhd-news'

/** Post one batch: whether Expo took it, and what it answered. */
async function post(batch) {
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(batch),
    })
    const body = await res.json().catch(() => null)
    return { ok: res.ok && !body?.errors, body }
  } catch {
    return { ok: false, body: null }
  }
}

/**
 * Send one batch and clean up after what Expo says.
 *
 * Anyone can register a token, and one token from another Expo project fails
 * every message in the request it arrives in. Expo's error lists the tokens by
 * project: those of other projects are dropped, and ours sent again. A token
 * Expo says no longer reaches a device is dropped too.
 */
async function sendBatch(batch, env) {
  let result = await post(batch)
  const mixed = result.body?.errors?.find((e) => e.code === 'PUSH_TOO_MANY_EXPERIENCE_IDS')
  const ours = mixed?.details?.[EXPERIENCE]
  if (Array.isArray(ours)) {
    for (const [experience, tokens] of Object.entries(mixed.details)) {
      if (experience === EXPERIENCE || !Array.isArray(tokens)) continue
      for (const token of tokens) await env.PUSH_DATA.delete(`token:${token}`)
    }
    const keep = new Set(ours)
    batch = batch.filter((message) => keep.has(message.to))
    result = await post(batch)
  }
  if (result.ok && Array.isArray(result.body?.data)) {
    for (const [i, ticket] of result.body.data.entries()) {
      if (ticket?.details?.error === 'DeviceNotRegistered' && batch[i]) {
        await env.PUSH_DATA.delete(`token:${batch[i].to}`)
      }
    }
  }
  return result.ok
}

export async function onRequestPost({ request, env }) {
  // Auth check. An unset secret must refuse everyone: the comparison alone would
  // accept the literal `Bearer undefined`.
  const auth = request.headers.get('Authorization')
  if (!env.PUSH_SECRET || auth !== `Bearer ${env.PUSH_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let articles
  try {
    const body = await request.json()
    articles = body.articles
    if (!Array.isArray(articles) || articles.length === 0) {
      return Response.json({ error: 'No articles' }, { status: 400 })
    }
    if (!articles.every((a) => typeof a?.slug === 'string' && a.slug)) {
      return Response.json({ error: 'Every article needs a slug' }, { status: 400 })
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
  let failedBatches = 0
  for (const article of toPush) {
    // Per-article channel/priority/data overrides — defaults match the
    // original breaking-news contract so existing callers don't change.
    // The daily-briefing push uses channelId: 'briefing' (DEFAULT importance)
    // and a `data.kind: 'briefing'` so the mobile tap handler can route it
    // to the briefing player rather than treating it as an article slug.
    const channelId = article.channelId || 'breaking'
    const priority = article.priority || 'high'
    const data = article.data || { slug: article.slug, url: `https://zuhd.news/a/${article.slug}` }
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
    let accepted = 0
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      if (await sendBatch(messages.slice(i, i + BATCH_SIZE), env)) accepted++
      else failedBatches++
    }

    // Mark as pushed (7-day TTL), once Expo has taken some of it: the dedup would
    // otherwise lose a story every device missed. Partly delivered still counts,
    // so a rerun cannot notify the same readers twice.
    if (accepted > 0) {
      await env.PUSH_DATA.put(`pushed:${article.slug}`, '1', { expirationTtl: 7 * 86400 })
      totalSent++
    }
  }

  return Response.json({
    pushed: totalSent,
    skipped: articles.length - toPush.length,
    tokens: tokens.length,
    ...(failedBatches ? { failedBatches } : {}),
  })
}
