// Cloudflare Worker: per-article share preview
// Serves HTML with article-specific og:tags to ALL requests at /a/{slug}
// Client-side JS redirects browsers to /#slug; bots (iMessage, WhatsApp etc) don't execute JS

const API_BASE = 'https://zuhd-news.pages.dev'
const SITE = 'https://zuhd.news'

export default {
  async fetch(request) {
    const url = new URL(request.url)
    const slug = url.pathname.replace('/a/', '')

    if (!slug) {
      return Response.redirect(`${SITE}/`, 302)
    }

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
  <meta property="og:image" content="${SITE}/api/og/${slug}.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url" content="${SITE}/a/${slug}">
  <meta property="og:site_name" content="zuhd.news">
  <meta property="og:type" content="article">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${body}">
  <meta name="twitter:image" content="${SITE}/api/og/${slug}.png">
  <meta name="description" content="${body}">
  <meta name="author" content="${source}">
  <script>location.replace("${SITE}/#${slug}")</script>
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
