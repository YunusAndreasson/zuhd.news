// Pages Function: register/unregister Expo push tokens in KV

// The whole shape, not just its ends: anyone can post here, and what passes
// becomes a KV key and a recipient in every later push.
const EXPO_TOKEN = /^ExponentPushToken\[[A-Za-z0-9_-]{1,128}\]$/

function isValidToken(token) {
  return typeof token === 'string' && EXPO_TOKEN.test(token)
}

export async function onRequestPost({ request, env }) {
  try {
    const { token } = await request.json()
    if (!isValidToken(token)) {
      return new Response('Invalid token', { status: 400 })
    }
    // 90-day TTL — stale tokens auto-expire
    await env.PUSH_DATA.put(`token:${token}`, '1', { expirationTtl: 90 * 86400 })
    return new Response(null, { status: 201 })
  } catch {
    return new Response('Bad request', { status: 400 })
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    const { token } = await request.json()
    if (!isValidToken(token)) {
      return new Response('Invalid token', { status: 400 })
    }
    await env.PUSH_DATA.delete(`token:${token}`)
    return new Response(null, { status: 204 })
  } catch {
    return new Response('Bad request', { status: 400 })
  }
}
