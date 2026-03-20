// Cloudflare Worker: per-article share preview
// Intercepts /a/{slug} → injects article-specific og:tags for rich link previews
// Bots (iMessage, WhatsApp, Slack, Twitter) see og:tags; browsers redirect to /#slug

const API_BASE = 'https://zuhd-news.pages.dev'
const SITE = 'https://zuhd.news'

// User agents that fetch link previews (bots, not browsers)
const BOT_UA = /facebookexternalhit|Facebot|Twitterbot|LinkedInBot|WhatsApp|Slackbot|Discordbot|TelegramBot|Applebot|iMessageLinkPreview|GoogleOther|Bingbot/i

export default {
  async fetch(request) {
    const url = new URL(request.url)
    const slug = url.pathname.replace('/a/', '')

    if (!slug) {
      return Response.redirect(`${SITE}/`, 302)
    }

    const ua = request.headers.get('user-agent') || ''
    const isBot = BOT_UA.test(ua)

    // Browsers: redirect to the hash URL (SPA handles it)
    if (!isBot) {
      return Response.redirect(`${SITE}/#${slug}`, 302)
    }

    // Bots: fetch article data, return HTML with og:tags
    try {
      const res = await fetch(`${API_BASE}/api/articles.json`, {
        cf: { cacheTtl: 300 },
      })
      if (!res.ok) return Response.redirect(`${SITE}/`, 302)

      const data = await res.json()
      const article = data.articles.find(a => a.slug === slug)

      if (!article) {
        return Response.redirect(`${SITE}/`, 302)
      }

      const title = escapeHtml(article.title)
      const body = escapeHtml(
        (article.sentences || [article.body]).join(' ').slice(0, 200)
      )
      const source = escapeHtml(article.source || 'zuhd.news')

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title} — zuhd.news</title>
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${body}">
  <meta property="og:image" content="${SITE}/og-image.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url" content="${SITE}/a/${slug}">
  <meta property="og:site_name" content="zuhd.news">
  <meta property="og:type" content="article">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${body}">
  <meta name="description" content="${body}">
  <meta name="author" content="${source}">
</head>
<body>
  <h1>${title}</h1>
  <p>${body}</p>
  <p>${source}</p>
</body>
</html>`

      return new Response(html, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'public, s-maxage=300, stale-while-revalidate=3600',
        },
      })
    } catch {
      return Response.redirect(`${SITE}/`, 302)
    }
  },
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
