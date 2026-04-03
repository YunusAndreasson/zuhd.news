// Pages Function: register/unregister Expo push tokens in KV

function isValidToken(token) {
  return typeof token === 'string' && token.startsWith('ExponentPushToken[') && token.endsWith(']')
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
