---
paths:
  - "shared/share.ts"
  - "functions/**"
  - "templates/**"
  - "public/get.html"
  - "public/_headers"
  - "public/manifest.json"
  - "public/.well-known/**"
  - "mobile/app.json"
  - "mobile/app/+native-intent.tsx"
  - "scripts/build/country-pages.js"
  - "scripts/lib/og-image.js"
  - "scripts/lib/ig-image.js"
  - "scripts/lib/site-chrome.js"
  - "scripts/lib/font-metrics.js"
  - "public/islands/_share.ts"
  - "public/islands/share-bar.ts"
  - "public/islands/_app-prompt.ts"
  - "scripts/lib/share-surface.test.js"
  - "scripts/lib/share-card-type.test.js"
---

# Sharing, discovery, and the app

How a link to this site behaves somewhere else. A broken card renders fine in
a browser and fails only in a stranger's timeline, so the invariants are
pinned in `scripts/lib/share-surface.test.js`.

## Links and the share row

- Store URLs, ids, accounts, `shareUrl` and `shareLinks()` live once in
  `shared/share.ts`. Templates and `get.html` hardcode copies the test holds
  to it.
- `shareUrl(slug)` is `/s/{slug}`; `/a/{slug}` stays canonical. **Never**
  `/?story=`: a query on `/` puts a Function in front of the static homepage.
- The row is plain links from `shareRowHtml` (`build.js`), upgraded in place
  by `share-bar.ts`. It must work with JavaScript off.
- **Never** put campaign parameters on a shared URL. `public/get.html`, the
  paid, noindex bridge, is the one page that forwards a query to the stores.
- Overlay cards get no share row: they are marks, not documents.

## `/s/{slug}` and `_headers`

- `functions/s/[slug].js` lifts the title and the `LIFTED` tags from
  `/a/{slug}` and never re-derives them. `og:url` is the share URL; the
  canonical is the article.
- Tags the shell has no slot for are appended in `onEndTag`. The `head`
  element handler fires before its children and doubles every tag silently.
- A Function's response skips `public/_headers`, so `SECURITY_HEADERS`
  restates the `/*` block. Change both together.
- The CSP is `default-src 'none'`: a new `data:`, `blob:` or other-origin
  resource is blocked with only a console error.
- Pages applies every matching `_headers` rule and concatenates same-named
  headers. `/*` carries no `Cache-Control`, and `/api` is listed path by path.
- A slug with no article, or one the map does not hold (`openSharedStory`),
  goes to `/a/{slug}`, never to a map with nothing open.
- **Never** log requests or add a beacon in `functions/**`. This is a decision.

## Cards

- Rasterise with `fontFiles` and the static TTFs, never `fontBuffers`: resvg
  then gives every glyph one width, with no error.
- `ig-image.js` fits type by measuring (`fitPair`, `fitText` in
  `font-metrics.js`) and never truncates. No per-character constant can do
  this, and kerning is left out so every error overestimates
  (`share-card-type.test.js`).
- Scrapers cache a card by URL. `/og-image.png` (`buildSiteOgPng`, written on
  every build) carries standing facts only, and its `?v=` is never a build
  stamp.
- Country cards keep their own `OG_VERSION` in `scripts/build/country-pages.js`
  and centre on `largestPolygonCentroid`; `geoCentroid` puts the United States
  in the Pacific.
- No flags on a card: the fonts resvg is given have no glyph for them.
- `soft` and `land` in `themeFor` are the globe; `ig-image.js` overrides both
  for dark. A fix in one file belongs in the other.
- The site card's globe centres on Makkah, with no crosshair.

## The app

- Only `/a/{slug}` and `/s/{slug}` open the app. A story path is stated four
  times: `public/.well-known/apple-app-site-association`, `assetlinks.json`,
  `mobile/app.json`, and `STORY_PATH` in `mobile/app/+native-intent.tsx`.
- `assetlinks.json` holds Play's app-signing fingerprint. A build signed with
  the upload key alone is not verified.
- The Apple file has no extension, so `_headers` gives it `application/json`;
  without that Pages serves it as a download.
- **No web push.** This is a decision. `_app-prompt.ts` offers the app
  instead, bounded by `PROMPT_AFTER` and `PROMPT_LIMIT`, counted only in the
  reader's `localStorage`.
- `manifest.json` keeps `prefer_related_applications: false`, so desktop can
  still install the PWA.
