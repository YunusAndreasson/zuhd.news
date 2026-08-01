// What a link to this site looks like somewhere else.
//
// Almost everything on this site is verifiable by looking at it. The share
// surface is not: an `og:image` that 404s, a `twitter:card` with no image, a
// `twitter:site` naming the wrong account — all of it renders perfectly in a
// browser and fails only in the one place it exists for, which is somebody
// else's timeline. Nobody notices until a story gets passed around and arrives
// as a bare grey link.
//
// Four invariants, each pinning something that was actually wrong here:
//
//   1. Every page type declares a card, with an image and alt text.
//      `static-page.html` declared `summary_large_image` and no image at all,
//      so every share of /about or /mcp asked X for a big image card and gave
//      it nothing.
//   2. The card a page names is a file that exists. Country and category pages
//      now point at generated PNGs; a template that names one the build never
//      wrote is strictly worse than the generic card it replaced.
//   3. The masthead is credited, not the maker. `twitter:creator` was declared
//      and `twitter:site` was not, so every shared story attributed itself to a
//      personal account.
//   4. The links the server renders and the links the island renders are the
//      same links. Two copies of a URL template is two different shares of one
//      story, and the one nobody tests is the one that rots.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadShared } from '../build/shared-ts.js'

const ROOT = new URL('../..', import.meta.url).pathname
const DIST = join(ROOT, 'dist')
const SHARE = await loadShared('share.ts')

const meta = (html, attr, name) => {
  const m = html.match(
    new RegExp(`<meta\\s+${attr}="${name}"\\s+content="([^"]*)"`, 'i'),
  )
  return m ? m[1] : null
}
const og = (html, prop) => meta(html, 'property', prop)
const tw = (html, name) => meta(html, 'name', name)

/** One built page of each type, or null where that type has none. */
const samples = () => {
  const first = (dir, ext = '.html') => {
    const full = join(DIST, dir)
    if (!existsSync(full)) return null
    const hit = readdirSync(full).find((f) => f.endsWith(ext))
    return hit ? join(full, hit) : null
  }
  return {
    homepage: existsSync(join(DIST, 'index.html')) ? join(DIST, 'index.html') : null,
    article: first('a'),
    country: first('country'),
    category: first('c'),
    entity: first('e'),
    static: existsSync(join(DIST, 'about.html')) ? join(DIST, 'about.html') : null,
  }
}

test('every page type renders as a card, not a bare link', (t) => {
  const pages = samples()
  if (!pages.homepage) {
    t.skip('dist not built')
    return
  }
  for (const [kind, path] of Object.entries(pages)) {
    if (!path) continue
    const html = readFileSync(path, 'utf8')
    const image = og(html, 'og:image')
    assert.ok(image, `${kind} declares no og:image`)
    assert.ok(og(html, 'og:title'), `${kind} declares no og:title`)
    assert.ok(og(html, 'og:description'), `${kind} declares no og:description`)
    assert.ok(og(html, 'og:url'), `${kind} declares no og:url`)
    // Alt text is the accessible name of the only part of the page a lot of
    // people will ever see.
    assert.ok(og(html, 'og:image:alt'), `${kind} declares no og:image:alt`)

    const card = tw(html, 'twitter:card')
    assert.ok(card, `${kind} declares no twitter:card`)
    // Asking for a large-image card and supplying no image is how a share ends
    // up as a grey rectangle. If the card type promises an image, name one.
    if (card === 'summary_large_image') {
      assert.ok(tw(html, 'twitter:image'), `${kind} promises a large image and names none`)
    }
  }
})

test('the card a page names is a file the build actually wrote', (t) => {
  const pages = samples()
  if (!pages.homepage) {
    t.skip('dist not built')
    return
  }
  const ogDir = join(DIST, 'api', 'og')
  const ogGenerated = existsSync(ogDir) && readdirSync(ogDir).some((f) => f.endsWith('.png'))
  for (const [kind, path] of Object.entries(pages)) {
    if (!path) continue
    const html = readFileSync(path, 'utf8')
    for (const url of [og(html, 'og:image'), tw(html, 'twitter:image')].filter(Boolean)) {
      // The query is a cache-buster, not part of the path. `/og-image.png?v=2`
      // exists to make X and Facebook re-scrape a card whose URL is permanent
      // and whose old contents they have held since April; on disk it is still
      // `/og-image.png`, and a test that resolved the query would fail the day
      // the token was bumped rather than the day the file went missing.
      const rel = url.replace(/^https:\/\/zuhd\.news/, '').replace(/\?.*$/, '')
      // Generated cards are skipped by SKIP_OG, which is what `npm run dev`
      // uses: build.js still makes the directory, then writes nothing into it.
      // Absent because nobody asked for them is not a failure.
      if (rel.startsWith('/api/og/') && !ogGenerated) continue
      assert.ok(existsSync(join(DIST, rel)), `${kind} points at ${rel}, which does not exist`)
    }
  }
})

test('a shared story credits the masthead, not the person who built it', (t) => {
  const pages = samples()
  if (!pages.homepage) {
    t.skip('dist not built')
    return
  }
  for (const [kind, path] of Object.entries(pages)) {
    if (!path) continue
    const html = readFileSync(path, 'utf8')
    assert.equal(
      tw(html, 'twitter:site'),
      `@${SHARE.X_HANDLE}`,
      `${kind} does not name the masthead's account`,
    )
  }
})

test('the row the server renders is the row the island would render', (t) => {
  const pages = samples()
  if (!pages.article) {
    t.skip('dist not built')
    return
  }
  const html = readFileSync(pages.article, 'utf8')
  const row = html.match(/<div class="share"[\s\S]*?<\/div>/)
  assert.ok(row, 'the article page renders no share row')

  const url = row[0].match(/data-url="([^"]+)"/)?.[1]
  const title = row[0].match(/data-title="([^"]+)"/)?.[1]
  assert.ok(url && title, 'the share row carries no target for the island to upgrade')

  // The island rebuilds the row from these props. Whatever it builds has to be
  // what is already on the page — same targets, same order.
  const expected = SHARE.shareLinks({ url, title: title.replace(/&amp;/g, '&') })
  const rendered = [...row[0].matchAll(/class="share-choice" href="([^"]*)"/g)].map((m) =>
    m[1].replace(/&amp;/g, '&'),
  )
  assert.deepEqual(
    rendered,
    expected.map((l) => l.href),
    'the server-rendered share row has drifted from shareLinks()',
  )

  // The one piece of promotion a share carries for free.
  assert.ok(
    rendered.some((href) => href.includes(`via=${SHARE.X_HANDLE}`)),
    'the post intent drops the masthead attribution',
  )
})

test('every hardcoded store and account link names the right thing', () => {
  // The templates spell these out rather than templating them, which is fine
  // until one of them moves — the X account has been renamed once already and
  // the Instagram handle is explicitly a placeholder. This is the check that
  // turns "renamed in five files out of six" into a failing build.
  //
  // Identity, not string equality. Apple publishes the same listing under both
  // `/us/app/zuhd-news/id{N}` and the short `/app/id{N}` — `get.html` uses the
  // short form on purpose, since it appends its own query string — and both
  // resolve to the same app. What must never differ is *which* app, which is
  // the id. Asserting the URL byte-for-byte would fail on a difference that
  // does not matter and teach the next person to delete the test.
  const files = [
    'templates/index.html',
    'templates/article.html',
    'templates/country.html',
    'templates/static-page.html',
    'public/get.html',
    'scripts/build.js',
    'scripts/build/entity-pages.js',
  ].filter((f) => existsSync(join(ROOT, f)))

  let seen = 0
  for (const f of files) {
    const src = readFileSync(join(ROOT, f), 'utf8')

    for (const found of src.match(/https:\/\/apps\.apple\.com\/[^"'\s)]+/g) || []) {
      seen++
      const id = found.match(/id(\d+)/)?.[1]
      assert.equal(id, SHARE.APP_STORE_ID, `${f} links ${found}, which is not our app`)
    }
    for (const found of src.match(/app-id=(\d+)/g) || []) {
      seen++
      assert.equal(found, `app-id=${SHARE.APP_STORE_ID}`, `${f} names the wrong App Store id`)
    }
    for (const found of src.match(/play\.google\.com\/store\/apps\/details\?id=([^"'\s)&]+)/g) || []) {
      seen++
      const pkg = found.split('id=')[1]
      assert.equal(pkg, SHARE.ANDROID_PACKAGE, `${f} links package ${pkg}, not ours`)
    }
    for (const found of src.match(/https:\/\/x\.com\/zuhd[^"'\s)]*/g) || []) {
      seen++
      assert.equal(found, SHARE.SOCIAL_X, `${f} points at ${found}, not ${SHARE.SOCIAL_X}`)
    }
    for (const found of src.match(/https:\/\/www\.instagram\.com\/zuhdnews[^"'\s)]*/g) || []) {
      seen++
      assert.equal(found, SHARE.SOCIAL_INSTAGRAM, `${f} points at ${found}, not ${SHARE.SOCIAL_INSTAGRAM}`)
    }
  }
  // A regex that stops matching is a test that passes by finding nothing.
  assert.ok(seen > 10, `only ${seen} store/account links found — the patterns have gone stale`)
})

// ---------------------------------------------------------------------------
// The share route
// ---------------------------------------------------------------------------
//
// A shared link now opens the map with the story's card up (`/s/{slug}`) rather
// than the reader page. That is the one change here that can go wrong invisibly
// in *two* directions at once: the link can stop carrying the story's own OG
// card, so every share arrives in a timeline looking identical; or the article
// can stop being canonical, so a crawler indexes seven hundred variants of the
// map instead of the seven hundred articles.

test('the article page shares the map and stays canonical itself', (t) => {
  const pages = samples()
  if (!pages.article) {
    t.skip('dist not built')
    return
  }
  const html = readFileSync(pages.article, 'utf8')
  const slug = pages.article.split('/').pop().replace(/\.html$/, '')

  const url = html.match(/<div class="share"[\s\S]*?data-url="([^"]+)"/)?.[1]
  assert.equal(url, SHARE.shareUrl(slug), 'the article page does not share the map route')

  // And the page still points search engines at itself. Sharing the map must not
  // cost the article its own identity.
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1]
  assert.equal(canonical, SHARE.articleUrl(slug), 'the article page lost its canonical URL')
  assert.equal(
    meta(html, 'property', 'og:url'),
    SHARE.articleUrl(slug),
    'the article page names something other than itself as its own og:url',
  )
})

test('the share route and _headers state the same security headers', () => {
  // `public/_headers` applies to static assets; a Pages Function's response is
  // not one, so `functions/s/[slug].js` restates every header itself. Two copies
  // of a string whose whole job is to be exact — and the CSP is what keeps this
  // site's `default-src 'none'` claim true, so it is the one most worth pinning.
  const fn = readFileSync(join(ROOT, 'functions/s/[slug].js'), 'utf8')
  const headers = readFileSync(join(ROOT, 'public/_headers'), 'utf8')

  const wildcard = headers.slice(headers.indexOf('\n/*\n'))
  const stated = (name) => {
    const m = wildcard.match(new RegExp(`^\\s*${name}:\\s*(.+)$`, 'm'))
    return m ? m[1].trim() : null
  }
  // The function builds the CSP by concatenating string literals across lines,
  // so compare on collapsed whitespace rather than on the source text.
  const collapse = (s) => s.replace(/\s+/g, ' ').trim()
  const fnLiterals = collapse(
    // Join the concatenated literals back together — either quote style.
    fn.match(/const SECURITY_HEADERS = \{[\s\S]*?\n\}/)[0].replace(/["']\s*\+\s*["']/g, ''),
  )

  for (const name of [
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
    'Permissions-Policy',
    'Content-Security-Policy',
  ]) {
    const value = stated(name)
    assert.ok(value, `_headers no longer states ${name} on /*`)
    assert.ok(
      fnLiterals.includes(collapse(value)),
      `functions/s/[slug].js has drifted from _headers on ${name}:\n  _headers: ${value}`,
    )
  }
})

test('the share URL is the map route and the article URL is not', () => {
  const slug = '2026-07-30-a-story'
  assert.equal(SHARE.shareUrl(slug), `${SHARE.SITE_URL}/s/${slug}`)
  assert.equal(SHARE.articleUrl(slug), `${SHARE.SITE_URL}/a/${slug}`)
  // Absolute, both of them: a share is read somewhere else, and a relative URL
  // in someone else's timeline resolves against their site.
  for (const u of [SHARE.shareUrl(slug), SHARE.articleUrl(slug)]) {
    assert.ok(u.startsWith('https://'), `${u} is not absolute`)
  }
  // No campaign parameters, ever — the site's claim is that it tracks nobody.
  assert.ok(!SHARE.shareUrl(slug).includes('?'), 'the share URL carries a query string')
})
