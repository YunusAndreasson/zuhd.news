// Pages Function: per-article share preview at /a/{slug}
// Serves HTML with og:tags; client-side JS redirects browsers to /#slug

const API_BASE = 'https://zuhd-news.pages.dev'
const SITE = 'https://zuhd.news'

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export async function onRequest({ params }) {
  const slug = params.slug

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
}
