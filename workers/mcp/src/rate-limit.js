const BUCKET_SIZE = 30
const REFILL_RATE = 10 // tokens per minute
const KEYED_BUCKET_SIZE = 120
const KEYED_REFILL_RATE = 40

export async function checkRateLimit(request, env) {
  const kv = env.RATE_LIMIT
  if (!kv) return { allowed: true, remaining: BUCKET_SIZE }

  const authHeader = request.headers.get('authorization') || ''
  const apiKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  let bucketSize = BUCKET_SIZE
  let refillRate = REFILL_RATE
  let key = request.headers.get('cf-connecting-ip') || 'unknown'

  if (apiKey) {
    const stored = await kv.get(`key:${apiKey}`)
    if (stored) {
      bucketSize = KEYED_BUCKET_SIZE
      refillRate = KEYED_REFILL_RATE
      key = `key:${apiKey}`
    }
  }

  const now = Date.now()
  const record = await kv.get(`rl:${key}`, 'json')

  let tokens = bucketSize

  if (record) {
    const elapsed = (now - record.ts) / 60000 // minutes
    tokens = Math.min(bucketSize, record.tokens + elapsed * refillRate)
  }

  if (tokens < 1) {
    const waitMs = ((1 - tokens) / refillRate) * 60000
    return {
      allowed: false,
      remaining: 0,
      resetMs: Math.ceil(waitMs),
      headers: rateLimitHeaders(0, Math.ceil(waitMs / 1000))
    }
  }

  tokens -= 1
  await kv.put(`rl:${key}`, JSON.stringify({ tokens, ts: now }), { expirationTtl: 120 })

  return {
    allowed: true,
    remaining: Math.floor(tokens),
    headers: rateLimitHeaders(Math.floor(tokens), 0)
  }
}

function rateLimitHeaders(remaining, resetSeconds) {
  return {
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(resetSeconds)
  }
}
