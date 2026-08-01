// Pages Function: `/s/{slug}` — the map, with one story's card already open.
//
// A shared link used to point at `/a/{slug}`, the reader page. That kept the
// generated OG card intact and showed a stranger the one surface this site is
// not: the map is the front door, and a link that opens a static article hides
// it. So sharing has its own route, and it is the only dynamic path on the site.
//
// ── What this returns ──────────────────────────────────────────────────────
//
// The homepage's own HTML, unchanged apart from four things:
//
//   1. `<title>` and the `og:*` / `twitter:*` block, lifted verbatim from
//      `/a/{slug}` — so the article page stays the single source of truth for
//      what a shared story looks like in a timeline, and the generated OG card
//      at `/api/og/{slug}.png` still arrives with it. Nothing is re-derived
//      here; a second copy of that markup is a second thing to drift.
//   2. `og:url`, which becomes this URL rather than the article's. It is the
//      one tag that must describe where the reader is being sent.
//   3. `<link rel="canonical">` → `/a/{slug}`. A crawler indexes the article,
//      not seven hundred variants of the map.
//   4. `data-story` on the map shell, which is how the island learns which card
//      to open — the same `data-*` prop channel `island-loader.js` already uses.
//
// ── Why not `/?story={slug}` ───────────────────────────────────────────────
//
// A query on `/` routes the *homepage* through a Worker for every visitor. The
// homepage is the one path here that must stay a static file served straight off
// the edge, so the cost of sharing is paid by shared links only.
//
// ── The headers are a seam ─────────────────────────────────────────────────
//
// `public/_headers` applies to static assets. A Function's response is not one,
// so every security header — the CSP above all, which is what keeps this site's
// `default-src 'none'` claim true — has to be restated here. That is a second
// copy of a string whose whole job is to be exact, so `share-surface.test.js`
// reads both files and fails if they part.

/** Must match the `/*` block in `public/_headers` exactly. Pinned by a test. */
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self' 'unsafe-inline'; worker-src 'self' blob:; " +
    "child-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; " +
    "connect-src 'self'; img-src 'self' data: blob:; media-src 'self'; base-uri 'self'; " +
    "form-action 'none'; frame-ancestors 'none'",
}

/**
 * The slug shape `slugify()` in `scripts/lib/utils.js` produces: an ISO date,
 * then lowercase words. Validated before it reaches a subrequest URL, and before
 * it is written into an attribute — a share route takes its only input from
 * whoever sent the link.
 */
const SLUG = /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]{0,120}$/

/** The tags copied from the article. `og:url` is deliberately not among them. */
const LIFTED = new Set([
  'og:type',
  'og:site_name',
  'og:title',
  'og:description',
  'og:image',
  'og:image:type',
  'og:image:width',
  'og:image:height',
  'og:image:alt',
  'twitter:card',
  'twitter:site',
  'twitter:creator',
  'twitter:title',
  'twitter:description',
  'twitter:image',
  'twitter:image:alt',
  'description',
])

const escapeAttr = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export async function onRequestGet(context) {
  const { params, request } = context
  const url = new URL(request.url)
  const slug = String(params.slug ?? '')

  // A malformed slug is not a story, and must not become a subrequest.
  if (!SLUG.test(slug)) return Response.redirect(new URL('/', url).href, 302)

  const articleUrl = new URL(`/a/${slug}`, url)
  const shellUrl = new URL('/index.html', url)

  // Both are static assets on this same deployment, so both are edge-cached and
  // neither routes back through a Function.
  const [articleRes, shellRes] = await Promise.all([fetch(articleUrl), fetch(shellUrl)])

  // No such article. Sending the reader to the map with nothing open would be a
  // link that silently shows something other than what was shared; the article
  // page's own 404 is the honest answer, and it is what `/a/{slug}` would give.
  if (!articleRes.ok) return Response.redirect(articleUrl.href, 302)
  if (!shellRes.ok) {
    // The shell is the homepage. If that is unreachable the map cannot be shown
    // at all, so fall back to the surface that certainly works.
    return Response.redirect(articleUrl.href, 302)
  }

  // Lift the article's own head. HTMLRewriter rather than a regex over 88 KB of
  // markup: these are our pages, but "our own output" is exactly the assumption
  // that stops being true the day the template changes.
  const meta = {}
  let title = ''
  await new HTMLRewriter()
    .on('meta', {
      element(el) {
        const key = el.getAttribute('property') ?? el.getAttribute('name')
        const content = el.getAttribute('content')
        if (key && content != null && LIFTED.has(key)) meta[key] = content
      },
    })
    .on('title', { text(t) { title += t.text } })
    .transform(articleRes)
    .arrayBuffer()

  const seen = new Set()
  const rewritten = new HTMLRewriter()
    .on('title', {
      element(el) { if (title) el.setInnerContent(title) },
    })
    .on('link[rel="canonical"]', {
      element(el) { el.setAttribute('href', articleUrl.href) },
    })
    .on('meta', {
      element(el) {
        const key = el.getAttribute('property') ?? el.getAttribute('name')
        if (!key) return
        // The one tag that describes where the reader actually is.
        if (key === 'og:url') return el.setAttribute('content', url.href)
        if (key in meta) {
          seen.add(key)
          el.setAttribute('content', meta[key])
        }
      },
    })
    // Anything the article carries that the homepage template has no slot for —
    // the article-only tags — appended rather than dropped.
    //
    // **`onEndTag`, not `element`.** HTMLRewriter is a streaming parser: an
    // element handler fires when the *opening* tag is seen, which for `<head>`
    // is before any `<meta>` inside it has been visited. So `seen` was empty
    // every time, every lifted tag was appended *as well as* rewritten in place,
    // and the shipped page carried `og:title` twice. Nothing failed — a
    // duplicate meta tag is silently valid, and which one a given scraper reads
    // is its own business. `onEndTag` fires after the children, which is the
    // only point at which `seen` means what it says.
    .on('head', {
      element(el) {
        el.onEndTag((end) => {
          for (const [key, value] of Object.entries(meta)) {
            if (seen.has(key)) continue
            const attr = key.startsWith('og:') ? 'property' : 'name'
            end.before(
              `<meta ${attr}="${escapeAttr(key)}" content="${escapeAttr(value)}">`,
              { html: true },
            )
          }
        })
      },
    })
    // How the island learns which card to open. Same `data-*` prop channel the
    // loader already reads, so nothing new is invented to carry it.
    .on('[data-island-auto="situation-map"]', {
      element(el) { el.setAttribute('data-story', slug) },
    })
    .transform(shellRes)

  return new Response(rewritten.body, {
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': 'text/html; charset=utf-8',
      // Short, like the HTML it is made of: the map shell changes on every
      // deploy, and this site deploys five times a day. `stale-while-revalidate`
      // is what keeps a link that is being passed around fast anyway.
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  })
}
