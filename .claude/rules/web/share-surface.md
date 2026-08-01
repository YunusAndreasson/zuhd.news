---
paths:
  - "shared/share.ts"
  - "functions/**"
  - "templates/**"
  - "public/get.html"
  - "public/_headers"
  - "public/manifest.json"
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

The one part of the surface that cannot be checked by looking at it — a card
with no image renders perfectly in a browser and fails only in a stranger’s
timeline. Invariants are pinned in `scripts/lib/share-surface.test.js`.

## Sharing, discovery, and the app

Everything about how a link to this site behaves somewhere else. It is the one
part of the surface that cannot be checked by looking at it — a card with no
image renders perfectly in a browser and fails only in a stranger's timeline —
so the invariants are pinned in `scripts/lib/share-surface.test.js`.

- **One definition of where this site is**: `shared/share.ts` — store URLs, the App Store id, the Android package, the app's scheme, the masthead's accounts, `ORG_SAME_AS`, and `shareLinks()`. Imported by the SSG through `loadShared()` and by the islands through `@shared/share`. The X account has already been renamed once and the Instagram handle is explicitly a placeholder; a test asserts every hardcoded copy in the templates still agrees with this file.
- **Sharing is a row of real links, upgraded in place.** `build.js` renders it server-side from `shareLinks()` (`.share` → label + x / whatsapp / email), so it works with JavaScript off and survives the bundle failing. `share-bar.ts` then replaces it with `navigator.share` — the operating system's own sheet — where the device has one, and adds "copy link" where a clipboard exists. Two renderings of one row, which is why the targets live in `/shared/` and the test compares them.
- **A shared link opens the map, not the reader page** (2026-07-30). The homepage URL stays `/` no matter which story is open — deliberate, and it makes the address bar the one thing a reader must *not* copy — so sharing has always needed a URL of its own, and that URL used to be `/a/{slug}`. Both halves of the old argument still hold and the conclusion was wrong: this site's front door is the map, and a link that opens a static article shows a stranger the one surface it is not. `shareUrl(slug)` in `shared/share.ts` is now `/s/{slug}`, served by **`functions/s/[slug].js`** — the only dynamic path on the site. It returns the homepage's own HTML with four changes: the `<title>` and the whole `og:*` / `twitter:*` block **lifted verbatim from `/a/{slug}`** with HTMLRewriter, so the article page stays the single source of truth for what a share looks like in a timeline and the generated OG card still arrives with it; `og:url` pointing here; `<link rel="canonical">` pointing at the article, so a crawler indexes seven hundred articles rather than seven hundred variants of the map; and `data-story` on the map shell, which is the same `data-*` prop channel `island-loader.js` already reads. **Not `/?story={slug}`**: a query on `/` puts a Function in front of the homepage for every visitor, and the homepage is the one path here that must stay a static file served straight off the edge. Both share rows send it — the map card and the article page — so a zuhd.news link means one thing wherever it was copied from. The overlay sheets (disaster, chokepoint, conflict, genocide, famine) still get no share row: they are marks on a layer, not documents.
- **The landing waits for two arrivals, and neither waits for the other.** `openSharedStory` needs `/api/map.json` (which is what makes `pointBySlug` mean anything) *and* MapLibre's `load` (which is what creates the popup). They resolve independently, so whichever lands second runs it and the first call returns. Without that second condition the camera flew to the story and **no card ever opened** — `popup?.preview` and `popup?.open` both optional-chaining past a `null` that would exist a few hundred milliseconds later, with nothing thrown and nothing logged. Found by driving the real page, not by a test.
- **A slug the map does not hold leaves for the article.** The map is fourteen days; a link passed around for a fortnight and a day points at a story that is genuinely not on this surface, and landing on the map with nothing open would show a stranger something other than what was shared. `location.replace`, so the back button returns to wherever the link was opened from rather than to a map about to redirect again. **And the range widens to admit the story**: the map opens on 3d, so a Tuesday story would otherwise fly the camera to a card whose beacon is outside the visible slice — the mark missing under its own card. It takes the *narrowest* range that fits rather than always 14d, and tells the chip row, because a row still reading `3d` over a fortnight of beacons is a legend contradicting its own map.
- **The phone's header was never in the map's padding, and a shared link is what exposed it.** `applyPadding`'s phone branch wrote `top: 0`, so `flyTo` centred a story in a box whose top edge sits under the wordmark — and MapLibre draws a story card *upward* from a bottom-anchored marker, so on a phone the card landed across the masthead. Nobody had noticed because tapping a beacon is something you do after the map is already yours; a shared link makes that card the first thing a phone reader ever sees. The header is measured now, the same way the rail is — its actual intersection with the canvas, not `--map-head-h` — and capped at a fifth of the canvas. The card moved from y=33 to y=73 in a 664px viewport. **And `.map-popup-prose` says it scrolls**: it always did, at `max-height: 30vh`, with a hard edge cutting the last line mid-sentence, which reads as a broken card rather than a full one. A bottom mask fades the final 1.6rem out — the one affordance that costs no height, and the only place this stylesheet paints a gradient over content.
- **The security headers are a seam.** `public/_headers` applies to static assets; a Function's response is not one, so `functions/s/[slug].js` restates all five itself — the CSP above all, which is what keeps the `default-src 'none'` claim true. Two copies of a string whose entire job is to be exact, so `share-surface.test.js` reads both files and fails if they part.
- **No web push, on purpose.** A browser notification subscription is a per-device endpoint held on our server — the same kind of record the app-open beacon was removed for. So "tell me when something breaks" is answered by the app, which already has push (`functions/api/push.js` → Expo). That makes `_app-prompt.ts` a fact about the app rather than a request, and it is bounded: it waits for four opens across the whole site, shows at most three times, and stops for good the moment a reader follows it. All three counters are in the reader's own localStorage.
- **`.app-banner` is gone** (removed since; note kept because it names the failure mode). It was markup in `templates/index.html` hidden by `body.map-page .app-banner { display: none }` from the day the map became the homepage — so it shipped on every homepage load and never rendered, and this file described it as dead for weeks before anything deleted it. The contextual prompt above is what replaced it. The general point stands: a note recording that something is dead is not the same as removing it, which is why `npm run deadcode` exists now (see "Static checking").
- **The Instagram and X cards fit their type; they never cut it** (2026-07-26).
  Both posters render through the 4:5 portrait branch of `ig-image.js`, and it
  used to wrap by counting characters against a constant `0.62em` — a number
  calibrated while resvg was rendering every glyph at the same width, because
  the cards predate the `fontBuffers` → `fontFiles` fix. Source Sans Bold is
  actually ~0.49em over mixed-case English, so the cards wrapped ~20% early,
  hit their max-line ceiling, and truncated: **20.5% of cards had the dek cut
  with an ellipsis**, 1.4% had the lead pre-cut by `igLead` before the card
  even saw it. A rendered card gives no sign of it. `scripts/lib/font-metrics.js`
  parses the TTFs we actually render with (`head`/`hhea`/`hmtx`/`cmap`) and
  measures instead — validated against resvg's own ink to within 1%, and
  always *over*, because every error must fall on the side of "it fits". No
  constant can do this job: `WWW` and `iii` differ by 3× in this family, so one
  factor either overflows the card or shrinks the type. **Kerning is
  deliberately not applied** — GPOS pairs here are mostly negative, so ignoring
  them overestimates, which is the safe direction.
- **Size is fitted, not fixed, and the two blocks are fitted together.** The
  headline was 82/94px and the dek a flat 46px; both are now ramps
  (58–108 / 32–58) and the fitter takes the largest size that fits. Fitting
  them in sequence is what a greedy layout does and it drove the dek to its
  floor on the longest leads while the headline sat at its ceiling — so
  `fitPair` steps the headline down while the dek is under `DEK_COMFORT` (40px)
  and giving it room still helps. Across the corpus the headline now lands at
  108px on 97% of cards and no dek falls below 38px. The column widened a
  little too (`PAD` 72 → 60); the two changes only pay off together. `IG_VERSION`
  must be bumped for any of this — the card cache is keyed on it.
- **`fitText` never truncates, at any size.** If even the floor overflows it
  returns every word and lets the block run tall; the caller decides. That is
  what makes "no ellipsis" a property rather than a hope, and
  `share-card-type.test.js` asserts it over the corpus's hardest 150 cases in
  three aspect ratios, plus that every line fits its column. Note the ruler has
  to be as careful as the thing it measures: the first version of that test
  parsed attributes in order, missed `letter-spacing` because it sits after
  `fill`, and reported fifty overflows that did not exist.
- **Generated share cards**: articles (`/api/og/{slug}.png`), countries (`/api/og/country/{ISO2}.png` — globe centred on the country, three best-ranked metrics), categories (`/api/og/c/{cat}.png`). Country and category pages previously shared the one static `og-image.png`, so passing on Palestine's profile produced a card that said nothing about it.
- **The site's own card is generated too, and was the last page that fix never reached** (2026-07-30). `/og-image.png` is what a bare `zuhd.news` link renders as — plus every static page, `/e/{id}` and `/get` — and it was a hand-made PNG last written on 2026-04-12: **a grey capital Z on near-black**. Wrong three ways. It is not the site's mark (`favicon.svg`, `logo.svg` and the app icon are the three-piece angular Z; that flat capital exists nowhere else); it is not the card family's palette, which is light; and it says nothing about what is behind the link, which is the whole complaint the note at the head of `og-image.js`'s second section already makes about country and category cards. The same argument `shareUrl` makes about `/s/{slug}` applies to the picture as well as the destination — this site's front door is a live map of the world, and a share that shows a letterform shows a stranger the one thing it is not. `buildSiteOgPng` now emits it into `dist/` on every build, over the copied asset, so it cannot drift from the family again; the checked-in PNG is deleted rather than left as a fallback, because a missing card is a visible failure and a wrong one is not.
- **It is evergreen, and that is a constraint rather than a preference.** The URL is permanent and hardcoded in four templates, and a scraper caches a card by URL — so a story count or a date would be frozen at whatever the first scrape happened to see and could never be corrected. Everything on it is a standing fact. For the same reason the meta points at **`?v=2`**: without a token X, Facebook and WhatsApp would go on serving the Z they scraped months ago. Bump it when the card's design changes and never make it a build stamp, or every deploy invalidates every cached card for nothing. `share-surface.test.js` resolves the card URL to a file on disk and strips the query first, since the query is the cache-buster and the path is what has to exist.
- **The globe is centred on Makkah**, which is the frame the site already keeps — the clock, the Hijri date, the currency basket and the first-class exchanges are all read from there — and is also simply the better projection for the coverage, putting Africa, Europe, the Middle East and South Asia on the disc where a `[0, 0]` default spends half of it on the Atlantic. No crosshair: on an article card it marks the story, here there is no single story, and the map does not mark Makkah either. The masthead is the headline, so there is no second wordmark on the baseline.
- **The globe on every card was a ghost, and the dark IG variant was the tell** (2026-07-30). `themeFor`'s light palette put the disc at `#f6f6f6` on a white card and land at `#ececec`: **1.02:1 between disc and page, 1.03:1 between land and sea.** So the only picture on 718 article cards was invisible, and what little read at timeline size was the country *outlines* rather than the continents. `ig-image.js` had already overridden both for its dark variant with a real step (`#1e1e1e` / `#383838`, 1.6:1) and left the light values alone, which is how a value gets fixed in one place and stays broken in the other. Now 1.14:1 and **1.45:1**. `soft` and `land` are the globe and nothing else in either file, so this changes the picture and no hairline, no rule and no type. Country cards use the **largest polygon's centroid**, not `geoCentroid` of the whole feature: averaging the United States with Alaska and Hawaii lands the globe in the Pacific. **No flags on the cards** — resvg is handed the Source Sans buffer and nothing else, so a regional-indicator pair renders as two empty boxes.
- **Meta**: `twitter:site` is the masthead (`@zuhd_news`), `twitter:creator` the maker — only the second was declared, so every shared story credited a personal account. `og:image:alt`/`twitter:image:alt` everywhere; `static-page.html` asked for `summary_large_image` and named no image at all. The Organization carries `sameAs` in both the homepage `@graph` and each article's inline `publisher`, which is what connects the domain to the feeds and the two store listings.
- **No campaign parameters on a shared URL, ever.** The site's claim is that it does not track anyone, and a share link that quietly reports where it came from is exactly the sort of thing that claim then has to keep covering.
- **App Links (`al:*`) are deliberately absent.** They would let Facebook's and Instagram's in-app browsers hand a zuhd.news link to the native app — but the app is a single screen (`mobile/app/index.tsx`) with no per-article route, so the handoff would drop the reader on the app's home screen and lose the story they tapped. Worth adding the day the app has a `/a/{slug}` route.
- `manifest.json` opens on the map, so its `theme_color`/`background_color` are `#080a0d` rather than white; `related_applications` names both stores with `prefer_related_applications: false`, which keeps desktop PWA install available while still letting Chrome surface the native app.
