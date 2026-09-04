import { readFileSync, writeFileSync, mkdirSync, readdirSync, cpSync, existsSync, rmSync, statSync } from 'node:fs'
import { transformSync } from 'esbuild'
import { join, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { parseFrontmatter } from './lib/frontmatter.js'
import { isThermallyRelevant, nearestStories } from './lib/firms.js'
import { ISO3_TO_ISO2, PHASE_NAMES, publishable, windowCoveringDay } from './lib/ipc.js'
import { splitBlocks } from './lib/blocks.js'
import { SV_WINDOW_MS, eventTime as svEventTime, svFeedItem } from './lib/sv-payload.js'
import { buildCategoryOgPng, buildOgPng, buildSiteOgPng } from './lib/og-image.js'
import { buildIgJpeg, IG_FEED, IG_STORY, igLead } from './lib/ig-image.js'
import { buildIslands } from './build/islands.js'
import { buildMapSources } from './build/basemap.js'
import { buildCountryPages } from './build/country-pages.js'
import { buildCountryMetrics } from './build/country-metrics.js'
import { buildEntityPages, latestTrendsPath } from './build/entity-pages.js'
import { canonicalIndicatorId } from './lib/entity-registry.js'
import { loadShared } from './build/shared-ts.js'
import {
  formatDate,
  parseCorrections,
  renderCorrections,
  renderIsnad,
} from './lib/article-chain.js'
import { escHtml, escXml } from './lib/html.js'
import { ARCHETYPE_HEADER, siteFooter, WORDMARK, footerStatusLine } from './lib/site-chrome.js'
import { listRow } from './lib/list-row.js'

const ROOT = new URL('..', import.meta.url).pathname
const CONTENT_DIR = join(ROOT, 'content', 'articles')
const DIST_DIR = join(ROOT, 'dist')
const TEMPLATES_DIR = join(ROOT, 'templates')

const CATEGORY_ORDER = ['politics', 'economy', 'science', 'tech']



// Convert structured timeline array to HTML for web rendering
const contextToHtml = (timeline) => {
  if (!Array.isArray(timeline) || timeline.length === 0) return ''
  let html = ''
  for (const entry of timeline) {
    if (entry.heading) {
      html += `<p class="context-heading">${entry.heading}</p><p>${entry.body}</p>`
    } else {
      html += `<p>${entry.body}</p>`
    }
  }
  return html
}
const WINDOW_MS = 24 * 60 * 60 * 1000
const MIN_PER_CATEGORY = 10
const MAX_PER_CATEGORY = 13

const smartQuotes = (text) => text
  .replace(/(^|[\s([{])"(\S)/gm, '$1\u201C$2')
  .replace(/"/g, '\u201D')
  .replace(/(^|[\s([{])'(\S)/gm, '$1\u2018$2')
  .replace(/'/g, '\u2019')

// Pipeline-emitted country tags use the `country:XX` href scheme
// (e.g. `[Iran](country:IR)`). On the web these rewrite to the new
// /country/XX pages; mobile keeps the custom scheme via the markdown
// renderer's URL handler.
const rewriteLinkHref = (href) => {
  const m = href.match(/^country:([A-Za-z]{2})$/)
  if (m) return `/country/${m[1].toUpperCase()}`
  return href
}

const markdownToHtml = (md) => {
  const html = smartQuotes(md)
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
      const rewritten = rewriteLinkHref(href)
      const isCountry = rewritten.startsWith('/country/')
      if (isCountry) {
        const iso2 = rewritten.replace('/country/', '')
        // A code we publish no page for stays as prose — see
        // `ROUTABLE_COUNTRIES`. Linking it offers the reader a 404 and a
        // preview sheet that can only say it failed.
        if (!ROUTABLE_COUNTRIES.has(iso2)) return text
        // Country tags are popover triggers: the island-loader intercepts
        // primary clicks via `data-island` and opens the country-preview
        // sheet inline. The href stays as a real URL so middle-click /
        // Cmd-click / right-click still navigate to the full profile, and
        // the link works without JS.
        return `<a href="${rewritten}" class="country-link" data-island="country-preview" data-iso="${iso2}">${text}</a>`
      }
      return `<a href="${rewritten}">${text}</a>`
    })
    .replace(/^---$/gm, '<hr>')

  const result = []
  let inList = false
  for (const line of html.split('\n')) {
    if (line.startsWith('- ')) {
      if (!inList) { result.push('<ul>'); inList = true }
      result.push(`<li>${line.slice(2)}</li>`)
    } else {
      if (inList) { result.push('</ul>'); inList = false }
      if (line.trim() === '') continue
      if (!line.startsWith('<h') && !line.startsWith('<hr') && !line.startsWith('<ul') && !line.startsWith('<li'))
        result.push(`<p>${line}</p>`)
      else
        result.push(line)
    }
  }
  if (inList) result.push('</ul>')
  return result.join('\n')
}

// A leading `Location — ` prefix, matched wherever the body's own dateline
// needs to be found or removed — `buildArticle` below re-styles it into a
// separate span, and the map's lead sentences (`mapLeads`) strip it outright
// because the popup already states the place in its kicker line, and printing
// it a second time as the paragraph's own first word pushed the sentence a
// city name to the right of every other row's margin.
const DATELINE_RE = /^([^\n—]+?)\s+—\s+/

const buildArticle = (filename) => {
  const raw = readFileSync(join(CONTENT_DIR, filename), 'utf-8')
  const { meta, body } = parseFrontmatter(raw)

  const sources = Array.isArray(meta.sources) ? meta.sources : []

  const corrections = parseCorrections(meta)
  const sourcemark = renderCorrections(corrections) + renderIsnad(sources, body, FRAMING, meta)

  // `concepts` stays in the parsed article so API consumers (feed.json,
  // mobile) keep getting the list, but we no longer append a concept-chip
  // strip to the reader's HTML body.
  const concepts = Array.isArray(meta.concepts) ? meta.concepts : []

  // Wrap a leading `Location — ` prefix in a small-caps dateline. The em
  // dash is dropped; CSS handles the spacing. We strip the dateline from
  // the markdown source before HTML rendering (so smartQuotes doesn't
  // curl our attribute quotes), then inject the styled span back into
  // the first paragraph of the rendered HTML.
  const datelineMatch = body.match(DATELINE_RE)
  const strippedBody = datelineMatch ? body.slice(datelineMatch[0].length) : body
  let renderedHtml = markdownToHtml(strippedBody)
  if (datelineMatch) {
    const location = datelineMatch[1].trim()
    renderedHtml = renderedHtml.replace(
      /^<p>/,
      `<p><span class="article-dateline">${location}</span>`,
    )
  }

  const slug = basename(filename, '.md')
  return {
    slug, meta, body, sources, concepts, corrections,
    // When the article last changed, as opposed to when it was published. Null
    // for the overwhelming majority; where it is set it drives `dateModified`
    // in the article's structured data and `<updated>` in the Atom feed, which
    // is what "issued openly" means on a site with no comment section and no
    // newsletter — the correction reaches a subscriber through the channel
    // they already have rather than sitting on a page nobody revisits.
    correctedAt: corrections.length ? corrections[corrections.length - 1].date : null,
    bodyHtml: renderedHtml + sourcemark,
    // The same prose without the flat `Sources:` line. The map's story card
    // renders its own attribution from the `sources[]` array — linked, and on a
    // contested story annotated with each outlet's country and tone — so it
    // needs the body to stop short of naming them, or the card would print the
    // same outlets twice under two different treatments.
    bodyHtmlBare: renderedHtml,
    title: smartQuotes(meta.title || 'Untitled'),
    dateFormatted: formatDate(meta.date),
    sourceCount: sources.length,
  }
}

// Applies rolling window per category; returns raw article objects grouped by category.
// Shared by homepage and API — each consumer maps to its own shape.
const groupByWindow = (sorted, cutoff) => {
  const grouped = {}
  for (const a of sorted) {
    const cat = a.meta.category || 'uncategorised'
    // biome-ignore lint/suspicious/noAssignInExpressions: the (x ??= []) group-by idiom, in statement position. The rule is here for `if (a = b)`.
    const list = grouped[cat] ??= []
    if (list.length >= MAX_PER_CATEGORY) continue
    if (a.addedAt >= cutoff || list.length < MIN_PER_CATEGORY) list.push(a)
  }
  return grouped
}

// The homepage is the situational map, which loads its own data from
// /api/map.json. The only server-rendered content left is the <noscript>
// list — the sole text a crawler or a JS-less client gets from `/`.
const buildHomepage = (sorted, cutoff, homepageTemplate) => {
  const grouped = groupByWindow(sorted, cutoff)
  const includedSlugs = new Set(Object.values(grouped).flat().map(a => a.slug))
  const fallbackArticleList = sorted
    .filter(a => includedSlugs.has(a.slug))
    .map(({ slug, title, meta, dateFormatted }) => `
      <article class="article-preview">
        <span class="category">${meta.category || ''}</span>
        <h2><a href="/a/${slug}">${title}</a></h2>
        <time datetime="${meta.date}">${dateFormatted}</time>
      </article>`)
    .join('\n')

  return homepageTemplate.replace(/{{fallbackArticleList}}/g, fallbackArticleList)
}

// Extract a clean OG/meta description from body: first 1-2 sentences, ≤170 chars.
const buildDescription = (body) => {
  if (!body) return 'Global news, no noise. Concise world news from 40 sources, curated by AI.'
  const firstPara = body.trim().split(/\n{2,}/)[0] || body.trim()
  const plain = firstPara.replace(/[*_`#>]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim()
  if (plain.length <= 170) return plain
  const cut = plain.slice(0, 167)
  const lastSpace = cut.lastIndexOf(' ')
  return `${lastSpace > 120 ? cut.slice(0, lastSpace) : cut}…`
}

// Background disclosure — matches the homepage reader's plain
// <details class="article-context"> affordance so /a/{slug} and the
// in-pane reader render identically.
const threadBlockHtml = (threadCtx) => {
  if (!threadCtx) return ''
  const bodyHtml = contextToHtml(threadCtx)
  if (!bodyHtml) return ''
  return `<details class="article-context"><summary class="context-label">Background</summary><div class="context-body">${bodyHtml}</div></details>`
}

// Entity strip — the reader-facing affordance for an article's
// frontmatter entities[]. Rendered as <a href="/e/{id}"> so no-JS
// clients and crawlers still follow through to the full page; the
// `entity-strip` island then unfolds the series *under the strip*, in
// place. It used to carry `data-island="entity-sheet"`, which threw a
// 44rem dialog and a scrim over the article being read to show a chart
// and a list of other articles to go and read — the same navigation the
// map's story card was fixed for, wearing a modal's clothes. Only
// entries whose indicatorId actually corresponds to a trends snapshot
// get rendered — anything else (e.g. the old `stocks:MRNA` shape we
// don't ship series for) is silently dropped.
const entityStripHtml = (entities, indicatorMap) => {
  if (!Array.isArray(entities) || !entities.length) return ''
  // Through the alias table first: a published article names the id that was
  // current when it was written, and the chip has to point at the page that
  // exists now.
  const rendered = entities
    .map((e) => (e?.indicatorId ? { ...e, indicatorId: canonicalIndicatorId(e.indicatorId) } : e))
    .filter((e) => e?.indicatorId && indicatorMap?.has(e.indicatorId))
    .map((e) => {
      const ind = indicatorMap.get(e.indicatorId)
      return `<a class="article-entity-chip" href="/e/${escHtml(e.indicatorId)}" data-id="${escHtml(e.indicatorId)}"><span class="article-entity-chip-label">${escHtml(ind.label || e.mention || e.indicatorId)}</span></a>`
    })
  if (!rendered.length) return ''
  // The island mounts on the wrapper and appends its panel there, so the chart
  // opens as a sibling *below* the chip row rather than inside a flex line.
  return `<div class="article-entities-block" data-island-auto="entity-strip"><aside class="article-entities" aria-label="Related entities"><span class="label article-entities-label">Follows</span>${rendered.join('')}</aside></div>`
}

// When the story happened.
//
// `addedAt` is the markdown file's mtime — when zuhd published — which drifts
// from when the thing actually happened and resets whenever a file is
// rewritten. The editor stage rewrites, and the pipeline writes a whole cycle
// in one burst, so mtime collapses to *one value per cycle*: a 49-article feed
// carried 12 distinct `addedAt` values, twelve stories all reading "now", and
// the freshest-looking item on the page was 38 hours old.
//
// This was already the read for the heatmap's decay curve and the map's
// timeline scrubber, which have always meant "when it happened". It is now the
// read for the feed order and for every relative timestamp too — the frontmatter
// date, falling back to mtime only if it is unparseable.
const eventTime = (a) => {
  const parsed = a.meta.date ? Date.parse(a.meta.date) : NaN
  return Number.isFinite(parsed) ? parsed : Math.round(a.addedAt)
}

// Relative time-ago label — mirror of mobile/lib/article-utils.formatTimeAgo.
// Kicker shows this instead of a fixed date so the article header reads
// the same as mobile ("3h ago") rather than an abstract calendar date.
const formatTimeAgo = (addedAt) => {
  const diffMs = Date.now() - addedAt
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(addedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

const buildArticlePage = (article, prev, next, thread, template, indicatorMap) => {
  const { slug, meta, body, bodyHtml, title, dateFormatted, addedAt, correctedAt } = article
  const isoDate = meta.date || new Date(addedAt).toISOString()
  const category = meta.category || 'politics'
  const description = buildDescription(body)
  const timeAgo = formatTimeAgo(eventTime(article))
  const prevLink = prev
    ? `<a class="article-pagination-prev" href="/a/${prev.slug}" rel="prev"><span class="article-pagination-label">Previous</span><span class="article-pagination-title">${escHtml(prev.title)}</span></a>`
    : '<span class="article-pagination-prev"></span>'
  const nextLink = next
    ? `<a class="article-pagination-next" href="/a/${next.slug}" rel="next"><span class="article-pagination-label">Next</span><span class="article-pagination-title">${escHtml(next.title)}</span></a>`
    : '<span class="article-pagination-next"></span>'

  // NewsArticle structured data — gates Top Stories / rich-result eligibility.
  // JSON.stringify handles escaping; the closing `</` is split to avoid an
  // early </script> break inside the inline JSON-LD block.
  const url = `https://zuhd.news/a/${slug}`
  const publisher = {
    '@type': 'Organization',
    name: 'zuhd.news',
    url: 'https://zuhd.news/',
    logo: { '@type': 'ImageObject', url: 'https://zuhd.news/apple-touch-icon.png' },
    // The accounts and store listings that are this same publication. Without
    // it a search engine has no way to connect an article to the masthead's
    // feeds — it sees a domain and, separately, four strangers using the same
    // word. The homepage @graph says the same thing about the same @id; an
    // article page carries no @graph, so it has to say it inline.
    sameAs: SHARE.ORG_SAME_AS,
  }
  const jsonLd = `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: title,
    description,
    image: [`https://zuhd.news/api/og/${slug}.png`],
    datePublished: isoDate,
    // The one place these two legitimately differ. A corrected article that
    // still claims it has never been modified is making the same kind of quiet
    // false statement the correction exists to undo.
    dateModified: correctedAt || isoDate,
    url,
    mainEntityOfPage: url,
    articleSection: category,
    inLanguage: 'en',
    isAccessibleForFree: true,
    author: publisher,
    publisher,
    // Links the article to the maker's Person entity (defined in full on the
    // homepage @graph); an @id reference keeps the NewsArticle block — which
    // gates Top Stories eligibility — otherwise untouched.
    creator: { '@id': 'https://andreassonphoto.com/#person' },
  }).replace(/<\//g, '<\\/')}</script>`

  return template
    .replace(/{{jsonLd}}/g, jsonLd)
    .replace(/{{slug}}/g, slug)
    .replace(/{{title}}/g, escHtml(title))
    .replace(/{{titleAttr}}/g, escHtml(title))
    .replace(/{{description}}/g, escHtml(description))
    .replace(/{{category}}/g, category)
    .replace(/{{dateFormatted}}/g, dateFormatted)
    .replace(/{{isoDate}}/g, isoDate)
    .replace(/{{timeAgo}}/g, escHtml(timeAgo))
    .replace(
      /{{footerStatus}}/g,
      footerStatusLine({ dateLabel: 'Published', dateHtml: `<time datetime="${isoDate}">${dateFormatted}</time>` }),
    )
    // In the kicker, beside the timestamp, because a correction a reader has to
    // scroll to find is not issued openly — it is filed. The link goes to the
    // block itself, so the mark is both the notice and the way to read it.
    .replace(
      /{{correctionMark}}/g,
      correctedAt
        ? '<a class="article-corrected" href="#corrections">corrected</a>'
        : '',
    )
    .replace(/{{bodyHtml}}/g, bodyHtml)
    .replace(/{{entityStrip}}/g, entityStripHtml(meta.entities, indicatorMap))
    .replace(/{{threadBlock}}/g, threadBlockHtml(thread?.threadContext))
    // The map, not this page. A reader on the article is looking at the
    // canonical surface and sharing the front door — see `shareUrl` in
    // shared/share.ts for why both surfaces send the same link.
    .replace(/{{shareRow}}/g, shareRowHtml(SHARE.shareUrl(slug), title))
    .replace(/{{prevLink}}/g, prevLink)
    .replace(/{{nextLink}}/g, nextLink)
}

// Main build
console.log('Building zuhd.news...')

// A second build.js writing dist/ at the same time is what produced both
// `ENOTEMPTY` on the rmSync below and a mid-loop `ENOENT` writing an article
// page (cycle-2026-08-08_1700, cycle-2026-08-09_1203) — the second process's
// rm/mkdir raced the first's writes. run-cycle.sh already flocks itself
// against overlapping *cycles*; this guards build.js directly against any
// invocation (manual, `npm run dev`, a future caller) racing the current one.
const LOCK_FILE = join(ROOT, '.build.lock')
const acquireBuildLock = () => {
  try {
    writeFileSync(LOCK_FILE, String(process.pid), { flag: 'wx' })
    return true
  } catch (err) {
    if (err.code !== 'EEXIST') throw err
    const heldPid = Number(readFileSync(LOCK_FILE, 'utf-8').trim())
    try {
      process.kill(heldPid, 0)
      return false // still running
    } catch {
      rmSync(LOCK_FILE) // owner process is gone — stale lock
      writeFileSync(LOCK_FILE, String(process.pid), { flag: 'wx' })
      return true
    }
  }
}
if (!acquireBuildLock()) {
  console.error(`Another build is already running (lock: ${LOCK_FILE}) — exiting.`)
  process.exit(1)
}
process.on('exit', () => {
  try { rmSync(LOCK_FILE) } catch {}
})

if (existsSync(DIST_DIR)) rmSync(DIST_DIR, { recursive: true, maxRetries: 3, retryDelay: 200 })
mkdirSync(DIST_DIR, { recursive: true })

if (existsSync(join(ROOT, 'public')))
  cpSync(join(ROOT, 'public'), DIST_DIR, {
    recursive: true,
    // Island source files are TypeScript — esbuild emits the runtime
    // bundles into dist/islands/ separately. Don't ship the sources.
    filter: (src) => !src.endsWith('.ts'),
  })

const audioSrc = join(ROOT, 'content', 'audio')
if (existsSync(audioSrc)) {
  mkdirSync(join(DIST_DIR, 'audio'), { recursive: true })
  for (const f of readdirSync(audioSrc).filter(f => f.endsWith('.mp3') || f === 'briefing-meta.json'))
    cpSync(join(audioSrc, f), join(DIST_DIR, 'audio', f))
}

// Where the site is, where it can be passed on to, and the accounts that are
// the same organisation as this domain. Shared with the islands
// (`@shared/share`) so the row this file renders server-side and the row
// `_share.ts` renders on top of it cannot become two different shares of the
// same story.
const SHARE = await loadShared('share.ts')

// Sentiment thresholds and the words for them, shared with the app so a source
// described as "leans critical" in one place is not "neutral" in the other.
// Passed into `renderIsnad` rather than imported by it: `loadShared` is async
// and `article-chain.js` is not, and a second copy of the numbers is the drift
// the shared-modules table exists to prevent.
const FRAMING = await loadShared('source-framing.ts')

const cssContent = transformSync(readFileSync(join(ROOT, 'public', 'style.css'), 'utf-8'), { loader: 'css', minify: true }).code

/**
 * The head every page shares.
 *
 * Two X accounts sit in here and they are not the same thing.
 * `twitter:creator` credits the person who made the site; `twitter:site` names
 * the *publication* the card belongs to, and is what X renders as the
 * attribution under a shared story and what its "more from this account"
 * surfaces follow. Until now only the first was declared, so every share of a
 * zuhd.news story pointed readers at a personal account rather than the
 * masthead's — the one piece of promotion a share carries for free, spent on
 * the wrong feed.
 *
 * The reasoning stays out here rather than going in as an HTML comment: this
 * block is inlined into roughly a thousand pages, so prose inside it is prose
 * every reader downloads.
 */
const headCommon = `<meta charset="utf-8">
  <meta name="google-site-verification" content="wE52hhFpRSdZ0DSAJM4Z57wM4AXTQ68eLrlo-zk_xLw">
  <meta name="author" content="Yunus Andreasson">
  <meta name="twitter:site" content="@${SHARE.X_HANDLE}">
  <meta name="twitter:creator" content="@YunusAndreasson">
  <meta name="color-scheme" content="light dark">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#fff" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#080808" media="(prefers-color-scheme: dark)">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="zuhd.news">
  <meta name="apple-itunes-app" content="app-id=${SHARE.APP_STORE_ID}">
  <link rel="preload" href="/fonts/source-sans-3-var.woff2" as="font" type="font/woff2" crossorigin fetchpriority="high">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.json">
  <script type="speculationrules">{"prerender":[{"where":{"and":[{"href_matches":"/*"},{"not":{"href_matches":"/api/*"}},{"not":{"href_matches":"/audio/*"}},{"not":{"href_matches":"/feed.xml"}},{"not":{"href_matches":"/sitemap.xml"}},{"not":{"href_matches":"/og-image.png"}}]},"eagerness":"moderate"}]}</script>
  <style>${cssContent}</style>`

/**
 * The head for the two page types that commit to dark.
 *
 * `theme-color` paints the browser's own chrome — the address bar on Android,
 * the status area of an installed PWA — so it is a claim about what the page
 * behind it looks like. The shared head above makes that claim conditionally,
 * `#fff` under a light system preference, and for the map and the document
 * pages that is simply false: they set `color-scheme: dark` and paint
 * `--map-ground` regardless of what the reader's system says. A light-mode
 * phone therefore got a white bar sitting directly on top of a black map.
 *
 * Unconditional, because these pages are unconditional. The value is
 * `--map-ground` itself, so the chrome and the canvas are the same black
 * rather than two blacks a few points apart. (The site-wide dark value was
 * `#141414`, which was a third black again — it matched neither `--bg`'s
 * `#080808` nor the map's ground.)
 */
const headCommonDark = headCommon.replace(
  / {2}<meta name="theme-color"[^\n]*\n {2}<meta name="theme-color"[^\n]*/,
  '  <meta name="theme-color" content="#080a0d">',
)

/**
 * Cache key for the island bundles, stamped into every URL that points at one.
 *
 * Cloudflare Pages recognises `.js` as a static asset and serves it with its
 * own `max-age=14400`, which `_headers` cannot lower. Without a version in the
 * URL, a code deploy therefore takes up to four hours to reach anyone — the
 * edge keeps handing out the previous bundle, and no amount of reloading on the
 * reader's side helps, because the stale copy is the shared one.
 *
 * Hashing the island *sources* gives a key that changes exactly when the output
 * does: a content-only cycle rebuilds byte-identical bundles and keeps the same
 * URL, so the four-hour cache works for us instead of against us.
 */
// Place-name display rules, shared with the app so a location never reads one
// way in the feed and another in the app.
const { displayLocation } = await loadShared('place-names.ts')

/**
 * The countries a `country:XX` tag can actually be routed to.
 *
 * Derived the same way `buildCountryPages` decides what to emit — every key of
 * `COUNTRY_DATA` whose topojson name resolves to an ISO-2 — so the set of links
 * the prose makes and the set of pages the build writes cannot disagree.
 *
 * They did disagree. The writer tags places we hold no country record for
 * (Bahrain, Hong Kong, Singapore, the Maldives) and occasionally things that
 * are not countries at all (`EU`, `UN`, and `UK` where the code is `GB`) — 15
 * codes across the corpus. Each rendered as a live link to `/country/XX`, which
 * 404s, and as a `country-preview` trigger, which opened a sheet that fetched a
 * missing `/api/country/XX.json` and settled on "Couldn't load country
 * preview." The reader's click was answered with an error either way.
 *
 * `iso.ts` already documents the contract for a code it cannot place —
 * "unknown codes return undefined and the caller should fall back (e.g. skip
 * highlighting, show the raw code as text)". This is that caller. An untagged
 * country name reads exactly like the prose around it, which is the right
 * failure: the sentence is unharmed and nothing offers to go somewhere it
 * cannot.
 */
const ROUTABLE_COUNTRIES = await (async () => {
  const [{ COUNTRY_DATA }, { codeFromTopojsonName }] = await Promise.all([
    loadShared('countries/country-data.ts'),
    loadShared('countries/iso.ts'),
  ])
  return new Set(
    Object.keys(COUNTRY_DATA)
      .map((name) => codeFromTopojsonName(name))
      .filter(Boolean),
  )
})()

/**
 * The share row, rendered as real links.
 *
 * This is the whole row for a reader with no JavaScript, and the starting point
 * for everyone else: `share-bar.ts` replaces it with the operating system's own
 * share sheet on a device that has one. Emitting it server-side rather than
 * letting the island build it from scratch means the affordance is in the HTML
 * — present on first paint, present in the cached page, present if the bundle
 * never arrives.
 */
const shareRowHtml = (target, title) => {
  // Absolute already (`shareUrl`) or a site-relative path (the category pages,
  // which share themselves).
  const url = target.startsWith('http') ? target : `${SHARE.SITE_URL}${target}`
  const links = SHARE.shareLinks({ url, title })
    .map(({ label, href, aria }) => {
      // mailto: must open in place; _blank on it leaves an empty tab behind.
      const target = href.startsWith('mailto:') ? '' : ' target="_blank" rel="noopener noreferrer"'
      return `<a class="share-choice" href="${escHtml(href)}" aria-label="${escHtml(aria)}"${target}>${label}</a>`
    })
    .join('')
  return `<div class="share" data-island-auto="share-bar" data-url="${escHtml(url)}" data-title="${escHtml(title)}"><span class="share-label">Share</span>${links}</div>`
}

const ISLAND_V = (() => {
  const publicDir = join(ROOT, 'public')
  const files = [join(publicDir, 'island-loader.js')]
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(ts|js)$/.test(entry.name)) files.push(full)
    }
  }
  walk(join(publicDir, 'islands'))
  const h = createHash('sha256')
  for (const f of files.sort()) h.update(readFileSync(f))
  return h.digest('hex').slice(0, 10)
})()

/**
 * Cache key for the basemap, stamped into every URL the map fetches it from.
 *
 * `/basemap/*` is served with `max-age=86400` because Natural Earth geometry
 * does not change between deploys — but *our treatment of it* does, and when it
 * does the reader keeps the old copy for a day. That is not academic: the map
 * kept printing "Tel Aviv" and "Jerusalem" for a full day after the build
 * started emitting "Yafa" and "Al-Quds", and no amount of reloading fixed it,
 * because a reload re-requests a URL the browser is entitled to answer from
 * disk. Hashing what goes into the basemap gives a URL that changes exactly
 * when its contents do, which is what makes a long cache safe.
 */
const BASEMAP_V = (() => {
  const inputs = [
    join(ROOT, 'scripts', 'build', 'basemap.js'),
    join(ROOT, 'shared', 'place-names.ts'),
    join(ROOT, 'shared', 'countries', 'iso.ts'),
    join(ROOT, 'shared', 'data', 'countries-110m.json'),
    join(ROOT, 'shared', 'data', 'countries-50m.json'),
    join(ROOT, 'shared', 'data', 'countries-10m.json'),
    join(ROOT, 'shared', 'data', 'places-50m.geojson'),
    // Every file the basemap is built from belongs here, or the layer it feeds
    // is the one that goes stale for a day with no way for a reader to force it.
    join(ROOT, 'shared', 'data', 'lakes-50m.json'),
    join(ROOT, 'shared', 'data', 'rivers-50m.json'),
    join(ROOT, 'shared', 'data', 'seas-50m.json'),
    // The sky is served from /basemap/ and is built from two files, one
    // generated and one hand-written. Both belong here for the reason above:
    // a star catalogue left out of the hash is one that goes stale for a day.
    join(ROOT, 'shared', 'data', 'stars.json'),
    join(ROOT, 'shared', 'star-lore.ts'),
  ]
  const h = createHash('sha256')
  for (const f of inputs) if (existsSync(f)) h.update(readFileSync(f))
  return h.digest('hex').slice(0, 10)
})()

// The page furniture, built once from `shared/share.ts` so the store and
// account links in six footers cannot become six different answers. See
// `lib/site-chrome.js` — two of them had already drifted before this existed.
const FOOTER_NAV = siteFooter(SHARE)

const loadTemplate = (name, head = headCommon) =>
  readFileSync(join(TEMPLATES_DIR, name), 'utf-8')
    .replace('{{headCommon}}', head)
    .replace('{{archetypeHeader}}', ARCHETYPE_HEADER)
    .replace('{{footerNav}}', FOOTER_NAV)
    .replaceAll('{{wordmark}}', WORDMARK)
    .replaceAll('{{v}}', ISLAND_V)
    .replaceAll('{{basemapV}}', BASEMAP_V)

// The map and the document pages carry `body.map-page` / `body.doc-page`, which
// pin `color-scheme: dark` — so they take the dark head. Everything else
// follows the reader.
const homepageTemplate = loadTemplate('index.html', headCommonDark)

const articleTemplate = loadTemplate('article.html')

const staticPageTemplate = loadTemplate('static-page.html', headCommonDark)

const countryTemplate = loadTemplate('country.html')

const entityTemplate = loadTemplate('entity.html')

// Story thread lookup — maps article slugs to their thread info from the ledger
const ledgerPath = join(ROOT, 'content', '.story-ledger.json')
const briefsPath = join(ROOT, 'content', '.context-briefs.json')
const threadLookup = new Map()
const contextBriefs = existsSync(briefsPath) ? JSON.parse(readFileSync(briefsPath, 'utf8')) : {}
if (existsSync(ledgerPath)) {
  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'))
  for (const story of ledger.stories) {
    if (story.arc === 'fading' || story.importance < 2) continue
    const firstDate = new Date(story.firstSeen)
    // Context comes from the separate briefs file (survives selector rewrites)
    const brief = contextBriefs[story.id]
    for (const slug of story.articles || []) {
      threadLookup.set(slug, {
        threadId: story.id,
        threadLabel: story.label,
        threadArc: story.arc,
        threadSummary: story.summary || null,
        threadDay: Math.max(1, Math.ceil((Date.now() - firstDate.getTime()) / 86400000)),
        threadArticleCount: story.articles.length,
        threadContext: brief?.timeline || null,
      })
    }
  }
  const briefCount = Object.keys(contextBriefs).length
  console.log(`  Ledger: ${threadLookup.size} articles mapped to ${ledger.stories.filter(s => s.arc !== 'fading' && s.importance >= 2).length} threads (${briefCount} context briefs)`)
}

// Context briefs: articles with slug-keyed briefs get context
let eduCount = 0
for (const [id, brief] of Object.entries(contextBriefs)) {
  const existing = threadLookup.get(id)
  if (existing?.threadContext) continue // already has thread context — skip
  threadLookup.set(id, {
    ...(existing || {}),
    threadId: id,
    threadLabel: existing?.threadLabel || brief.label,
    ...(existing?.threadArc && { threadArc: existing.threadArc }),
    ...(existing?.threadSummary && { threadSummary: existing.threadSummary }),
    ...(existing?.threadDay && { threadDay: existing.threadDay }),
    ...(existing?.threadArticleCount && { threadArticleCount: existing.threadArticleCount }),
    threadContext: brief.timeline,
  })
  eduCount++
}
// Reports what was INDEXED, not what shipped — the two were the same number
// until the api/context gate below, and reading "3193 articles with educational
// briefs" every cycle is how a feature frozen since June went unnoticed into
// late August. The newest brief's own date is the part worth seeing; the count
// that reaches a reader is the "Built: api/context/" line.
if (eduCount > 0) {
  const newest = Object.keys(contextBriefs).filter(k => /^\d{4}-\d{2}-\d{2}-/.test(k)).sort().pop()
  const stamp = newest ? newest.slice(0, 10) : 'unknown'
  const staleDays = Math.floor((Date.now() - Date.parse(stamp)) / 86400000)
  console.log(
    `  Edu context: ${eduCount} briefs indexed, newest ${stamp}` +
    (Number.isFinite(staleDays) && staleDays > 30 ? ` — ${staleDays}d stale, generation stopped` : ''),
  )
}

// Only process articles from the last 14 days — older ones don't appear in any output
// (homepage window is 24h + MIN_PER_CATEGORY backfill, heatmap is 72h, feed is 30 recent)
const BUILD_WINDOW_DAYS = 14
const buildCutoffDate = new Date(Date.now() - BUILD_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

// Per-article "Built:" lines are ~800 lines of noise per cycle log — opt in
// with ZUHD_BUILD_VERBOSE=1 when debugging a specific article's build.
const BUILD_VERBOSE = process.env.ZUHD_BUILD_VERBOSE === '1'
const articles = readdirSync(CONTENT_DIR)
  .filter(f => f.endsWith('.md') && f !== 'example.md' && f.slice(0, 10) >= buildCutoffDate)
  .map(file => {
    const article = buildArticle(file)
    if (BUILD_VERBOSE) console.log(`  Built: ${article.slug}`)
    return { ...article, addedAt: statSync(join(CONTENT_DIR, file)).mtimeMs }
  })
console.log(`  Built: ${articles.length} articles (last ${BUILD_WINDOW_DAYS}d window)`)

// Sort once, compute cutoff once — shared by homepage and API.
// By event time, not mtime: mtime is one value per cycle, so sorting on it put
// a whole cycle in arbitrary order and floated a 38-hour-old story above a
// one-hour-old one. The *window* below stays on `addedAt` — which articles are
// in the feed is a question about zuhd's publishing cadence, while what order
// they read in is a question about the news.
const sorted = articles.sort((a, b) => eventTime(b) - eventTime(a))
const cutoff = Date.now() - WINDOW_MS

// Generate audio briefing player HTML
//
// The mp3 has to exist, not just the metadata that describes it. These were
// two different questions answered from one file: `/api/meta.json` below
// checks `existsSync(mp3Path)` and correctly reported `briefing: null`, while
// this gate asked only whether `briefing-meta.json` was there and recent. When
// the metadata is written but generation fails — or the mp3 is cleaned up
// while the metadata survives — the homepage renders a play button over a
// `src` that 404s. Nothing looks broken until the reader presses it: the
// label stays "Today's briefing", the bar never moves, and the only trace is
// a media error in the console.
let audioBriefingHtml = ''
const briefingMetaPath = join(ROOT, 'content', 'audio', 'briefing-meta.json')
if (existsSync(briefingMetaPath)) {
  const meta = JSON.parse(readFileSync(briefingMetaPath, 'utf-8'))
  const age = Date.now() - new Date(meta.generated).getTime()
  const mp3Exists = existsSync(join(ROOT, 'content', 'audio', `briefing-${meta.date}.mp3`))
  if (mp3Exists && age < 36 * 60 * 60 * 1000) {
    const genHour = new Date(meta.generated).getUTCHours()
    const cycles = [3, 9, 15, 21]
    const cycleHour = cycles.reduce((prev, c) => c <= genHour ? c : prev, 0)
    const briefingKey = `${meta.date}-${String(cycleHour).padStart(2, '0')}00`
    const playSvg = '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><polygon points="3,1 12,7 3,13"/></svg>'
    const pauseSvg = '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="1" width="3.5" height="12"/><rect x="8.5" y="1" width="3.5" height="12"/></svg>'
    audioBriefingHtml = `<div class="audio-briefing" data-key="${briefingKey}">
      <button class="briefing-play" aria-label="Play briefing">${playSvg}</button>
      <span class="briefing-label">Today's briefing</span>
      <div class="briefing-track"><div class="briefing-bar"></div></div>
      <audio preload="none" src="/audio/briefing-${meta.date}.mp3"></audio>
    </div>
    <script>(()=>{const b=document.querySelector('.audio-briefing');if(!b)return;
const a=b.querySelector('audio'),p=b.querySelector('.briefing-play'),l=b.querySelector('.briefing-label'),t=b.querySelector('.briefing-track'),r=b.querySelector('.briefing-bar'),k='briefing-listened-'+b.dataset.key;
const play='${playSvg.replace(/'/g, "\\'")}',pause='${pauseSvg.replace(/'/g, "\\'")}',txt='Today\\u2019s briefing';
const ms='mediaSession'in navigator?navigator.mediaSession:null;
const fmt=s=>{const m=Math.floor(s/60),ss=Math.floor(s%60);return m+':'+(ss<10?'0':'')+ss};
const syncPos=()=>{if(ms&&a.duration)ms.setPositionState({duration:a.duration,playbackRate:a.playbackRate,position:a.currentTime})};
const doPlay=()=>{a.play();p.innerHTML=pause;if(ms)ms.playbackState='playing'};
const doPause=()=>{a.pause();p.innerHTML=play;l.textContent=txt;if(ms)ms.playbackState='paused'};
if(localStorage.getItem(k))b.classList.add('listened');
b.style.cursor='pointer';
b.onclick=e=>{if(e.target.closest('.briefing-track'))return;a.paused?doPlay():doPause()};
a.ontimeupdate=()=>{r.style.width=a.duration?(a.currentTime/a.duration*100)+'%':'0';if(a.duration&&!a.paused)l.textContent=fmt(a.duration-a.currentTime);if(a.currentTime>10&&!localStorage.getItem(k)){localStorage.setItem(k,'1');b.classList.add('listened')}syncPos()};
a.onended=()=>{p.innerHTML=play;r.style.width='0';l.textContent=txt;localStorage.setItem(k,'1');b.classList.add('listened');if(ms)ms.playbackState='none'};
t.onclick=e=>{if(a.duration){a.currentTime=e.offsetX/t.offsetWidth*a.duration;syncPos()}};
if(ms){ms.metadata=new MediaMetadata({title:'Daily Briefing',artist:'zuhd.news',album:'${meta.date}',artwork:[{src:'/briefing-artwork-192.png',sizes:'192x192',type:'image/png'},{src:'/briefing-artwork.png',sizes:'512x512',type:'image/png'}]});
ms.setActionHandler('play',doPlay);
ms.setActionHandler('pause',doPause);
ms.setActionHandler('stop',()=>{a.pause();a.currentTime=0;p.innerHTML=play;r.style.width='0';l.textContent=txt;ms.playbackState='none'});
ms.setActionHandler('seekto',d=>{if(d.fastSeek&&'fastSeek'in a)a.fastSeek(d.seekTime);else a.currentTime=d.seekTime;syncPos()});
ms.setActionHandler('seekbackward',d=>{a.currentTime=Math.max(0,a.currentTime-(d.seekOffset||15));syncPos()});
ms.setActionHandler('seekforward',d=>{a.currentTime=Math.min(a.duration||0,a.currentTime+(d.seekOffset||15));syncPos()});
}})()</script>`
  }
}

// (threadLookup moved above buildArticle calls)

// API feeds — pre-grouped, pre-split blocks for native rendering.
// Mobile reads `article.sentences: string[]` and maps each entry to a `<Text>`
// element. Field name is `sentences` for mobile-client compatibility; each
// entry is a markdown paragraph (block), not necessarily a single sentence.
const generated = new Date().toISOString()
const apiGrouped = groupByWindow(sorted, cutoff)
const apiCategories = Object.fromEntries(
  Object.entries(apiGrouped).map(([cat, articles]) => [
    cat,
    articles.map(({ slug, meta, addedAt, body, sources, concepts, corrections }) => {
      const thread = threadLookup.get(slug)
      return {
        slug,
        title: meta.title || 'Untitled',
        date: meta.date,
        addedAt,
        // When the story happened, as a number the client does not have to
        // parse. `addedAt` stays exactly as published — it is a contract field
        // and something may still be reading it — but it answers "when did the
        // build run", which collapses to one value per cycle and cannot say
        // how old a story is. Additive, so an older client ignores it and a
        // newer one prefers it. See `eventTime` above for what mtime costs.
        eventAt: eventTime({ meta, addedAt }),
        // Added here rather than in one endpoint, so `feed.json` and
        // `feed-lite.json` cannot disagree about whether a story was corrected.
        // Spread-conditional: the field is absent on the ~100% of articles that
        // have never been corrected, so the published shape is unchanged for
        // every existing consumer and the app keeps parsing.
        ...(corrections?.length && { corrections }),
        source: sources[0]?.name || null,
        sourceUrl: sources[0]?.url || null,
        // `url` and `angle` were dropped here while the page-data mapping
        // above kept them, so the mobile sources sheet had no way to reach the
        // original reporting and no per-story framing line — it fell back to
        // the app's hand-maintained outlet registry, which today covers only
        // ~1/3 of the outlets the feed actually cites. Both fields exist on
        // every article's frontmatter; forwarding them is the whole fix.
        sources: sources.map(s => ({
          name: s.name,
          url: s.url || null,
          country: s.country || null,
          sentiment: s.sentiment != null ? Number(s.sentiment) : null,
          ...(s.angle ? { angle: s.angle } : {}),
        })),
        concepts: concepts.map(c => typeof c === 'object' ? c.label : c).filter(Boolean),
        eventCoverage: meta.eventCoverage != null ? Number(meta.eventCoverage) : null,
        sentimentDivergence: meta.sentimentDivergence != null ? Number(meta.sentimentDivergence) : null,
        /*
         * Tappable rich-noun references — oil, Hormuz, the lira.
         *
         * The app has shipped an EntitySheet since before this comment, and it
         * has never opened once: `entities[]` was written into
         * `/api/story/*.json` for the map and dropped here, so
         * `Article.entities` was always `undefined` on the only endpoint the
         * app reads. 1,395 of the 8,420 articles in the corpus carry the data.
         *
         * Forwarded in the frontmatter's own shape (`mention`/`indicatorId`/
         * `kind`), not the map's `{id,label}` reshape below — two consumers,
         * two shapes, and the app's is a published type.
         *
         * Canonicalised but deliberately unfiltered: the map's strip filters
         * against `indicatorMap`, which is this build's trends snapshot, while
         * the app resolves each id against the live `/api/trends.json` it
         * already downloads on launch. Filtering here against a staler catalog
         * could only remove chips the app would have resolved fine, and the
         * app drops what it cannot resolve rather than rendering a dead one.
         */
        ...(() => {
          const entities = (Array.isArray(meta.entities) ? meta.entities : [])
            .filter(e => e?.indicatorId && e?.mention)
            .map(e => ({
              mention: String(e.mention),
              indicatorId: canonicalIndicatorId(e.indicatorId),
              ...(e.kind ? { kind: e.kind } : {}),
            }))
          return entities.length ? { entities } : {}
        })(),
        location: meta.location || null,
        lat: meta.lat != null ? Number(meta.lat) : null,
        lng: meta.lng != null ? Number(meta.lng) : null,
        ...(thread && {
          ...(thread.threadContext && { threadId: thread.threadId }),
          threadLabel: thread.threadLabel,
          threadArc: thread.threadArc,
          threadSummary: thread.threadSummary,
          threadDay: thread.threadDay,
          threadArticleCount: thread.threadArticleCount,
        }),
        sentences: splitBlocks(body)
      }
    })
  ])
)
const apiArticles = Object.values(apiCategories).flat().sort((a, b) => b.addedAt - a.addedAt)

mkdirSync(join(DIST_DIR, 'api', 'articles'), { recursive: true })
mkdirSync(join(DIST_DIR, 'api', 'context'), { recursive: true })

/**
 * Context briefs, published only where they are reachable.
 *
 * This wrote all 3,193 briefs on every deploy — 16 MB of JSON — and on
 * 2026-08-30 **none of them was reachable by anything**. Stage 3.5 was dropped
 * 2026-06-19, so the newest brief is dated 14 June while the article pages this
 * build emits are a 14-day window: zero overlap. Nothing fetches the endpoint
 * either — no `api/context` reference exists in `mobile/`, `public/` or
 * `functions/` — and `threadContext` never reaches the published API, so the
 * other route out of this file is dead too.
 *
 * The guard is "publish what a reader can reach", not an off switch, so this
 * lights up again on its own if brief generation is revived — which is the only
 * form of cleanup that does not have to be undone to restore the feature.
 * `content/.context-briefs.json` is kept: 3,119 briefs are real work, they are
 * already in git history, and deleting the file would reclaim nothing while
 * discarding the input a revived stage would build on.
 */
// The 14-day window this build actually emits pages for.
const builtArticleSlugs = new Set(articles.map(a => a.slug))
const contextIndex = {}
for (const [id, brief] of Object.entries(contextBriefs)) {
  if (!brief?.timeline) continue
  // Article-keyed briefs ride their article page; thread-keyed ones (7 of the
  // 3,193) have no page of their own and are kept unconditionally.
  const articleKeyed = /^\d{4}-\d{2}-\d{2}-/.test(id)
  if (articleKeyed && !builtArticleSlugs.has(id)) continue
  const payload = {
    id,
    type: brief.type || 'thread',
    label: brief.label,
    category: brief.category,
    articleCount: brief.articleCount,
    generatedAt: brief.generatedAt,
    timeline: brief.timeline,
    ...(Array.isArray(brief.sources) && brief.sources.length ? { sources: brief.sources } : {}),
    ...(Array.isArray(brief.blocks) && brief.blocks.length ? { blocks: brief.blocks } : {}),
  }
  writeFileSync(join(DIST_DIR, 'api', 'context', `${id}.json`), JSON.stringify(payload))
  contextIndex[id] = { type: brief.type || 'thread', label: brief.label, category: brief.category, articleCount: brief.articleCount, generatedAt: brief.generatedAt }
}
if (Object.keys(contextIndex).length > 0) {
  console.log(`  Built: api/context/ (${Object.keys(contextIndex).length} briefs)`)
}

/**
 * Indicator dispatch — the prose `narrate-indicators.js` writes once a day.
 *
 * `{ items: { <namespaced id>: { standing, recent, citations } } }`, where the
 * namespace is bare for a trends indicator, `cp:` for a chokepoint and `mkt:`
 * for an exchange. Missing file is a graceful degrade: every surface that reads
 * it spreads the fields conditionally, so a build before the stage has ever run
 * produces exactly the site it produced before.
 *
 * `standing` is joined onto the three list payloads below because it is a row's
 * tooltip and has to be there before anything is pressed. `recent` and
 * `citations` are deliberately *not* joined onto `trends.json` — on the web they
 * are only wanted when a card opens, and they ride `/api/entity/{id}.json`,
 * which is already fetched at that moment. The app has no `/e/{id}` and needs
 * them for a whole column of cards at once, so they reach it through
 * `api/analysis.json` instead: a second endpoint rather than 17KB added to the
 * payload the homepage's instrument rail downloads on every visit.
 */
// Always publish the optional endpoint, including an empty first-run payload.
const { isMarketSignalsSnapshot } = await loadShared('market-signals.ts')
const signalPath = join(ROOT, 'content', '.market-signals.json')
let marketSignals = { version: 1, generatedAt: new Date().toISOString(), signals: [] }
try {
  const candidate = JSON.parse(readFileSync(signalPath, 'utf8'))
  if (isMarketSignalsSnapshot(candidate) && Date.now() - Date.parse(candidate.generatedAt) < 7 * 86400000) marketSignals = candidate
} catch { /* optional pipeline output */ }
writeFileSync(join(DIST_DIR, 'api', 'market-signals.json'), JSON.stringify(marketSignals))

const dispatchSrc = join(ROOT, 'content', '.indicator-dispatch.json')
const dispatchFile = existsSync(dispatchSrc) ? JSON.parse(readFileSync(dispatchSrc, 'utf8')) : {}
const dispatch = dispatchFile.items || {}
if (Object.keys(dispatch).length) {
  console.log(`  Loaded: indicator dispatch (${Object.keys(dispatch).length} items)`)
}

/**
 * Event dispatch — the prose `narrate-events.js` writes, same shape and same
 * graceful-degrade contract as the indicator dispatch above.
 *
 * Unlike indicators, `recent`/`citations` ARE joined in full below: the
 * events block has no on-demand `/api/entity/{id}.json` of its own — an event
 * carries no time series, so it never earns an `/e/{id}` page — and at
 * ~15-20 events the whole dispatch is a few KB, nowhere near the size that
 * made withholding `recent` from 98 indicators worth doing.
 */
const eventsDispatchSrc = join(ROOT, 'content', '.events-dispatch.json')
const eventsDispatch = existsSync(eventsDispatchSrc)
  ? JSON.parse(readFileSync(eventsDispatchSrc, 'utf8')).items || {}
  : {}
if (Object.keys(eventsDispatch).length) {
  console.log(`  Loaded: event dispatch (${Object.keys(eventsDispatch).length} items)`)
}

const articleBySlug = new Map(sorted.map((a) => [a.slug, a]))

/**
 * Chokepoints and exchanges, shaped as indicators so they get `/e/{id}` pages.
 *
 * Both are series with a label, a unit, a date axis and an article join — every
 * property `/e/{id}` renders — and both were absent from it only because they
 * arrive in their own payloads rather than in the trends snapshot. The cost of
 * that accident was not cosmetic: `entity-registry.js` resolved a mention of the
 * Strait of Hormuz to a chokepoint id, `indicatorMap` found no page for it, and
 * **305 articles carried a chokepoint entity that rendered no chip at all**.
 *
 * Filled by the two blocks below, read by `indicatorMap` and `buildEntityPages`.
 */
const extraIndicators = []

/** An article row as the card lists want it. */
const relatedRow = (a) => ({
  slug: a.slug,
  title: a.title,
  date: a.meta.date,
  dateFormatted: a.dateFormatted,
})

/**
 * The dispatch's cited stories, or the caller's tag matches when there are none.
 *
 * Citations are resolved against the corpus here rather than trusted, because
 * the dispatch file is committed and an article can be renamed or withdrawn
 * between the run that wrote it and the build that reads it.
 */
const citedOr = (d, fallback) => {
  const cited = (d?.citations || []).map((s) => articleBySlug.get(s)).filter(Boolean)
  return cited.length ? cited.map(relatedRow) : fallback
}

// Chokepoints snapshot — ambient globe layer on mobile, and the data
// source the web chokepoint-sheet island reads when a reader taps a
// chokepoint marker. Web enriches the blob with `relatedArticles[]` so
// the sheet can show matching zuhd coverage without shipping the full
// article feed client-side. Missing input file is a graceful degrade:
// mobile + web both treat a 404 as "no layer this run".
const chokepointsSrc = join(ROOT, 'content', '.chokepoints.json')
if (existsSync(chokepointsSrc)) {
  const raw = JSON.parse(readFileSync(chokepointsSrc, 'utf8'))
  // Match articles against each chokepoint by topicTag. Tag hits against
  // title + concepts + location; lowercased whole-ish word match. Cheap
  // enough at 14-day window × 11 chokepoints (~200 × 11 = 2.2k lookups).
  const normalize = (s) => String(s || '').toLowerCase()
  const enriched = {
    ...raw,
    chokepoints: (raw.chokepoints || []).map((c) => {
      const tags = (c.topicTags || []).map(normalize)
      if (!tags.length) return { ...c, relatedArticles: [] }
      const hits = []
      for (const a of sorted) {
        const hay = [
          a.title,
          a.meta.location,
          ...(a.concepts || []).map((x) => (typeof x === 'object' ? x.label : x)),
        ].map(normalize).join(' ')
        if (tags.some((t) => hay.includes(t))) {
          hits.push({
            slug: a.slug,
            title: a.title,
            date: a.meta.date,
            dateFormatted: a.dateFormatted,
          })
          if (hits.length >= 8) break
        }
      }
      const d = dispatch[`cp:${c.id}`]
      return {
        ...c,
        // The cited stories where the dispatch produced some, the tag matches
        // otherwise. A citation list is the stories an explanation was *built
        // from*, ranked by a reader of both; the tag list is the first eight
        // articles containing one of eleven words. Where we have the first, the
        // second is strictly worse and showing both would be the same shelf
        // twice.
        relatedArticles: citedOr(d, hits),
        ...(d?.standing ? { standing: d.standing } : {}),
        ...(d?.recent ? { recent: d.recent } : {}),
      }
    }),
  }
  writeFileSync(join(DIST_DIR, 'api', 'chokepoints.json'), JSON.stringify(enriched))
  console.log(`  Built: api/chokepoints.json (${enriched.chokepoints.length} chokepoints)`)
  for (const c of enriched.chokepoints) {
    // `series.total`, not `series.values` — the one field name this payload
    // spells differently from every other series on the site.
    if (!Array.isArray(c.series?.total) || c.series.total.length < 2) continue
    extraIndicators.push({
      id: `cp:${c.id}`,
      label: c.name,
      unit: 'vessels/day',
      source: 'portwatch',
      sourceLabel: 'IMF PortWatch',
      cadence: 'daily',
      values: c.series.total,
      periods: c.series.periods || [],
      asOf: c.asOf || '',
    })
  }
}

// Stock-exchange snapshot — the map's markets layer. Enriched the same way as
// chokepoints, with one addition: an exchange is tied to a country in a way a
// strait is not, so coverage matches on `countryTags` against the article's
// inline `[Name](country:XX)` tags as well as on `topicTags` against the title
// and concepts. Source country is deliberately NOT used — that is the outlet's
// country, so joining on it would hang every Reuters story off London.
const marketsSrc = join(ROOT, 'content', '.markets.json')
if (existsSync(marketsSrc)) {
  const raw = JSON.parse(readFileSync(marketsSrc, 'utf8'))
  const normalize = (s) => String(s || '').toLowerCase()
  // Precomputed once rather than per-exchange: 30 exchanges × ~200 articles
  // would otherwise re-scan every body 30 times.
  const articleIndex = sorted.map((a) => ({
    slug: a.slug,
    title: a.title,
    date: a.meta.date,
    dateFormatted: a.dateFormatted,
    hay: [
      a.title,
      a.meta.location,
      ...(a.concepts || []).map((x) => (typeof x === 'object' ? x.label : x)),
    ]
      .map(normalize)
      .join(' '),
    countries: new Set(
      Array.from(String(a.body || '').matchAll(/\(country:([A-Za-z]{2})\)/g), (m) =>
        m[1].toUpperCase(),
      ),
    ),
  }))
  // Word-boundary matching, not substring. A bare `includes` let `smi` (the
  // Swiss index) match "transmission" and hung eight unrelated tech stories off
  // Zurich; short tickers are exactly the tags a market catalog is full of.
  // Phrases work too — the boundary is on the whole tag, not on each word.
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const tagMatcher = (tag) => new RegExp(`(^|[^a-z0-9])${escapeRe(tag)}([^a-z0-9]|$)`)
  const enriched = {
    ...raw,
    exchanges: (raw.exchanges || []).map((e) => {
      const tags = (e.topicTags || []).map(normalize).map(tagMatcher)
      const countries = e.countryTags || []
      const hits = []
      for (const a of articleIndex) {
        const match =
          tags.some((re) => re.test(a.hay)) || countries.some((c) => a.countries.has(c))
        if (!match) continue
        hits.push({ slug: a.slug, title: a.title, date: a.date, dateFormatted: a.dateFormatted })
        if (hits.length >= 8) break
      }
      const d = dispatch[`mkt:${e.id}`]
      // Translated here, not in the island, for the same reason and by the same
      // call the map points use above: the catalog holds the untranslated
      // source string so joins stay stable, and the display layer renames. This
      // is what prints Yafa rather than Tel Aviv beside the TA-125.
      return {
        ...e,
        city: displayLocation(e.city) || e.city,
        relatedArticles: citedOr(d, hits),
        ...(d?.standing ? { standing: d.standing } : {}),
        ...(d?.recent ? { recent: d.recent } : {}),
      }
    }),
  }
  writeFileSync(join(DIST_DIR, 'api', 'markets.json'), JSON.stringify(enriched))
  for (const e of enriched.exchanges) {
    if (!Array.isArray(e.series?.values) || e.series.values.length < 2) continue
    extraIndicators.push({
      id: `mkt:${e.id}`,
      label: e.indexName ? `${e.name} (${e.indexName})` : e.name,
      unit: e.currency || '',
      source: 'exchange',
      sourceLabel: e.sourceLabel || 'Yahoo Finance',
      cadence: 'daily',
      values: e.series.values,
      periods: e.series.periods || [],
      asOf: e.asOf || '',
    })
  }
  const withCoverage = enriched.exchanges.filter((e) => e.relatedArticles.length).length
  console.log(
    `  Built: api/markets.json (${enriched.exchanges.length} exchanges, ${withCoverage} with coverage)`,
  )
}

// GDACS disaster snapshot — pre-fetched alert list + EQ/TC population
// details, one server-side fetch per cycle replacing N fetches per install.
// Pure passthrough: the pipeline writes the API-shape directly, build just
// mirrors it under dist/api/. Missing input degrades gracefully (mobile
// renders an empty disaster layer when the endpoint 404s).
const gdacsSrc = join(ROOT, 'content', '.gdacs.json')
if (existsSync(gdacsSrc)) {
  cpSync(gdacsSrc, join(DIST_DIR, 'api', 'gdacs.json'))
  const g = JSON.parse(readFileSync(gdacsSrc, 'utf8'))
  const detailCount = g.details ? Object.keys(g.details).length : 0
  console.log(`  Built: api/gdacs.json (${g.alerts?.length ?? 0} alerts, ${detailCount} details)`)
}

// Conflict-events snapshot — UCDP candidate GED, parallel to GDACS but
// for the mobile globe's conflict layer. Pure passthrough: pipeline
// writes the API-shape directly, build mirrors. Missing input degrades
// gracefully (mobile renders an empty conflict layer on 404).
const conflictSrc = join(ROOT, 'content', '.conflict.json')
if (existsSync(conflictSrc)) {
  cpSync(conflictSrc, join(DIST_DIR, 'api', 'conflict.json'))
  const c = JSON.parse(readFileSync(conflictSrc, 'utf8'))
  console.log(`  Built: api/conflict.json (${c.events?.length ?? 0} events, ${c.windowStart} → ${c.windowEnd})`)
}

// Genocide determinations — the one overlay with no feed behind it. Written by
// hand in shared/genocide.ts, with the UN body, document and date on every
// entry, and published so the app and anything after it read the same record
// the map draws. Only `determination` entries ship: see that file for the bar.
const { GENOCIDE_MARKED } = await loadShared('genocide.ts')
writeFileSync(
  join(DIST_DIR, 'api', 'genocide.json'),
  JSON.stringify({ situations: GENOCIDE_MARKED }),
)
console.log(`  Built: api/genocide.json (${GENOCIDE_MARKED.length} situations)`)

// IODA country outage snapshot — internet connectivity scored against each
// country's own 90-day baseline. Passthrough, same fail-soft shape as the two
// above. Nothing renders it yet: see the header of scripts/fetch-ioda.js for
// why the map layer was not built, and what would have to be true to build it.
// Published so the data is inspectable and so a per-cycle series accumulates.
const iodaSrc = join(ROOT, 'content', '.ioda.json')
if (existsSync(iodaSrc)) {
  cpSync(iodaSrc, join(DIST_DIR, 'api', 'ioda.json'))
  const i = JSON.parse(readFileSync(iodaSrc, 'utf8'))
  console.log(`  Built: api/ioda.json (${i.countries?.length ?? 0} countries, ${i.recentDays}d vs ${i.baselineDays}d)`)
}

// Trends snapshot — full indicator catalog with values/periods. Mobile
// EntitySheet fetches this to render charts for any entity tapped in an
// article body. Ships the newest snapshot as api/trends.json (single file,
// current as of this deploy); if mobile wants historical, /trends/
// per-date JSONs remain queryable via the git repo.
//
// Dated by the snapshot it shipped, not by today: this looked up
// `content/trends/${today}.json`, which only exists once that day's fetch
// stage has run. Any build before the fetch — or on a day it failed — dropped
// the endpoint entirely, with no log line saying so. Falling back to the
// newest snapshot is what entity pages have always done.
const trendsSrc = latestTrendsPath()
/** The indicator ids the snapshot actually carries, for `analysis.json` below.
 *  Null when there is no snapshot, in which case nothing is filtered. */
let liveIndicatorIds = null
let liveSnapshotAsOf = null
if (trendsSrc && existsSync(trendsSrc)) {
  const snapshot = JSON.parse(readFileSync(trendsSrc, 'utf8'))
  // `standing` joined on, which is why this is a read-modify-write and no
  // longer a `cpSync`. This is the payload the instrument rail reads, so it is
  // where the row's own sentence has to arrive — the copy left it out at first
  // and every rail row went on printing the hardcoded block constant while
  // `/e/{id}` and the cards had prose. `recent` deliberately stays off it: it
  // is only wanted when a card opens, and it rides `/api/entity/{id}.json`.
  const withStanding = {
    ...snapshot,
    indicators: (snapshot.indicators ?? []).map((ind) => {
      const s = dispatch[ind.id]?.standing
      return s ? { ...ind, standing: s } : ind
    }),
    events: (snapshot.events ?? []).map((ev) => {
      const d = eventsDispatch[ev.id]
      if (!d) return ev
      return {
        ...ev,
        standing: d.standing,
        recent: d.recent,
        relatedArticles: citedOr(d, []),
      }
    }),
  }
  writeFileSync(join(DIST_DIR, 'api', 'trends.json'), JSON.stringify(withStanding))
  liveIndicatorIds = new Set(withStanding.indicators.map((i) => i.id))
  liveSnapshotAsOf = snapshot.asOf ?? null
  const n = withStanding.indicators.length
  const described = withStanding.indicators.filter((i) => i.standing).length
  const eventsN = withStanding.events.length
  const eventsDescribed = withStanding.events.filter((e) => e.standing).length
  console.log(
    `  Built: api/trends.json (${n} indicators, ${described} described, ` +
      `${eventsN} events, ${eventsDescribed} described, ${snapshot.asOf ?? 'undated'})`,
  )
} else {
  console.log('  Skipped: api/trends.json (no snapshot in content/trends/)')
}

/**
 * The movement analysis, for a reader who cannot open a card to get it.
 *
 * `recent` is the dispatch's account of what has happened to an instrument and
 * why — the answer to the question a chart that just moved actually raises. On
 * the web it arrives per-instrument, on the press that opens a card, from
 * `/api/entity/{id}.json`. The app has no such page and no such press: its
 * graph decks build a whole column up front and gate deck membership on having
 * an explanation, so it needs every instrument's paragraph before it renders
 * anything.
 *
 * A second endpoint rather than a wider `trends.json`, because that payload is
 * also what the homepage's instrument rail downloads, and 17KB of prose no rail
 * row displays is a real cost paid by every visit for one consumer's benefit.
 *
 * `cp:` and `mkt:` items are not here: their `recent` already rides
 * `api/chokepoints.json` and `api/markets.json`, and a second copy is a second
 * thing to drift. Which of the bare ids a consumer wants is the consumer's
 * judgement — this payload does not make it.
 *
 * An empty `recent` is omitted rather than shipped blank, so a consumer's
 * fallback to `standing` fires on absence and never on an empty string.
 *
 * The prose and nothing else. Adding `citations` measured 34.7KB against 17.2KB
 * without them — half the file, for 50 items x 4 resolved rows that no card
 * renders: the app's `related` is ranking metadata it derives locally, and it
 * is deliberately not printed under an analysis that already names the stories.
 * Doubling a payload for a list no reader sees is the cost this endpoint exists
 * to avoid paying on `trends.json`. They remain on `/api/entity/{id}.json`, and
 * on the chokepoint and exchange payloads, for the surfaces that do show them.
 *
 * Only ids the snapshot beside it carries. The dispatch is a cache keyed by
 * every instrument the desk has ever narrated, and the Polymarket and `wiki-*`
 * sets rotate, so it holds paragraphs for markets the payload no longer ships:
 * measured 2026-09-04, 12 of 76 items — 4KB the app downloaded on every launch
 * and could attach to nothing. The `dropped` count in the log is the health
 * metric for the sticky Polymarket selection: it should sit near zero.
 */
{
  const items = {}
  let dropped = 0
  for (const [id, d] of Object.entries(dispatch)) {
    if (id.includes(':')) continue
    if (liveIndicatorIds && !liveIndicatorIds.has(id)) {
      dropped++
      continue
    }
    const recent = d?.recent?.trim()
    if (!recent) continue
    items[id] = { recent }
  }
  writeFileSync(
    join(DIST_DIR, 'api', 'analysis.json'),
    JSON.stringify({
      generatedAt: dispatchFile.generatedAt ?? generated,
      windowDays: dispatchFile.windowDays ?? null,
      items,
    }),
  )
  console.log(
    `  Built: api/analysis.json (${Object.keys(items).length} explained, ` +
      `${dropped} dropped — not in the ${liveSnapshotAsOf ?? 'current'} snapshot, ` +
      `${dispatchFile.generatedAt ?? 'undated'})`,
  )
}

// Legacy flat endpoint (backwards compatible)
writeFileSync(join(DIST_DIR, 'api', 'articles.json'), JSON.stringify({ generated, articles: apiArticles.map(a => ({ ...a, category: CATEGORY_ORDER.find(c => apiCategories[c]?.includes(a)) ?? 'politics', body: a.sentences.join(' ') })) }))
console.log(`  Built: api/articles.json (${apiArticles.length} articles)`)

// Per-category endpoints
for (const [cat, catArticles] of Object.entries(apiCategories)) {
  writeFileSync(join(DIST_DIR, 'api', 'articles', `${cat}.json`), JSON.stringify({ generated, category: cat, articles: catArticles }))
  console.log(`  Built: api/articles/${cat}.json (${catArticles.length} articles)`)
}

// Briefing availability for meta. Expose the latest briefing whenever its
// mp3 still exists on disk — generate-briefing.js cleans up files older
// than 7 days, so the file-existence check is itself the freshness window.
// Older approach (36h time gate) hid playable mp3s for up to 5 days.
const apiBriefingMetaPath = join(ROOT, 'content', 'audio', 'briefing-meta.json')
let briefingInfo = null
if (existsSync(apiBriefingMetaPath)) {
  const bm = JSON.parse(readFileSync(apiBriefingMetaPath, 'utf-8'))
  const mp3Path = join(ROOT, 'content', 'audio', `briefing-${bm.date}.mp3`)
  if (existsSync(mp3Path)) {
    briefingInfo = { date: bm.date, available: true, duration: bm.duration ?? 0 }
  }
}

// Pre-grouped endpoint. Full payload — consumed by workers/mcp (which reads
// `contexts` and `threadSummary`) and by the dashboard's quality tab.
writeFileSync(join(DIST_DIR, 'api', 'feed.json'), JSON.stringify({
  generated,
  categories: apiCategories,
  briefing: briefingInfo,
  contexts: contextIndex
}))
console.log(`  Built: api/feed.json (${apiArticles.length} articles, pre-grouped)`)

// Pre-grouped endpoint for mobile — same articles, none of the payload the app
// never opens. `contexts` is a ~3,200-entry brief index (89% of feed.json's
// bytes) and `threadSummary` another ~25 KB; the app reads neither. Shipping
// them cost ~180 KB gzipped on every cold launch, every content-rotation
// refresh, and every 4-hour background task, against ~15 KB of actual reading
// material. Derived from `apiCategories` so the article shape cannot drift
// between the two endpoints.
const liteCategories = Object.fromEntries(
  Object.entries(apiCategories).map(([cat, articles]) => [
    cat,
    articles.map(({ threadSummary, ...rest }) => rest)
  ])
)
writeFileSync(join(DIST_DIR, 'api', 'feed-lite.json'), JSON.stringify({
  generated,
  categories: liteCategories,
  briefing: briefingInfo
}))
console.log(`  Built: api/feed-lite.json (${apiArticles.length} articles, mobile)`)

// ── The Swedish payload, for islam.se ──────────────────────────────────────
//
// islam.se carries a small "Världen just nu" band and a /nyheter/ page, both
// fed from here. Nothing Swedish is rendered on zuhd.news: this endpoint is
// linked from no page, is in neither sitemap nor feed.xml, and carries
// `X-Robots-Tag: noindex` in `public/_headers`.
//
// It is a NEW endpoint rather than fields on `feed.json`, because the JSON
// APIs are a published contract and the app is live in both stores.
//
// Built from `sorted` rather than from `apiCategories`, deliberately. The two
// differ in both window and shape: `apiCategories` is a 24h window with a
// per-category backfill and carries the full English article, while this is a
// flat 48h list of Swedish text. Deriving it from the grouped object would
// mean unpicking the grouping and then discarding most of each article — the
// anti-drift guarantee that matters here is the assertion in
// `sv-payload.test.js` that the shared fields agree, not a shared expression.
//
// 48h, where the UI shows 24h: the extra day is what keeps a link shared
// yesterday evening resolvable this morning rather than falling back.
const svSrc = join(ROOT, 'content', '.sv.json')
const svTranslations = existsSync(svSrc)
  ? JSON.parse(readFileSync(svSrc, 'utf8')).articles || {}
  : {}
const svCutoff = Date.now() - SV_WINDOW_MS
const svArticles = sorted
  .filter(a => svTranslations[a.slug] && svEventTime(a.meta, a.addedAt) >= svCutoff)
  .sort((a, b) => svEventTime(b.meta, b.addedAt) - svEventTime(a.meta, a.addedAt))
  .map(a => svFeedItem(a, svTranslations[a.slug], SHARE.shareUrl(a.slug)))

mkdirSync(join(DIST_DIR, 'api', 'sv'), { recursive: true })
writeFileSync(join(DIST_DIR, 'api', 'sv', 'feed.json'), JSON.stringify({
  generated,
  fonster: 'PT48H',
  artiklar: svArticles
}))
console.log(`  Built: api/sv/feed.json (${svArticles.length} articles, sv, 48h)`)

// (eventTime hoisted above formatTimeAgo — every surface that says how old a
// story is now reads it, not just the geo layers.)

// Heatmap endpoint — 72h of geo-located article points for globe time-decay rendering
const HEATMAP_WINDOW_MS = 72 * 60 * 60 * 1000
const heatmapCutoff = Date.now() - HEATMAP_WINDOW_MS
const heatmapPoints = sorted
  .filter(a => a.addedAt >= heatmapCutoff && a.meta.lat != null && a.meta.lng != null)
  .map(a => {
    const tl = a.meta.threadLabel
    return {
      lat: Number(a.meta.lat),
      lng: Number(a.meta.lng),
      c: Number(a.meta.eventCoverage) || 0,
      t: eventTime(a),
      l: tl ? (tl.includes(':') ? tl.slice(0, tl.indexOf(':')) : tl) : (a.meta.title || ''),
    }
  })
writeFileSync(join(DIST_DIR, 'api', 'heatmap.json'),
  JSON.stringify({ generated, points: heatmapPoints }))
console.log(`  Built: api/heatmap.json (${heatmapPoints.length} points, 72h)`)

// Map endpoints — the full 14-day geo-located corpus behind the homepage
// situational map. Deliberately separate from articles.json/feed.json: those
// are the 24h reading surface mobile depends on, this is the wide, thin point
// set.
//
// Split in two on purpose. map.json is everything needed to *render* a beacon
// and label it; the lead sentences live in map-leads.json, fetched during idle
// after first paint. Inlining the leads tripled the payload the homepage
// blocks on, for text that isn't visible until someone hovers something.
//
// `w` is the beacon's size channel, and it is computed here rather than in the
// browser because the honest version needs the whole corpus at once.
//
// Two things make the raw eventCoverage number unusable as a radius. It is
// absent on roughly two thirds of articles — the selector only records it when
// the feed reported it — and where present it is occasionally nonsense (the
// corpus holds values like 157957, which is not a number of outlets). A plain
// log curve therefore pinned most of the map at the minimum radius while a
// handful of bad rows saturated the top, so the size channel carried almost no
// information.
//
// A percentile rank over the values we actually have fixes both at once: it
// spends the full 0..1 range on real distinctions and an outlier is just "the
// largest", worth no more than the next one down. Articles with no coverage
// figure carry no `w` at all — the map gives them a fixed neutral size, which
// says "unknown" instead of falsely saying "smallest".
const coverageRanks = (() => {
  const known = sorted
    .filter(a => a.meta.lat != null && a.meta.lng != null)
    .map(a => Number(a.meta.eventCoverage))
    .filter(v => Number.isFinite(v) && v > 0)
    .sort((x, y) => x - y)
  if (known.length < 2) return null
  return (v) => {
    // Index of the first value >= v, i.e. this story's standing in the field.
    let lo = 0
    let hi = known.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (known[mid] < v) lo = mid + 1
      else hi = mid
    }
    return Math.round((lo / (known.length - 1)) * 100) / 100
  }
})()

const mapPoints = sorted
  .filter(a => a.meta.lat != null && a.meta.lng != null)
  .map(a => {
    const cov = Number(a.meta.eventCoverage)
    const hasCov = Number.isFinite(cov) && cov > 0
    // Source disagreement. The pipeline measures how far apart the outlets
    // covering a story sit in sentiment; a contested story is a different kind
    // of event from a uniformly reported one, and the map had no way to say so.
    const div = Number(a.meta.sentimentDivergence)
    return {
      lat: Number(a.meta.lat),
      lng: Number(a.meta.lng),
      t: eventTime(a),
      c: hasCov ? cov : 0,
      cat: a.meta.category || 'politics',
      slug: a.slug,
      title: a.title,
      // Display layer, matching the app: locations in historic Palestine are
      // shown under their original Arabic names. The frontmatter is untouched —
      // `location` still has to equal the dateline city exactly, which mobile's
      // dateline strip depends on.
      loc: displayLocation(a.meta.location || '') || '',
      n: a.sources.length,
      ...(hasCov && coverageRanks ? { w: coverageRanks(cov) } : {}),
      ...(Number.isFinite(div) && div > 0 ? { d: Math.round(div * 100) / 100 } : {}),
    }
  })
  .sort((a, b) => a.t - b.t)
const mapWindow = {
  start: mapPoints.length ? mapPoints[0].t : Date.now(),
  end: mapPoints.length ? mapPoints[mapPoints.length - 1].t : Date.now(),
}
writeFileSync(join(DIST_DIR, 'api', 'map.json'),
  JSON.stringify({ generated, window: mapWindow, points: mapPoints }))
console.log(`  Built: api/map.json (${mapPoints.length} points, ${BUILD_WINDOW_DAYS}d)`)

// The story archive — everything between the build window and 90 days back.
//
// The map's time range used to stop at the fortnight because the corpus the
// build produces stops there. Once that control also drives the money block's
// sparklines it grew a 30d and a 90d step, and a range whose two widest
// positions showed the same beacons as the third would be a control lying about
// half of what it governs.
//
// **A separate endpoint, not a wider `map.json`.** The 14-day payload is 147 KB
// (47 KB gzipped) and is `<link rel=preload>`ed — it is what the homepage
// blocks on. Ninety days is 4,700 stories, which measured at roughly six and a
// half times that, so folding them in would put ~250 KB of gzipped JSON in
// front of first paint for stories most readers will never ask for. This is the
// bargain `map-leads.json`, the conflict feed and the water layers all already
// strike: ship what the opening view needs, fetch the rest when something asks.
// Nobody who stays inside a week ever downloads it.
//
// Parsed light and separately: `buildArticle` renders markdown, an isnad and a
// page, and none of that reaches a beacon. Frontmatter alone across 4,000 files
// measured at 411 ms, against the seconds a full build of them would cost on
// every one of five daily cycles.
const MAP_ARCHIVE_DAYS = 90
const archiveCutoffDate = new Date(Date.now() - MAP_ARCHIVE_DAYS * 24 * 60 * 60 * 1000)
  .toISOString().slice(0, 10)
const archivePoints = readdirSync(CONTENT_DIR)
  .filter(f =>
    f.endsWith('.md') &&
    f !== 'example.md' &&
    // Strictly older than the build window: `map.json` owns everything from
    // `buildCutoffDate` on, and a story in both payloads would draw twice —
    // two beacons on one coordinate, and two rows in the rail.
    f.slice(0, 10) < buildCutoffDate &&
    f.slice(0, 10) >= archiveCutoffDate)
  .map(f => {
    const { meta } = parseFrontmatter(readFileSync(join(CONTENT_DIR, f), 'utf8'))
    if (meta.lat == null || meta.lng == null) return null
    // No mtime fallback here, unlike `eventTime`. That fallback exists because
    // a rewritten file's date can be unparseable and the story is still today's
    // news; a story three months old with no readable date has nothing a
    // `statSync` on 4,000 files would recover, and the scrubber would place it
    // at the moment of the build.
    const t = meta.date ? Date.parse(meta.date) : NaN
    if (!Number.isFinite(t)) return null
    const cov = Number(meta.eventCoverage)
    const hasCov = Number.isFinite(cov) && cov > 0
    const div = Number(meta.sentimentDivergence)
    return {
      lat: Number(meta.lat),
      lng: Number(meta.lng),
      t,
      c: hasCov ? cov : 0,
      cat: meta.category || 'politics',
      slug: f.replace(/\.md$/, ''),
      title: meta.title || '',
      loc: displayLocation(meta.location || '') || '',
      n: Array.isArray(meta.sources) ? meta.sources.length : 0,
      // The *same* percentile function the 14-day set is ranked by, deliberately.
      // Ranking the archive against its own distribution would make a radius
      // mean one thing inside the fortnight and another outside it, on a map
      // that draws both at once — the "same numeral, two different facts"
      // objection the ground metric's default already turns on.
      ...(hasCov && coverageRanks ? { w: coverageRanks(cov) } : {}),
      ...(Number.isFinite(div) && div > 0 ? { d: Math.round(div * 100) / 100 } : {}),
    }
  })
  .filter(Boolean)
  .sort((a, b) => a.t - b.t)
writeFileSync(join(DIST_DIR, 'api', 'map-archive.json'),
  JSON.stringify({
    generated,
    window: {
      start: archivePoints.length ? archivePoints[0].t : mapWindow.start,
      end: mapWindow.start,
    },
    points: archivePoints,
  }))
console.log(
  `  Built: api/map-archive.json (${archivePoints.length} points, ${BUILD_WINDOW_DAYS}–${MAP_ARCHIVE_DAYS}d)`,
)

// Thermal anomalies — NASA FIRMS active-fire detections, joined to the stories
// they may corroborate. Here rather than beside the GDACS mirror because this is
// the one overlay that is *about* the corpus: the join needs `eventTime` and the
// same geo-located set behind map.json, and an event with nothing to corroborate
// is not published at all.
//
// That last rule is the layer, and it took three gates to get right.
// `content/.firms.json` holds every clustered anomaly within 75 km of a story
// location — 1,391 on the snapshot this was built against — because the
// fetcher's AOI is a 10° grid that knows nothing about *when* anything happened.
// Adding the time window takes it to 58. Adding `isThermallyRelevant` takes it
// to **11**, and that third gate is not a refinement, it is the layer: without
// it the map published a veld fire outside Johannesburg cited against "Joburg
// Bills Wrong Owners", because a city-centroid join catches every fire in a
// metropolitan region. See `lib/firms.js` for the whole account.
//
// The wider snapshot stays on disk and unpublished, the way fetch-ioda.js keeps
// its series: the evidence is inspectable, and only what can be explained is
// drawn.
const firmsSrc = join(ROOT, 'content', '.firms.json')
if (existsSync(firmsSrc)) {
  const raw = JSON.parse(readFileSync(firmsSrc, 'utf8'))
  // The same filter map.json uses, plus the two fields the card needs that a map
  // point does not carry: a formatted date, and the place name to print a
  // distance against.
  const geoIndex = sorted
    .filter((a) => a.meta.lat != null && a.meta.lng != null)
    // Title and concepts, the same haystack the chokepoint and market joins
    // build — and deliberately not the body, which admits matches on a passing
    // mention rather than on what a story is about.
    .filter((a) =>
      isThermallyRelevant(
        [a.title, ...(a.concepts || []).map((x) => (typeof x === 'object' ? x.label : x))].join(' '),
      ),
    )
    .map((a) => ({
      slug: a.slug,
      title: a.title,
      date: a.meta.date,
      dateFormatted: a.dateFormatted,
      loc: displayLocation(a.meta.location || '') || '',
      lat: Number(a.meta.lat),
      lng: Number(a.meta.lng),
      t: eventTime(a),
    }))
  const firmsEvents = []
  for (const event of raw.events ?? []) {
    const hits = nearestStories(event, geoIndex)
    if (hits.length === 0) continue
    // `seedKm` was the fetcher's coarse distance-to-any-story, used only to bound
    // the snapshot. The published distance is to the story actually cited.
    const { seedKm, ...rest } = event
    firmsEvents.push({
      ...rest,
      // Denormalised so the card can say "18 km from Beirut" without the island
      // holding the corpus. The nearest hit, which is also `relatedArticles[0]`.
      near: { loc: hits[0].loc, km: hits[0].km },
      relatedArticles: hits.map((h) => ({
        slug: h.slug,
        title: h.title,
        date: h.date,
        dateFormatted: h.dateFormatted,
        km: h.km,
      })),
    })
  }
  writeFileSync(
    join(DIST_DIR, 'api', 'firms.json'),
    JSON.stringify({
      generated,
      source: raw.source,
      dayRange: raw.dayRange,
      joinRadiusKm: raw.joinRadiusKm,
      events: firmsEvents,
      // What was dropped and why, carried through from the fetcher and extended.
      // A bounded layer that does not say what it left out reads as complete.
      skipped: {
        ...(raw.skipped ?? {}),
        unjoined: (raw.events?.length ?? 0) - firmsEvents.length,
      },
    }),
  )
  console.log(
    `  Built: api/firms.json (${firmsEvents.length} anomalies joined to coverage, ` +
      `${(raw.events?.length ?? 0) - firmsEvents.length} unjoined)`,
  )
}

// Acute food insecurity — the IPC's own area classifications, at Emergency and
// above. Beside the disaster and thermal mirrors rather than in the corpus join
// above, because unlike `firms.json` this layer is not *about* the corpus: an IPC
// determination stands whether or not we happened to write about that district
// this fortnight, in exactly the way a genocide determination does.
//
// `content/.ipc.json` holds every gated area at every phase — 1,852 across 25
// countries on the snapshot this was built against — and only the grave end is
// published: 105 areas, being the 101 the IPC classifies at Phase 4 or worse plus
// the four Gaza areas it classifies at Phase 3 while counting tens of thousands
// of people in Catastrophe. `publishable` in `lib/ipc.js` carries the argument for
// that compound bar. Same treatment `.firms.json` and `.ioda.json` get: the
// evidence stays inspectable, only what can be accounted for is drawn.
const ipcSrc = join(ROOT, 'content', '.ipc.json')
if (existsSync(ipcSrc)) {
  const raw = JSON.parse(readFileSync(ipcSrc, 'utf8'))
  const today = generated.slice(0, 10)
  const all = raw.areas ?? []
  const ipcAreas = []
  for (const a of all) {
    if (!publishable(a)) continue
    // The projection covering today, if the same analysis published one. Used for
    // one line on the card and never to pick a phase — see `lib/ipc.js`, which
    // owns the comparison so this is not a second copy of it.
    const supersedes = windowCoveringDay(a.projections, today)
    ipcAreas.push({
      // Stable and explicit, rather than derived in the island: this is the key
      // the hit test resolves a clicked mark through, and an id computed on the
      // client from a name is an id that changes when the name is tidied.
      id: `${a.iso3}:${a.area}`,
      area: a.area,
      level1: a.level1 || '',
      iso3: a.iso3,
      // Absent rather than guessed when the code is outside the IPC's own list,
      // so the card renders no country link instead of a broken one.
      iso2: ISO3_TO_ISO2[a.iso3] ?? undefined,
      phase: a.phase,
      phaseName: PHASE_NAMES[a.phase],
      confidence: a.confidence ?? undefined,
      prolongedCrisis: a.prolongedCrisis || undefined,
      lat: a.lat,
      lng: a.lng,
      vintage: a.vintage,
      ageMonths: a.ageMonths,
      from: a.from,
      to: a.to,
      // Only the figures a card states. The full per-phase breakdown stays in
      // `.ipc.json`; shipping twenty numbers per area to draw four of them is the
      // `feed.json` / `feed-lite.json` lesson applied before it costs anything.
      pop: {
        total: a.population?.total ?? null,
        p3plus: a.population?.p3plus ?? null,
        p4: a.population?.p4 ?? null,
        p5: a.population?.p5 ?? null,
      },
      ...(supersedes ? { supersededBy: supersedes } : {}),
    })
  }
  // Gravest first, then newest — so the reader of a truncated payload, and the
  // symbol layer's own sort, both lead with what matters most.
  ipcAreas.sort((a, b) => b.phase - a.phase || a.ageMonths - b.ageMonths)
  writeFileSync(
    join(DIST_DIR, 'api', 'ipc.json'),
    JSON.stringify({
      generated,
      source: raw.source,
      license: raw.license,
      ageLimitMonths: raw.ageLimitMonths,
      countries: [...new Set(ipcAreas.map((a) => a.iso3))].sort(),
      areas: ipcAreas,
      skipped: {
        ...(raw.skipped ?? {}),
        // What the publication bar itself dropped, which the fetcher cannot know.
        belowBar: all.length - ipcAreas.length,
      },
    }),
  )
  console.log(
    `  Built: api/ipc.json (${ipcAreas.length} areas at Emergency or worse across ` +
      `${new Set(ipcAreas.map((a) => a.iso3)).size} countries, ` +
      `${all.length - ipcAreas.length} below the bar)`,
  )
}

// Indicator map: id → {label, kind}. Drives the entity strip on both the
// article page and the map's story card, so only chips that actually resolve
// to a /e/{id} page + /api/entity/{id}.json blob are ever surfaced.
//
// Built here rather than beside the article pages that used to be its only
// consumer, because the story payloads below need it and are written first.
const indicatorMap = new Map()
{
  const today = new Date().toISOString().slice(0, 10)
  const candidates = [join(ROOT, 'content', 'trends', `${today}.json`)]
  // Fall back to the most recent snapshot when today's hasn't been
  // generated yet — identical to what entity-pages.js does internally.
  const trendsDir = join(ROOT, 'content', 'trends')
  if (existsSync(trendsDir)) {
    const names = readdirSync(trendsDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
    if (names.length) candidates.push(join(trendsDir, names[names.length - 1]))
  }
  for (const p of candidates) {
    if (!existsSync(p)) continue
    const trends = JSON.parse(readFileSync(p, 'utf8'))
    for (const ind of trends.indicators || []) {
      if (ind?.id && !indicatorMap.has(ind.id)) {
        indicatorMap.set(ind.id, { label: ind.label, kind: ind.cadence || 'indicator' })
      }
    }
    if (indicatorMap.size) break
  }
  // The chokepoint and exchange series get pages too, so a chip naming one is a
  // chip that resolves. Added after the loop rather than inside it because the
  // `break` above is about finding a usable trends snapshot, and these come
  // from payloads that have nothing to do with which snapshot won.
  for (const ind of extraIndicators) {
    if (!indicatorMap.has(ind.id)) {
      indicatorMap.set(ind.id, { label: ind.label, kind: ind.cadence || 'indicator' })
    }
  }
}
// Per-story payloads for the map's reading card. The map never navigates away
// to read — the card opens anchored at the story's own coordinates — so each
// story needs its rendered body reachable on its own. One small file per story
// rather than one large blob: only what is opened gets fetched.
mkdirSync(join(DIST_DIR, 'api', 'story'), { recursive: true })
let storyCount = 0
for (const a of sorted) {
  if (a.meta.lat == null || a.meta.lng == null) continue
  const thread = threadLookup.get(a.slug)
  writeFileSync(
    join(DIST_DIR, 'api', 'story', `${a.slug}.json`),
    JSON.stringify({
      slug: a.slug,
      title: a.title,
      date: a.meta.date,
      dateFormatted: a.dateFormatted,
      category: a.meta.category || 'politics',
      location: a.meta.location || '',
      eventCoverage: Number(a.meta.eventCoverage) || 0,
      bodyHtml: a.bodyHtmlBare ?? a.bodyHtml,
      sentimentDivergence:
        a.meta.sentimentDivergence != null ? Number(a.meta.sentimentDivergence) : null,
      // `country` and `sentiment` were dropped here while feed.json (above)
      // forwarded both. That left the map's story card able to say "230
      // outlets" and nothing else — no names, no datelines, and no way to show
      // *what* the outlets disagreed about on a story the map had already
      // ringed as contested. The ring poses the question; these two fields are
      // the only answer we hold.
      sources: a.sources.map((x) => ({
        name: x.name,
        url: x.url || '',
        country: x.country || null,
        sentiment: x.sentiment != null ? Number(x.sentiment) : null,
      })),
      /**
       * The indicators this story is about.
       *
       * The article page has carried these as a chip row for a long time and
       * the map's card never did, so the one surface built for a reader who
       * wants to see how things connect was the one surface that could not
       * reach a single chart. A story about the strait of Hormuz sat on the map
       * a few hundred pixels from the Brent series it is about, with no route
       * between them — and taking that route from an article means leaving for
       * `/e/{id}`, which on the map would mean abandoning a camera, a time
       * slice and a set of filters the reader built.
       *
       * Filtered through `indicatorMap` for the same reason the article strip
       * is: an entity naming a series we do not publish would be a chip that
       * opens an empty sheet.
       */
      ...(() => {
        const entities = (Array.isArray(a.meta.entities) ? a.meta.entities : [])
          .map((e) =>
            e?.indicatorId ? { ...e, indicatorId: canonicalIndicatorId(e.indicatorId) } : e,
          )
          .filter((e) => e?.indicatorId && indicatorMap.has(e.indicatorId))
          .map((e) => ({
            id: e.indicatorId,
            label: indicatorMap.get(e.indicatorId).label || e.mention || e.indicatorId,
          }))
        return entities.length ? { entities } : {}
      })(),
      ...(thread?.threadLabel ? { threadLabel: thread.threadLabel } : {}),
    }),
  )
  storyCount++
}
console.log(`  Built: api/story/ (${storyCount} story cards)`)

// Lead sentences, keyed by slug. Lazily fetched by the map island so a beacon
// sheet has real text the moment it opens, without a per-beacon round trip.
const mapLeads = {}
for (const a of sorted) {
  if (a.meta.lat == null || a.meta.lng == null) continue
  // Body copy is markdown, and the pipeline writes country tags as
  // `[Iran](country:IR)`. The popup renders plain text, so unwrap links to
  // their label and apply the same typographic quotes the rest of the site uses.
  // The dateline is stripped outright rather than re-styled the way
  // `buildArticle` does it — the popup's kicker already prints the place, so
  // the body's own "City — " would be a second copy pushing the sentence
  // itself out from the paragraph's left edge.
  const datelineMatch = a.body.match(DATELINE_RE)
  const bodyForLead = datelineMatch ? a.body.slice(datelineMatch[0].length) : a.body
  const lead = smartQuotes(
    splitBlocks(bodyForLead)
      .slice(0, 2)
      .join(' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\*\*?([^*]+)\*\*?/g, '$1'),
  ).trim()
  if (lead) mapLeads[a.slug] = lead
}
writeFileSync(join(DIST_DIR, 'api', 'map-leads.json'),
  JSON.stringify({ generated, leads: mapLeads }))
console.log(`  Built: api/map-leads.json (${Object.keys(mapLeads).length} leads)`)

// Basemap sources for MapLibre — the 1:50m coastline plus a 1:10m tier for
// close zoom, and place labels. All served from our own origin so the CSP stays
// `default-src 'none'`. The old 1:110m placeholder tier is gone; see
// `scripts/build/basemap.js` for why one good fetch beat two.
{
  mkdirSync(join(DIST_DIR, 'basemap'), { recursive: true })
  const { countries, countriesUltra, countryLabels, places, lakes, rivers, seas, stars } =
    await buildMapSources(ROOT)
  const emit = (name, data) => {
    writeFileSync(join(DIST_DIR, 'basemap', name), JSON.stringify(data))
    return Math.round(statSync(join(DIST_DIR, 'basemap', name)).size / 1024)
  }
  const a = emit('countries.geojson', countries)
  const d = emit('countries-ultra.geojson', countriesUltra)
  emit('country-labels.geojson', countryLabels)
  const c = emit('places.geojson', places)
  const l = emit('lakes.geojson', lakes)
  const r = emit('rivers.geojson', rivers)
  const s = emit('seas.geojson', seas)
  // The sky. Idle-deferred by the island, so its weight is not first paint —
  // and absent entirely if `shared/data/stars.json` has not been generated,
  // which draws a globe with a sun, a moon and no stars rather than failing.
  const st = stars ? emit('stars.json', stars) : 0
  console.log(
    `  Built: basemap/ (countries ${a}KB, ultra ${d}KB, ${places.features.length} places ${c}KB, ` +
      `${lakes.features.length} lakes ${l}KB, ${rivers.features.length} rivers ${r}KB, ` +
      `${seas.features.length} seas ${s}KB, ${stars ? `${stars.count} stars ${st}KB` : 'no stars'})`,
  )
}

// Atom feed for RSS readers
const feedArticles = sorted.filter(a => a.addedAt >= cutoff).slice(0, 30)
const atomEntries = feedArticles.map(a => `  <entry>
    <title>${escXml(a.meta.title || 'Untitled')}</title>
    <link href="https://zuhd.news/a/${a.slug}" rel="alternate"/>
    <id>tag:zuhd.news,${a.meta.date?.slice(0, 10) || '2026'}:${a.slug}</id>
    <updated>${new Date(a.correctedAt || a.meta.date || a.addedAt).toISOString()}</updated>
    <category term="${escXml(a.meta.category || 'politics')}"/>
    <summary>${escXml(a.body.trim())}</summary>${a.sources[0] ? `\n    <source><title>${escXml(a.sources[0].name)}</title></source>` : ''}
  </entry>`).join('\n')

const atomFeed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>zuhd.news</title>
  <subtitle>Global news, no noise.</subtitle>
  <link href="https://zuhd.news/" rel="alternate"/>
  <link href="https://zuhd.news/feed.xml" rel="self"/>
  <id>tag:zuhd.news,2025:feed</id>
  <updated>${generated}</updated>
  <icon>https://zuhd.news/favicon.svg</icon>
${atomEntries}
</feed>
`
writeFileSync(join(DIST_DIR, 'feed.xml'), atomFeed)
console.log(`  Built: feed.xml (${feedArticles.length} entries)`)

writeFileSync(join(DIST_DIR, 'api', 'meta.json'), JSON.stringify({
  generated,
  total: apiArticles.length,
  categories: Object.fromEntries(CATEGORY_ORDER.filter(c => c in apiCategories).map(c => [c, apiCategories[c].length])),
  briefing: briefingInfo
}))
console.log('  Built: api/meta.json')

// Homepage and static pages
const homepage = buildHomepage(sorted, cutoff, homepageTemplate)
  .replace(/{{audioBriefing}}/g, audioBriefingHtml)
writeFileSync(join(DIST_DIR, 'index.html'), homepage)
console.log(`  Built: index.html (${articles.length} articles)`)

// Per-article static pages at /a/{slug}.html — replaces the legacy
// functions/a/[slug].js runtime redirect with real, crawlable, share-ready
// HTML. Uses `sorted` so prev/next navigation follows reverse-chronological
// order (newest → oldest), matching the homepage list semantics.

mkdirSync(join(DIST_DIR, 'a'), { recursive: true })
for (let i = 0; i < sorted.length; i++) {
  const article = sorted[i]
  const prev = sorted[i + 1] ?? null
  const next = sorted[i - 1] ?? null
  const thread = threadLookup.get(article.slug) || null
  const html = buildArticlePage(article, prev, next, thread, articleTemplate, indicatorMap)
  writeFileSync(join(DIST_DIR, 'a', `${article.slug}.html`), html)
}
console.log(`  Built: a/ (${sorted.length} article pages)`)

// Islands: compile public/islands/*.ts via esbuild into dist/islands/*.js.
// Each island is an ESM entry that island-loader.js lazy-loads on first
// activation of its affordance (a [data-island] click or a
// [data-island-auto] element on the page).
const islandsResult = await buildIslands()
if (islandsResult.count > 0) {
  console.log(`  Built: islands/ (${islandsResult.count} entries)`)
}

// Per-article OG images at /api/og/{slug}.png — typography + monochrome
// orthographic map inset. Generated at build time; Cloudflare Pages serves
// the static PNGs from the edge with standard cache headers. OG scrapers
// (WhatsApp, X, iMessage, Facebook) dereference og:image URLs emitted by
// article pages and render rich previews with the article's map view.
//
// OG rendering dominates the build (~160 s for 852 articles). We cache
// each PNG outside dist/ keyed by a content hash of the render inputs,
// so cold builds stay expensive but warm rebuilds (the typical dev loop)
// are a pure file copy. SKIP_OG=1 bypasses generation entirely — used by
// `npm run dev` since local previews don't need share cards.
mkdirSync(join(DIST_DIR, 'api', 'og'), { recursive: true })
if (process.env.SKIP_OG === '1') {
  console.log('  Skipped: api/og/ (SKIP_OG=1)')
} else {
  const OG_CACHE_DIR = join(ROOT, '.cache', 'og')
  // v5: rasterizeSvg switched from `fontBuffers` to `fontFiles` (every cached
  // card was a monospace-metric render), and the title measure was retuned for
  // the real advances that change exposed.
  const OG_VERSION = 'v6' // bump when og-image.js rendering changes
  mkdirSync(OG_CACHE_DIR, { recursive: true })
  const ogStart = Date.now()
  let cached = 0
  let rendered = 0
  for (const article of sorted) {
    const inputs = {
      v: OG_VERSION,
      title: article.title,
      category: article.meta.category || null,
      date: article.meta.date,
      location: article.meta.location || null,
      lat: article.meta.lat != null ? Number(article.meta.lat) : null,
      lng: article.meta.lng != null ? Number(article.meta.lng) : null,
    }
    const key = createHash('sha1').update(JSON.stringify(inputs)).digest('hex')
    const cachePath = join(OG_CACHE_DIR, `${key}.png`)
    const dstPath = join(DIST_DIR, 'api', 'og', `${article.slug}.png`)
    let png
    if (existsSync(cachePath)) {
      png = readFileSync(cachePath)
      cached++
    } else {
      png = buildOgPng(inputs, 'light')
      writeFileSync(cachePath, png)
      rendered++
    }
    writeFileSync(dstPath, png)
  }
  console.log(
    `  Built: api/og/ (${sorted.length} OG images · ${cached} cached + ${rendered} rendered in ${((Date.now() - ogStart) / 1000).toFixed(1)}s)`,
  )
}

// Instagram share cards at /api/ig/{slug}.jpg (+ .story.jpg) — the "headline
// over a delicate globe" card the auto-poster publishes. The breaking post is
// only ever drawn from THIS cycle's articles (content/.last-cycle.json, written
// just before this build), so we render exactly that set — the minimal work
// that still guarantees the breaking slug's card exists, whatever the cycle
// size. Manual/dev builds without a fresh cycle file fall back to the most
// recent IG_RECENT. Same content-hash disk cache as OG. Instagram's publish API
// needs a public JPEG URL, hence .jpg alongside the PNG OG cards. SKIP_OG
// bypasses both.
mkdirSync(join(DIST_DIR, 'api', 'ig'), { recursive: true })
if (process.env.SKIP_OG === '1') {
  console.log('  Skipped: api/ig/ (SKIP_OG=1)')
} else {
  const IG_CACHE_DIR = join(ROOT, '.cache', 'ig')
  // v7: measured type — the fitter replaced the character-count wrap, so every
  // cached card was composed against the old (truncating) layout.
  const IG_VERSION = 'v7' // bump when ig-image.js rendering changes
  const IG_RECENT = 20 // dev/manual fallback window
  // The dek is `igLead`, in lib/ig-image.js beside the card it feeds — it used
  // to be declared here and again in each of the two posters, and the three had
  // parted over whether to cut on an ellipsis.
  mkdirSync(IG_CACHE_DIR, { recursive: true })
  let cycleSlugs = null
  try {
    const cycle = JSON.parse(readFileSync(join(ROOT, 'content', '.last-cycle.json'), 'utf8'))
    const s = new Set((cycle.articles || []).map((a) => a.slug))
    if (s.size) cycleSlugs = s
  } catch {
    /* no cycle file — use the recent-window fallback below */
  }
  const igArticles = cycleSlugs ? sorted.filter((a) => cycleSlugs.has(a.slug)) : sorted.slice(0, IG_RECENT)
  const igStart = Date.now()
  let igCached = 0
  let igRendered = 0
  for (const article of igArticles) {
    const inputs = {
      v: IG_VERSION,
      // Prefer the social-optimized card headline (written pre-build by
      // pick-breaking-social.js) over the article title; falls back cleanly.
      headline: article.meta.socialTitle ? smartQuotes(article.meta.socialTitle) : article.title,
      summary: igLead(article.body),
      category: article.meta.category || null,
      date: article.meta.date,
      location: article.meta.location || null,
      lat: article.meta.lat != null ? Number(article.meta.lat) : null,
      lng: article.meta.lng != null ? Number(article.meta.lng) : null,
    }
    /** @type {[string, { width: number, height: number }][]} */
    const igSizes = [
      ['jpg', IG_FEED],
      ['story.jpg', IG_STORY],
    ]
    for (const [suffix, size] of igSizes) {
      const key = createHash('sha1').update(JSON.stringify({ ...inputs, size: suffix })).digest('hex')
      const cachePath = join(IG_CACHE_DIR, `${key}.jpg`)
      const dstPath = join(DIST_DIR, 'api', 'ig', `${article.slug}.${suffix}`)
      let jpg
      if (existsSync(cachePath)) {
        jpg = readFileSync(cachePath)
        igCached++
      } else {
        jpg = buildIgJpeg(inputs, size)
        writeFileSync(cachePath, jpg)
        igRendered++
      }
      writeFileSync(dstPath, jpg)
    }
  }
  console.log(
    `  Built: api/ig/ (${igArticles.length} IG cards × 2 · ${igCached} cached + ${igRendered} rendered in ${((Date.now() - igStart) / 1000).toFixed(1)}s)`,
  )
}

// Per-category pages at /c/{category}.html — chronological list of
// every article in the category within the build window. Each category
// page is a simple archetype: header + headline list, no reader chrome.
const categoryPageTemplate = loadTemplate('category.html')

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)
mkdirSync(join(DIST_DIR, 'c'), { recursive: true })
const byCategory = {}
for (const a of sorted) {
  const cat = a.meta.category || 'politics'
  // biome-ignore lint/suspicious/noAssignInExpressions: the (x ??= []) group-by idiom, in statement position. The rule is here for `if (a = b)`.
  ;(byCategory[cat] ??= []).push(a)
}
// Group rows under a date heading so a 14-day archive scans without the
// date column repeating on every row. Days come in reverse-chronological
// order (newest first).
const formatDayHeading = (iso) => {
  const d = new Date(iso)
  const today = new Date()
  const yest = new Date(Date.now() - 86400000)
  const sameDay = (a, b) => a.toDateString() === b.toDateString()
  if (sameDay(d, today)) return 'Today'
  if (sameDay(d, yest)) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}
for (const cat of CATEGORY_ORDER) {
  const items = (byCategory[cat] || [])
    .slice()
    .sort((a, b) => (b.meta.date || '').localeCompare(a.meta.date || ''))
  if (items.length === 0) continue
  const groups = []
  let currentDay = null
  for (const a of items) {
    const day = (a.meta.date || '').slice(0, 10)
    if (day !== currentDay) {
      currentDay = day
      groups.push({ day, items: [] })
    }
    groups[groups.length - 1].items.push(a)
  }
  const rows = groups.map(g => `<li class="category-day-group">
      <h2 class="label section-title category-day-heading"><time datetime="${g.day}">${formatDayHeading(g.day)}</time></h2>
      <ol class="category-day-list">${g.items.map(a => `<li>${listRow({
        title: a.title,
        url: `/a/${a.slug}`,
        source: a.sources[0]?.name || '',
        variant: 'title-source',
      })}</li>`).join('')}</ol>
    </li>`).join('\n')
  const html = categoryPageTemplate
    .replaceAll('{{shareRow}}', shareRowHtml(`/c/${cat}`, `${capitalize(cat)} — zuhd.news`))
    .replaceAll('{{cat}}', cat)
    .replaceAll('{{catCap}}', capitalize(cat))
    .replaceAll('{{count}}', String(items.length))
    .replaceAll('{{days}}', String(BUILD_WINDOW_DAYS))
    .replaceAll('{{description}}', escHtml(`${items.length} ${cat} articles on zuhd.news. Minimalist global news, typography-first.`))
    .replaceAll('{{rows}}', rows)
  writeFileSync(join(DIST_DIR, 'c', `${cat}.html`), html)

  // The desk's own share card. Four files, no disk cache — the render is a
  // rectangle and two lines of type, and the story count on it changes every
  // cycle anyway, so a cache keyed on the inputs would miss every time.
  if (process.env.SKIP_OG !== '1') {
    mkdirSync(join(DIST_DIR, 'api', 'og', 'c'), { recursive: true })
    writeFileSync(
      join(DIST_DIR, 'api', 'og', 'c', `${cat}.png`),
      buildCategoryOgPng({ category: cat, count: items.length, days: BUILD_WINDOW_DAYS }, 'light'),
    )
  }
}
console.log(`  Built: c/ (${CATEGORY_ORDER.filter(c => (byCategory[c]||[]).length > 0).length} category pages)`)

/**
 * The card for the site itself, overwriting the one copied out of `public/`.
 *
 * `/og-image.png` is what a bare `zuhd.news` link renders as, and what every
 * static page, `/e/{id}` and `/get` still point at. It was a hand-made PNG last
 * touched in April — a grey capital Z, a mark this site replaced everywhere
 * else, on a dark field no other generated card uses. So the front door had the
 * exact problem the note at the head of `og-image.js`'s second section was
 * written about, and was the one page that section never reached.
 *
 * Generated rather than checked in, so it cannot drift from the card family
 * again, and unconditional — `SKIP_OG` guards the 718 per-article renders
 * because they are the expensive part of a cycle; this is one rectangle, one
 * globe and three lines of type.
 *
 * The meta tags point at `?v=2`. Scrapers cache a card by URL and this URL is
 * permanent, so without the token X, Facebook and WhatsApp would go on serving
 * the Z they scraped months ago. Bump it when the card's design changes; do not
 * make it a build stamp, or every deploy invalidates every cached card for no
 * reason.
 */
writeFileSync(join(DIST_DIR, 'og-image.png'), buildSiteOgPng('light'))
console.log('  Built: og-image.png (site share card)')

// Per-entity pages at /e/{id}.html — stock/commodity/index/chokepoint.
// Renders a monochrome inline SVG sparkline + the articles that
// reference the entity via frontmatter entities[].indicatorId.
const entityResult = await buildEntityPages({
  sorted,
  distDir: DIST_DIR,
  template: entityTemplate,
  shareRowHtml,
  dispatch,
  extraIndicators,
})
console.log(`  Built: e/ (${entityResult.count} entity pages)`)

// Per-country pages at /country/{ISO2}.html — country profile (flag,
// capital, 26 metrics × percentile strip × source attribution) + recent
// coverage for articles datelined in the country. Reads COUNTRY_DATA,
// COUNTRY_AUGMENTED, and country-ranking.ts directly from /shared/.
const countryResult = await buildCountryPages({
  sorted,
  distDir: DIST_DIR,
  template: countryTemplate,
  shareRowHtml,
  skipOg: process.env.SKIP_OG === '1',
})
console.log(
  `  Built: country/ (${countryResult.count} pages · ${countryResult.ogCached} cached + ${countryResult.ogRendered} rendered share cards)`,
)

// The same 27 metrics arranged the other way round — one file per metric,
// every country in it — so the map can tint the whole world by one dimension.
// Country pages answer "what is this country like"; these answer "where does
// this country sit", which is the question a map is for.
const metricResult = await buildCountryMetrics({ distDir: DIST_DIR })
console.log(`  Built: api/metric/ (${metricResult.count} metrics)`)

// sitemap.xml covers homepage, static pages, and all article pages.
// Cloudflare Pages serves /a/{slug}.html at /a/{slug} (extensionless).
const staticPages = ['about', 'contact', 'privacy', 'mcp']
// Build timestamp as lastmod for non-article pages (lists/indices that change
// whenever the corpus does); articles carry their own publication date.
const buildIso = new Date().toISOString()
const sitemapEntries = [
  `  <url><loc>https://zuhd.news/</loc><lastmod>${buildIso}</lastmod><changefreq>hourly</changefreq><priority>1.0</priority></url>`,
  ...staticPages.map(p => `  <url><loc>https://zuhd.news/${p}</loc><lastmod>${buildIso}</lastmod><changefreq>monthly</changefreq><priority>0.3</priority></url>`),
  ...sorted.map(a => `  <url><loc>https://zuhd.news/a/${a.slug}</loc><lastmod>${new Date(a.meta.date || a.addedAt).toISOString()}</lastmod><priority>0.8</priority></url>`),
  ...(countryResult.codes || []).map(cc => `  <url><loc>https://zuhd.news/country/${cc}</loc><lastmod>${buildIso}</lastmod><changefreq>weekly</changefreq><priority>0.5</priority></url>`),
  ...CATEGORY_ORDER.filter(c => (byCategory[c]||[]).length > 0).map(c => `  <url><loc>https://zuhd.news/c/${c}</loc><lastmod>${buildIso}</lastmod><changefreq>hourly</changefreq><priority>0.7</priority></url>`),
  ...(entityResult.ids || []).map(id => `  <url><loc>https://zuhd.news/e/${id}</loc><lastmod>${buildIso}</lastmod><changefreq>daily</changefreq><priority>0.5</priority></url>`),
]
writeFileSync(join(DIST_DIR, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries.join('\n')}
</urlset>
`)
console.log(`  Built: sitemap.xml (${sitemapEntries.length} URLs)`)

// Google News sitemap — a separate feed that lists ONLY articles published in
// the last 48 hours, per the Google News sitemap spec (older items are dropped
// automatically). Each <url> carries a <news:news> block with publication name
// + language, the ISO 8601 publication date, and the headline. Publication date
// reuses the same field the NewsArticle JSON-LD emits (meta.date, falling back
// to the file mtime). Empty is valid: when no article is fresh enough the feed
// renders an empty <urlset>.
const NEWS_SITEMAP_WINDOW_MS = 48 * 60 * 60 * 1000
const newsCutoff = Date.now() - NEWS_SITEMAP_WINDOW_MS
const newsArticles = sorted.filter((a) => {
  const pubMs = a.meta.date ? new Date(a.meta.date).getTime() : a.addedAt
  return Number.isFinite(pubMs) && pubMs >= newsCutoff
})
const newsEntries = newsArticles.map((a) => {
  const pubDate = new Date(a.meta.date || a.addedAt).toISOString()
  return `  <url>
    <loc>https://zuhd.news/a/${a.slug}</loc>
    <news:news>
      <news:publication>
        <news:name>zuhd.news</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${pubDate}</news:publication_date>
      <news:title>${escXml(a.title)}</news:title>
    </news:news>
  </url>`
})
writeFileSync(join(DIST_DIR, 'news-sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${newsEntries.join('\n')}
</urlset>
`)
console.log(`  Built: news-sitemap.xml (${newsEntries.length} articles, last 48h)`)

for (const page of staticPages) {
  const pagePath = join(ROOT, 'content', `${page}.md`)
  if (!existsSync(pagePath)) continue
  const body = readFileSync(pagePath, 'utf-8')
  // These used to be clones of the homepage with the reader pane filled in.
  // With the homepage now a full-bleed map they get their own plain template.
  const contentHtml = markdownToHtml(body)
  writeFileSync(join(DIST_DIR, `${page}.html`), staticPageTemplate
    .replace(/{{pageName}}/g, page)
    .replace('{{content}}', contentHtml)
    // The link to the page you are already reading is marked current and loses
    // its overlay trigger — opening a sheet of the page behind it is a no-op
    // the reader has to undo.
    .replace(
      `href="/${page}" data-island="doc-sheet" data-doc="${page}"`,
      `href="/${page}" aria-current="page"`,
    )
  )

  // The same prose, reachable without a page load, so the map can show these
  // over itself instead of navigating away from it. The standalone page above
  // stays the canonical URL — it is what a shared link, a crawler and a
  // JS-less browser get, and what the overlay's own address bar points at.
  mkdirSync(join(DIST_DIR, 'api', 'doc'), { recursive: true })
  writeFileSync(
    join(DIST_DIR, 'api', 'doc', `${page}.json`),
    JSON.stringify({ page, title: page, html: contentHtml }),
  )
  console.log(`  Built: ${page}.html`)
}

console.log('Done.')
