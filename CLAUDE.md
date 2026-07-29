# CLAUDE.md

Minimalist typography-first global news site. Philosophy in `foundation.md`.

## Decisions

- Single-family sans-serif typography, no images unless informational
- Smart Brevity format: lead, why it matters, details, what's next, sources
- English first, global hard news only
- Categories: politics, economy, science, tech
- No CMS, no database, no framework — content is files + a node SSG (`scripts/build.js`)
- Content: markdown + YAML frontmatter in `content/articles/`, built to `dist/`

## Web surface

- Homepage (`/`): the situational map — a labelled MapLibre GL basemap carrying every geo-located story from the last 14 days, with decay-weighted beacons, heat-ramped clusters, a day/night terminator, a timeline scrubber, an event rail, and the GDACS / chokepoint / conflict layers. See "Situational map" below. The list+reader split-pane it replaced (and `public/reader.js`) was removed 2026-07-24.
- Article pages (`/a/{slug}.html` → served extensionless): standalone reader with prev/next, per-article OG meta, inline country-tag links, the isnad and any corrections (see "Isnad and corrections" below). The `spacefield` starfield behind these (and country pages) is **dark-mode only, via a media query** — it was `opacity: light-dark(0, 0.85)`, which is invalid (`light-dark()` is a colour function), so the declaration was dropped, the near-black canvas painted at full strength over the white page on every light-mode device, and the `#000` headline vanished. The island stops its rAF loop entirely when the field is invisible.
- Category pages (`/c/{politics|economy|science|tech}`): chronological list per category
- Country pages (`/country/{ISO2}`): flag, region, meta line, 26-metric tabular block with percentile strips and rankings, recent coverage list
- Entity pages (`/e/{id}`): indicator hero value + inline SVG sparkline + articles that reference the indicator via frontmatter `entities[]`
- OG images (`/api/og/{slug}.png`, `/api/og/country/{ISO2}.png`, `/api/og/c/{cat}.png`): typography + monochrome orthographic map inset, generated build-time via `scripts/lib/og-image.js`. See "Sharing, discovery, and the app".
- Static pages: `/about`, `/contact`, `/sources`, `/privacy`, `/support`, `/mcp`. On the map (and every other page) the footer links open these **over** the page via the `doc-sheet` island reading `/api/doc/{page}.json`, pushing the canonical URL into history so the address bar, back button and reload all behave — leaving the map to read two paragraphs throws away the view the reader built. The standalone page stays canonical for shared links, crawlers, modified clicks and no-JS, and `.doc-page` renders it on the map's own surface rather than the old light template.
- Feeds: `/feed.xml` (Atom), `/sitemap.xml`
- JSON APIs consumed by mobile: `/api/articles.json`, `/api/feed.json`, `/api/feed-lite.json`, `/api/heatmap.json`, `/api/context/{id}.json`, `/api/chokepoints.json`, `/api/gdacs.json`, `/api/conflict.json`, `/api/trends.json`, `/api/meta.json`, `/api/articles/{category}.json`. **These shapes are a published contract — the app is live in both stores. Add endpoints rather than changing them.**
  - `feed.json` is the full payload — it carries the ~3,200-entry `contexts`
    index and per-article `threadSummary`, and is read by `workers/mcp` and the
    dashboard. `feed-lite.json` is the same articles without either (~15 KB
    gzipped vs ~180 KB) and is what the mobile app fetches. Both are derived
    from one `apiCategories` object in `build.js`, so the article shape cannot
    drift; add a field there, not in one endpoint.
- JSON APIs consumed by the web map: `/api/map.json` (14-day point set), `/api/map-leads.json` (lead sentences, idle-fetched), `/api/story/{slug}.json` (per-story reading card), `/api/gdacs.json`, `/api/conflict.json`, `/api/genocide.json` and `/api/markets.json` (overlay layers), plus `/basemap/*.geojson` (countries at two detail tiers, country labels, places) and `/basemap/fonts/` (SDF glyphs)

## Situational map (homepage)

- Island: `public/islands/situation-map.ts` + helpers in `public/islands/_map/` (`style`, `feed`, `timeline`, `sheet`, `popup`, `solar`, `types`) and the shared chart in `public/islands/_chart.ts`. Imperative and framework-free — it stays off the Preact runtime the sheet islands use.
- **MapLibre GL renders the basemap**, from GeoJSON and SDF glyphs served from our own origin (`scripts/build/basemap.js` → `/basemap/`). No tile provider, no API key, no third-party request: the CSP stays `default-src 'none'` apart from the blob: worker MapLibre spawns. **The basemap is Natural Earth 1:50m, fetched once** (~1.6 MB, 547 KB gzipped), with 1:10m still behind `ULTRA_ZOOM` 5.5 for close work. **The swap must fetch the file and hand `setData` a parsed object**: MapLibre 6 dropped the URL form of `GeoJSONSource.setData`, and passing a string throws nothing, fires no `error` and makes no request — the upper tier was built, deployed and never once fetched.
- **There is no 1:110m placeholder tier any more** (2026-07-25). It used to be the first-paint basemap with 1:50m swapped in past zoom 3.2 — but the map opens at world fit, around zoom 1.3, so the default view (the only one most readers ever see) was 110m and stayed there. 110m is not a rounded 50m: its generalisation deletes real geography — fjords, inlets, whole island groups — and the moment the border line became visible enough to read, coarseness was what it drew. Two fetches to reach the same place was the worse deal, so the placeholder is gone. The cost is one-off: `/basemap/*` is `max-age=86400, stale-while-revalidate=604800` and every URL carries the build's content hash, so it refetches only when the basemap changes. `.map-loading` ("Drawing the world…") covers the gap, because an empty dark canvas reads as breakage rather than as loading.
- **Country labels are gated on area, not just collision.** 50m carries 240 countries against 110m's 176, and the newcomers are mostly specks — unfiltered, the world view acquired PITCAIRN IS., NORFOLK ISLAND, NAURU and BERMUDA scattered across an empty Pacific, each as loud as BRAZIL, with nothing nearby for collision resolution to suppress them against. The `country-labels` filter steps the minimum `area` by zoom, starting at 0.00008 sr — where the old 176-country set ended — so the world view keeps its previous density and small states arrive as the camera earns them.
- **Day/night is carried by the *lit* side over water** (2026-07-25). `night-shade` is black at 0.28, and the ocean is `#080a0d` — luminance 0.003 — so darkening it moves the colour by about two values in 255. The terminator was therefore invisible at sea: it read across the continents and stopped dead at the coastline, which made day and night look like a property of land rather than of the planet. There is no room to darken below near-black, so `dayPolygon` (`_map/solar.ts`, the same terminator ring closed over the opposite pole) feeds a `day-shade` fill inserted **before `land`** — the land layer paints over it, so it only ever reaches the water, and `--map-ground` and the CSS seam that depends on it are untouched. Which pole each hemisphere closes over is the whole correctness of it and fails silently if reversed, so a test pins it; note that at an equinox the terminator runs pole to pole and `terminatorLat` clamps to ±89.9, so the cap can only be identified by the closing vertex at *exactly* ±90.
- **`scheduleMetric` waits on the source.** One `once('idle')` was enough against a 210 KB / 176-feature source; against 1.6 MB and 99k points parsed on a worker, a missed window leaves the world unshaded and *fully hatched*, which reads as "no data anywhere" rather than "still loading". It counted thirty idles for a while, which is the same race with a counter in front of it — see the 2026-07-26 note below.
- **MapLibre is not bundled into the island.** `scripts/build/islands.js` resolves the bare specifier to the copied vendor file, because the worker MapLibre spawns imports `maplibre-gl-shared.mjs` as a sibling regardless — inlining it shipped that chunk twice. The three `.mjs` files are copied verbatim, `modulepreload`ed from `templates/index.html`, and cached apart from the content cycle by the `/islands/*.mjs` rule in `_headers`.
- Stories are the only layer rebuilt as the scrubber moves: their decay alpha is per-feature and the cluster counts must reflect the filtered set. GDACS and conflict carry an event time and move by **`setFilter`**; layer toggles are **visibility**. Neither re-serialises GeoJSON per frame. Refreshes coalesce onto a rAF.
- Hover is **`promoteId` + `setFeatureState`**, read by a `['feature-state','hover']` paint expression — not a `setPaintProperty` rewrite per pointer move.
- Clusters aggregate via **`clusterProperties`**: category counters, max coverage rank, max recency, contested flag. A cluster is a **dark disc with a hairline rim**: the rim colour is the dominant category, its weight and the disc's radius grow with the count, and the count itself is set in light type. Nothing else.
- **The glow is gone (2026-07-25).** Clusters used to stack four encodings of the same number on one coordinate — a cold→hot gold fill ramp, three blurred falloff rings, and a `heatmap` kernel-density layer beneath — on top of a numeral that already stated the count exactly. Over London, New York and Islamabad it read as a gold blob rather than a map. Removing `CLUSTER_HEAT`, `CLUSTER_RINGS`, `story-heat` and the light→dark label flip leaves colour meaning only category, which is the one thing the numeral cannot say. Don't reintroduce a density field without a reason the count doesn't already cover.
- **The cluster domain is still rescaled to the visible set** (`heatStops` / `applyClusterScale`), not fixed — it now drives radius, rim weight and label size rather than colour. Calibrated against the 14-day corpus it tops out near 220, which would leave the default 24h view — a few dozen stories, no cluster above single digits — flat at the bottom of every curve. Stops are forced strictly ascending; `interpolate` rejects a repeated input, which is what a naive rescale produces once the domain gets small.
- **The map opens on 24h**, not the full fortnight — the widest range is the one view where nothing stands out. The scrubber still spans all 14 days.
- **Getting back out**: a "whole world" control appears bottom-right once the view leaves home and hides when it returns; Escape resets the view when no card is open; the wordmark does the same. The URL never changes for any of it.
- **Refresh checks for new stories without discarding the view** (2026-07-26). At the head of the rail, beside the count. The map is a view the reader builds — a camera, a time slice, a set of categories, maybe an open card — and reloading to see whether anything broke throws all of it away. It refetches `/api/map.json` with **`cache: 'no-cache'`**, which is load-bearing: that endpoint is served `max-age=300`, so a plain fetch inside five minutes is answered from the browser's own cache and the button could never find anything. `no-cache` forces the conditional request and the endpoint does serve a **304 with an empty body**, so a check that finds nothing costs one round trip and no payload. Not `no-store`, which refetches every time. The initial load deliberately does *not* revalidate — that would defeat the `<link rel=preload>` and the stale-while-revalidate. `/api/map-leads.json` (85 KB) is refetched **only when something actually arrived**.
- **It never moves the reader.** At the live edge the scrub head follows the new end of the window; scrubbed back to Tuesday, they stay on Tuesday and the new stories are simply there when they come forward. When the window moves the whole scrubber is rebuilt (every tick, day label and histogram bucket derives from a fixed span) with the held position restored and clamped into the new rail. **`timeline.isLive()` is asked, never cached** — the island kept its own flag written from the scrubber's `onChange`, which fires on a gesture and nothing else, so before the reader had touched the scrubber the flag was an assumption; refresh read it as "scrubbed away", declined to follow, and left the new stories outside the visible slice while the button reported "+1 new". Found by driving the real map; pinned in `map-feed.test.js`.
- **The control says what it found, including nothing.** "nothing new" is the answer most presses deserve and the one a spinner alone never gives — without it a refresh that found nothing looks identical to one that failed. It is a glyph *and* a word: an unlabelled circular arrow reads as "reset" about as readily as "reload", and those would do opposite things to the view. The rail head is a `<div>` holding the disclosure and the refresh as siblings — a `<button>` inside a `<button>` is invalid and browsers drop the inner one, which would have left refresh unclickable on the phone layout, the one place the handle is a button at all.
- **Read stories grey out, and the record never leaves the device** (`_map/read-state.ts`). A story counts as read when its card opens — the reader committing to it, which is the only signal on this surface that means anything. It is one `localStorage` key holding slugs and nothing else: no timestamps, no counts, nothing that would make it a behavioural record rather than a list of what has been seen. The app-open beacon was removed in July for being a per-device record *on our server*; a read list is a far more revealing one, and the only basis on which this site can hold it is that we cannot see it. If a change ever makes it legible to the server, delete it instead. No cross-device sync, for the same reason. Capped at 600 slugs, oldest dropped — a slug aged out of the 14-day window can never be shown again.
- **Greyed in two channels, and said in words.** The ink steps down — an ink *step*, never `opacity`, which is the trick that put a filter chip at 2.33:1 and slipped past `colour-system.test.js` because opacity is not a colour literal — and the dot goes from a disc to a ring, so the state survives a reader who cannot separate two greys, in the vocabulary the map already uses (filled means live, hollow means not). The category reaches the dot as an inline `--cat`, the same way HUD chips take their layer's colour, so the stylesheet can hollow it without naming a hue. A `.sr-only` "(read)" carries it to anyone listening. **Greyed, never hidden or reordered**: the rail captions the map, and dropping a story the reader has seen would leave a beacon with no row to match it.
- Interaction: **hover never moves the camera.** Hovering a story previews it; committing is a click, from the beacon or the rail. The old 320ms dwell-to-fly dragged readers somewhere they hadn't asked to go whenever the pointer crossed a dense area, and clusters lost their hover-expansion for the same reason. Hovering a disaster/strait/conflict mark opens the sheet in its non-modal **peek** mode and a click pins it. The wordmark resets the view instead of reloading the homepage (the `href` stays, so modified clicks and a JS-less browser still navigate).
- **Peek and pinned are two densities, not one card shown twice.** Peek answers the single question a resting pointer is asking — how bad, how far off normal, how many dead — and stops; pinned carries prose, provenance, the series behind the number and related coverage. Peek must stay short: `.map-sheet.is-peek` caps at 55vh and clips rather than scrolls.
- **One Earth.** `renderWorldCopies` is off and the opening zoom is derived (`worldFitZoom` → `log2(width / 512)`), so a single world fills the canvas instead of repeating. `worldFitZoom` is also the map's `minZoom`, re-applied on resize — a world narrower than its canvas is not letterboxed by MapLibre, it is *duplicated*, and the old 2.4 ceiling put the world at 2702px, so any wider viewport got a second Australia at the right-hand edge. Coverage wins over framing. `onResize` must call `map.resize()` too: `applyPadding` and `worldFitZoom` only *read* dimensions, so without it the canvas kept its build-time size and the map drew into a corner of its own frame. `applyPadding` measures the rail's *actual* intersection with the canvas — they're separate grid columns and haven't overlapped since the layout became a grid, so the old unconditional rail-width inset pushed the map sideways and clipped a continent.
- Beacon size is a **percentile rank over the window's coverage figures, computed in `build.js`** — raw `eventCoverage` is absent on ~65% of articles and holds occasional nonsense (values in the tens of thousands), so a log curve left most of the corpus at the minimum radius and a handful of bad rows saturated. Stories with no figure get a fixed neutral size, which says "unknown" rather than "smallest".
- Decay half-life is **72h** (`_map/types.ts`), sized to this map's 14-day window. The 18h curve borrowed from mobile's 72-hour globe put 85% of the corpus at the alpha floor and collapsed recency to "today or not".
- **Water is on the map** (2026-07-28): lakes, rivers and marine labels, from three files that had sat unused in `shared/data/` since the start while mobile read all three. Sizes decide the treatment. **Seas are 54 label points, 1 KB gzipped** — the cheapest thing in that directory by two orders of magnitude — and they load with the style, because the eleven chokepoints (Hormuz, Bab el-Mandeb, Suez, Malacca, Bosporus, Gibraltar, Kerch) all sat in water the basemap left as anonymous black. Being labels they add no line family to a map that has already had to ration lines.
- **Lakes and rivers are idle-deferred, because GeoJSON is not TopoJSON.** 52 KB and 54 KB of source become **104 KB and 101 KB on the wire** — shared arcs get expanded — so together they are 205 KB against the coastline's 546 KB, a **37% heavier first paint** for detail nobody opens this map to see. Simplification does not recover it: lakes start to show it before the saving is material and rivers barely respond at all, their vertices already being sparse. So the fix is *when*, not how much — `loadWater` in `situation-map.ts`, one request for both, the same treatment the conflict feed and the lead sentences get. The sources are declared empty in the style and filled by `setData` with a **parsed object**, since MapLibre 6 dropped the URL form and a string makes no request and throws nothing.
- **There is no colour that works flat for a river, and that is why `water` is its own token.** `ocean` is the obvious choice — a river is the same substance as the sea — and it measures **1.04:1 against `LAND_NO_DATA`** and 1.21:1 on the ramp's darkest stop, so it would be absent across the thirty hatched countries and most of the dark half of every metric. Any mid-tone that survives that collides with one of the ramp's own five stops; the best flat candidate a search could find still measured **1.10:1 against `border`**, which is a river indistinguishable from a frontier. Hue cannot break the tie either — `border` and `prayer` are **both at 216°**, because blue-grey is already this map's furniture family. So the separation is saturation: `#4a7fae` at 40% against `border`'s 10%, the same argument and the same 20-point floor the genocide tone uses against conflict, holding a 1.92:1 minimum across all six tones the land can be painted. Rivers, lake rims and the marine labels all take it, so everything about water is one family.
- **Lakes fill in `ocean` and sit above the land, under the borders.** Above the land because a lake is water carved out of it, and the map's strongest ground rule is that the darkest thing is water; under the borders because a frontier down the middle of the Great Lakes, Victoria, Chad or the Caspian is a fact about the lake and has to stay drawn. The fill alone is not enough at 1.04:1 on a hatched country, so the rim in `water` is what guarantees it reads — and it is the same thread the rivers are drawn in, so a river running into a lake continues as its edge. Lakes take the night wash but not the day lift, since `day-shade` is inserted before `land` to keep it off the ground.
- **Both layers are gated on significance, and the first guesses were wrong in both directions.** Lakes step on `area` like `country-labels`: the world gate is **0.0002 sr, which is 21 lakes** — Superior down to Turkana, the set a reader would name. It was 0.00004 first, which admitted **110** and speckled Fennoscandia and the Canadian Shield with reservoirs and IJsselmeer at sizes well under a pixel. Rivers step on Natural Earth's `scalerank`: 27 at world, all 255 by z6. Ungated the world view is a net of hairlines over every continent — the cluster-glow mistake in another medium. Width is constant per zoom rather than per rank, because a river is not a quantity.
- **`sea-labels` is the last layer in the base style, and that is load-bearing.** MapLibre walks symbol layers top-down and the *later* layer claims its collision boxes first, so under `country-labels` this was the lowest-priority symbol layer on the map: it drew only where nothing else wanted the space — Labrador Sea, Sea of Okhotsk, Philippine Sea, all empty ocean — while the Mediterranean, Red Sea, Arabian Sea and Caribbean went unnamed. Those are exactly the waters the layer was added for, crowded precisely because that is where the news is. Last, it claims before the country and city names, which is the right way round rather than merely the effective one: a sea label is placed at the centroid of open water, so where it competes with a land label at all, it is the land label that has drifted out to sea. It still loses to everything `addDataLayers` adds — the stories are the subject, the basemap is the ground.
- **It has no `minzoom`, and that is the point.** `worldFitZoom` is `log2(width / 512)` and is also the map's floor, so the default view sits at **1.11 on a 1104px canvas and −0.39 on a phone**. A `minzoom` of 1.4 — which this had — hid the marine labels at the one view every reader starts from. Density is the rank filter's job, never a zoom floor's.
- **Persian Gulf and Sea of Japan keep Natural Earth's names, and that is a decision.** Both are live disputes (against Arabian Gulf and East Sea) and both are the UN and IHO terms, where each alternative is one party's claim — the same reasoning that keeps Western Sahara as it is, and a different case from Palestine, where the site follows a UN determination rather than departing from one. `map-geo.test.js` pins both in **both directions**, so neither the name nor a well-meaning rename can land silently. `Bahía de Campeche` is likewise left in Spanish.
- **Every file the basemap is built from belongs in `BASEMAP_V`.** The three new sources were added to that hash the same day they were added to the build: `/basemap/*` is `max-age=86400`, so a layer left out of the hash is a layer that goes stale for a day with no way for a reader to force it — which is exactly how the map went on printing "Tel Aviv" after the build had started emitting "Yafa".
- **Cartography of historic Palestine**: `scripts/build/basemap.js` merges the Natural Earth "Israel" and "Palestine" geometries with topojson `merge()` — a topological union, so the shared arc is dissolved rather than stroked twice — and labels the result Palestine (ISO2 `PS`, so a click opens that profile). Place labels run through the same `displayLocation` table the articles use, so the basemap prints Yafa and Al-Quds rather than contradicting the story drawn on top of it.
- **Territories carry the name of the people whose land they are** (`shared/place-names.ts`, so the map, the country pages and the app can't disagree): Malvinas, Kanaky and Kalaallit Nunaat, stated outright rather than parenthetically — the same house style as Palestine and Yafa. Western Sahara stays as it is: that *is* the UN's term for a Non-Self-Governing Territory, and the alternative is Morocco's "Southern Provinces". Puerto Rico stays too — the test is what the people concerned call it, and renaming it to Borikén on their behalf would fail that test. `scripts/lib/map-geo.test.js` pins all of this against the built labels, because `displayCountryName` is easy to bypass by reading `properties.name` straight off Natural Earth.
- Sources that disagree sharply about a story (`sentimentDivergence` ≥ 0.35) get a contested ring; chokepoints size on the signed magnitude of `delta7vs90`, not a binary threshold.
- Conflict recency anchors on the **dataset's newest event**, not `Date.now()` — UCDP publishes months in arrears, and decaying against wall-clock renders the whole layer at the opacity floor. Its 260 KB payload and the lead sentences are both `requestIdleCallback`-deferred.
- **Genocide is its own layer, above every other** (2026-07-25). Situations a named UN body has *determined* to be genocide, drawn as a heavy bone-white ring with a solid core and the place name always set beside it — added last so nothing can cover it, and `-allow-overlap` throughout because a mark suppressed for collision reads as an absence. It carries **conflict's hue at the saturation conflict deliberately lacks** (`#f5372b` against `#c05252`) — same subject, far end of it, so a reader who has learned that red means people being killed does not need a second vocabulary. A test asserts the tone is unique, red, and at least 20 saturation points clear of every other overlay. It has **no time filter** — a determination is a condition, not an event, so the scrubber must not hide it — and **no toggle**, unlike the three feed layers. It is **named at the end of the filter row, past its own separator, not in `.map-key`** (2026-07-26): that group's `aria-label` is "What the beacons mean" and its other three items decode a channel a story beacon spends ink on (radius, alpha, the contested ring), which genocide is not — at the head of it the gravest mark on the map read as a fifth way of encoding a beacon. The move also puts it beside `conflict`, which is the whole point of its colour: same hue, far end of the saturation, a relationship only legible with the two chips adjacent. It stays a `<span>` among four `<button>`s, and the separator is what says the controls end there. The record is `shared/genocide.ts`; the card leads with the body that made the finding rather than a casualty figure, because the first question about such a mark is who is saying it.
- **Markets are 30 exchange marks, and the set is the point** (2026-07-25). One mark per stock exchange at its city: the sign of the day's move picks the colour, the size of the move drives radius and stroke weight, and a fill appears only while the exchange is actually trading — so an open market is a disc and a closed one a ring, the vocabulary the map already uses. Under 0.15% the mark stays neutral rather than claiming a direction it hasn't got. The colours are **`--map-pos`/`--map-neg`, not new ones** — the site already had a pair meaning "a signed change", and a seam test pins them to `OVERLAY_COLOUR.marketUp`/`.marketDown` because the marker is painted by MapLibre and its sparkline by CSS. `_map/chart.ts` grew a `palette: 'signed'` switch for exactly that: a falling index drawn in chokepoint gold would borrow a meaning it does not have.
- **Shape says what, colour says which way** (2026-07-26). Every mark on this map was a circle, and `market-marks` and `chokepoint-marks` had drifted into *byte-identical* paint expressions — same radius domain, same stroke domain, same neutral. Hue could not rescue it either: `economy` `#d0a24a` and `straits` `#c9a84c` are three points apart and `politics`/`conflict`/`gdacs` are one red family. So colour was spending itself on identity and failing, with nothing left over for value. Now the silhouette carries the layer — hazard triangle, strait channel, conflict square, market tick — and colour is free to mean direction again. The alphabet is `_map/glyphs.ts`: shapes authored as vertex tables in a 16-unit box, rasterised to **real signed-distance fields** and handed to `map.addImage(..., {sdf: true})`. It has to be a true distance field, not an alpha mask: MapLibre's shader cuts at `alpha = 0.75` and reads halos outward from it, so a mask renders convincingly and then aliases under scale and silently ignores `icon-halo-width`. Font glyphs were the obvious alternative and are not available — Geometric Shapes is range `9472-9727` and `public/basemap/fonts/` ships four ranges, none of them that one, with no generator in the repo.
- **The chips are the legend, so they draw from the same table** (2026-07-26). `_map/glyphs.ts` also emits SVG, and the filter chips render it, so a chip cannot disagree with the mark it names. Before this they were all a 6px disc: `disasters` and `straits` were the same ring, and `markets` was a *grey* ring on the reasoning that the layer is olive and terracotta in equal measure so neither stands for it — true, and the conclusion does not follow. It shows both now, which is the one thing that chip could say that the reader had no other way to learn.
- **Off is an ink step, never opacity** (2026-07-26). An unlit filter chip was `--map-ink-muted` at `opacity: 0.5`, which composites to #484d56 on the ocean: **2.33:1**, under AA, on the label naming what the map is showing. `colour-system.test.js` could not see it because opacity is not a colour literal — which is why it survived. The same trick was dimming the scrubber head and the footer links.
- **Numerals, bounded** (2026-07-26). This file used to say markets carry **no labels**, because thirty numerals would be the cluster-glow mistake set in type. The cluster glow was wrong for a specific reason — it re-encoded a number the numeral already stated exactly — and a percentage on an unlabelled dot is the opposite case: the one fact the mark cannot state. So the tick prints its move above |1.5%| at world zoom and |0.75%| past z3.5, which on a normal day names about six exchanges. Magnitude only, since the tick is the sign, and the `%` is load-bearing: without it a `1.3` beside a beacon is the same object as the `13` inside a cluster. The threshold lives in a `case` **inside `text-field`**, never as a layer `filter` — a filter would delete the tick along with the number.
- **The exchange marks draw above the stories** (2026-07-26). Exchanges sit in exactly the cities that generate the most stories, so a cluster over New York or London is not an occasional overlap, it is where every large exchange is. The damage is asymmetric: a cluster is a *count* and survives a 7px tick crossing its rim; an exchange is a single mark and, covered, is simply absent. `story-cluster-count` also had `text-ignore-placement: true`, keeping it out of the collision index entirely, so a market numeral could land flush against it and render "31.6%" out of two true numbers. It is `false` now — `allow-overlap` still guarantees the count is never dropped; it just also occupies space others route around.
- **The money ribbon** (2026-07-26). Under the exchange tally in the scrubber head: currencies, metals and crypto, each a tick, a code and a signed figure, read from `/api/trends.json` (12 KB gzipped, idle-deferred) — data the build already published and nothing read. Currencies lead with the ummah basket for the same reason the exchange catalog does. **FX is quoted `X / USD`, so the number rises as the currency falls**, and the ribbon inverts it; the card inverts the *series* too, or the chart would climb away under a red percentage. Codes are unreadable to most people, so each quote carries its flag and opens a card with the full name, the quarter of closes and the source. Copper is in the payload and deliberately absent from the ribbon: it is monthly, and a monthly change in a row of daily ones reads as today's.
- **`scheduleMetric` waits for the source, not for frames** (2026-07-26). It counted thirty `idle` events, which is a wall-clock race wearing a counter's clothes — on a slow machine, or once the overlays became symbol layers and each frame ran a placement pass, thirty idles elapse inside the first second while the worker is still parsing 99k points. The retries then stop and the world stays unshaded and *fully hatched*, which is the exact failure the bound was added to prevent. It listens to `sourcedata` now, which is safe because `applyMetric` sets `metricApplied` *before* it writes any state, so the re-entrant call returns on its first line.
- **Which exchanges is an editorial claim, and the gaps are recorded** (`scripts/lib/market-metadata.js`). Riyadh, Istanbul, Dubai, Kuala Lumpur and Jakarta are first-class, not an appendix — a markets layer that ships NYSE/London/Frankfurt/Tokyo and stops is a Western markets map. But **the free data commons does not cover the ummah**: Doha, Abu Dhabi, Kuwait, Bahrain, Muscat, Karachi, Dhaka, Casablanca, Tunis, Amman, Lagos and Cairo have no usable daily series on Yahoo, every candidate symbol having been probed. They stay in the catalog with `available: false` and a reason each — the treatment `shared/genocide.ts` gives its `risk` entries — so the gap is revisited rather than quietly becoming a fact about our coverage. **Trading days are per-exchange** (`days`, `Date.getDay()` convention): Riyadh and Yafa run Sunday–Thursday while Dubai moved to Monday–Friday in 2022, and a test pins it, because a Gulf-wide rule is wrong about half the Gulf. **Eid is now modelled and nothing else is** (2026-07-26) — see "The Hijri calendar" below; a Christmas or national-day closure still reads as "trading", which mis-states the *state* only, never the number, since the card prints the close's actual date.
- **Yahoo answers an unknown symbol with a different instrument, not a 404.** `^PSI` returns a PIMCO fund, `^NGX` the Nasdaq Next Generation 100, `^MSI` a USD figure that is not Muscat — each with a plausible level, a currency and a zone. So every catalog entry pins the currency and IANA zone its symbol is *known* to report and `instrumentMismatch()` discards a response that disagrees; those three happen to be caught upstream by the ≥5-closes rule in `trends-sources/stocks.js`, so the guard exists for the case that rule cannot see — an impostor with a full, healthy series. Also: **`chartPreviousClose` is the close before the *window*, not yesterday**, so the day's change comes from the last two closes; reaching for it against a 3-month range reports the quarter's move as the day's.
- **The phone layout is a different bargain, not a smaller one** (`@media (max-width: 900px)`). The map takes the whole canvas; the time range keeps a row; the category chips, layer toggles, beacon key and ground legend fold behind a "layers" disclosure (`.map-hud-more` is `display: contents` on desktop, so one DOM serves both); the story rail becomes a drawer whose header is its handle, with the document links inside it. The beacon key, hidden on phones for years for want of room, is back in the panel. Three coupled numbers — `--map-head-h`, `--map-bar-h`, `--map-gutter` — live on `body.map-page` so the fixed header, HUD, scrubber and drawer cannot drift apart.
- **`worldFitZoom` fits the larger side, and the floor is desktop-only.** With `renderWorldCopies` off MapLibre refuses any zoom at which the world fails to cover the canvas in *either* axis, so the real floor on a portrait phone is the height. The old `max(1.35, …)` was three zoom levels above a phone's fit, and since that value is also `minZoom` the whole world was unreachable: the map opened mid-Sahara and had no gesture out. `homeCenterLat` mirrors `homeCenterLng` for the same reason — at the fit zoom MapLibre pins the centre to the equator, so comparing against the home latitude of 22° left "whole world" lit before the reader had moved.
- **`Popup.addTo` fires `close` on its way in, and that must not read as a dismissal.** MapLibre's `addTo` begins `if (this._map) this.remove()`, and `remove()` fires `close` synchronously — so every re-render of an already-open card announced itself as the reader closing it. Since the `close` handler clears `pending`, and `open()` re-checks `pending` after awaiting the story, the check failed every time and the function returned before `setDOMContent`: **the story card never rendered a story**. It opened, said "Loading…", fetched the article successfully, and threw it away — no exception, no failed request, nothing in the console. `attach()` sets a `reattaching` flag around `addTo` so the handler can tell our own close from the reader's; every attach goes through it. **Better still is not to re-add at all**: an already-open popup needs nothing from `addTo` — `setDOMContent` has already run `_update` and moved focus — and what `addTo` adds is a remove-and-recreate that tears the card out of the document and puts it back a frame later, cancelling any animation running on it. `attach()` is a no-op while the card is up; the flag stays for the case that still re-attaches, a card the reader closed between the preview and the story.
- **The card opens once, at one width, and grows rather than jumps** (2026-07-28). Committing to a story used to walk the card through three geometries — measured on a 1440x900 desktop, `349x202` → `509x103` → `509x336`. It got 46% wider, **collapsed to half its height**, then more than tripled; the top edge fell 105px and shot back up 233px. Three causes. The **story fetch only started at `moveend`**, so an article shell holding one line sat between the preview and the story — and that shell is *shorter* than the preview it replaced, which is where the shrink came from; it is prefetched in `preview()` now, and since the flight is 1150ms against one small same-origin JSON that state no longer renders. The **preview and the article were sized apart** (20rem against 30rem) — they are one card at two densities and now share a width rule, so only height moves, which is the one dimension the content genuinely decides. And the remaining growth is **animated** (`growTo`, 220ms): `setDOMContent` applied it in a single frame while `_update` re-ran its anchor arithmetic against the new `offsetHeight`, so the card resized and repositioned together. The animation starts *after* the position is final, which is what makes it work rather than fight MapLibre — MapLibre's transforms are percentage-based (`translate(-50%,-100%)` for a bottom anchor), so a shorter box means a lower top edge and the card unfurls upward from its tip. Gated on `prefers-reduced-motion`, which also removes the flight, so those readers get the article in one step with no preview to replace.
- **Never write `setPadding` mid-flight.** `Map.setPadding` is `jumpTo` underneath and `jumpTo` calls `stop()`, so a padding write cancels the camera animation in progress. The drawer finishing its slide 200ms into a `flyTo` silently killed the flight and left the story's card open over a world view. Padding writes are skipped while `flying` and re-applied on landing (`writePadding`), redundant writes are dropped, and the drawer snaps shut rather than sliding when a selection is about to fly (`setExpanded(open, instant)`).
- `applyPadding` reads which edge the rail actually takes: a rail narrower than the canvas is a column beside it (desktop, left inset), one spanning its full width is a bar across its foot (phone, bottom inset, unioned with the scrubber).
- **The land ramp has to be perceptible, not merely ordered** (2026-07-25). Shading the land by a metric only works if a reader can tell the quartiles apart, and the original ramp could not: adjacent stops measured **1.04:1** and the whole scale, worst country to best, measured **1.22:1**. Press freedom and urbanisation produced the same picture, so the picker felt broken. The cause was a self-imposed cap — the ramp was held under `border` (`#2b313b`) so frontiers would survive it — which was buying nothing, because that border measured 1.06:1 against the land and had already vanished. The fix moves the border up (`#5c6470`, now 3.3:1 against the ocean, so it draws coastlines properly) instead of holding the ramp down; the ramp spans **2.01:1** with every step at 1.15:1 or better, and saturation tapers with lightness so the top stop doesn't drift chromatic. `LAND_NO_DATA` sits near the ocean and is safe there *because* the border outlines every country — an unshaded country reads as an empty outline, not as sea. The night terminator (`#000` at 0.28) compresses the scale to ~1.64:1 on the dark half; that's the cost of having a terminator at all. **This was half the diagnosis.** "Press freedom and urbanisation produced the same picture" was read as a contrast problem and it was also a *distribution* problem — the percentile beneath it guaranteed the same picture at any contrast (see the next bullet). Widening the ramp was necessary and did not, on its own, make the picker teach anything.
- **The tone is the value, not the ranking** (2026-07-26). Every metric was placed on a *percentile* — position in the sorted order — which is uniform by construction, so exactly a fifth of the world landed in each fifth of the ramp on all twenty-seven. The histogram of tones on screen was therefore **identical whichever metric was showing**; only which country held which tone changed, which is most of why flipping through the picker taught a reader nothing. It also mis-calibrated in opposite directions on the two families: measured over the built payloads, the light half of the ramp covered **14.5% of the value range on literacy** (90%→100%, so Oman at 97% read as a different kind of country from Lesotho at 90%) and **99.7% of it on GDP** (the whole story from $72B to $27.3T crushed into two stops, while the dark half carefully separated $1B from $72B). `METRICS[key].scale` now says how each is read — `'linear'` for bounded indices and rates, `'log'` for counts, money and long-tailed rates — and the position is the projected value. Percentile was chosen to stop skewed metrics pinning at the floor, which is a real problem correctly identified; log fixes it without flattening ratios to adjacent ranks. The `scale` field is **editorial and required**, not derived: a new metric must state its scale rather than inherit a default that happens to be wrong for it. Zeros floor to the smallest positive value in the set, which puts Costa Rica's $0 military spending at the bottom of the ramp, where it belongs.
- **`ascending` turns the ramp around, and only it** (2026-07-26). The ramp meant magnitude on every metric, so the picker said "press freedom" while painting **Eritrea as the world's brightest example of it and Norway as its darkest** — on `DEFAULT_METRIC`, the first thing every reader sees. The flag already means "lower is better" for the three metrics that carry it (press freedom, Gini, youth unemployment); it now flips the ramp too. The other twenty-four are untouched, deliberately: `population` has no better end and must not be given one, and adding the flag to `co2PerCapita` or `refugeesProduced` would silently renumber the ranks the country pages print. Which end is desirable is not inferable from a tone, which is why the legend now prints the value at **both ends of the gradient** — a bare 72px gradient is a scale with no units, readable only by someone who already knew the distribution, and prose cannot carry the direction once it varies by metric. `domain.dark`/`domain.light` are emitted from the same projection that placed every country, so the legend cannot disagree with the paint; they are read off the *numeric* extremes rather than off `p`, because the log floor ties at the bottom and the tie printed 1% for a ramp end a 0% country was also painted.
- **The country card answers the question the colour raised** (2026-07-26). It opened on `highlights` — that country's six *best-ranked* metrics, sorted flattering-first — regardless of what the map was shaded by. So a reader could shade the world by press freedom, click Egypt to find out why it looked the way it did, and be shown Egypt's six proudest numbers, which will not include press freedom: the one gesture that could calibrate their eye never mentioned the thing they were looking at. The active metric now leads the card, and it leads with **a swatch of the country's own tone**, taken from `rampColour()` — the same ramp the land layer paints with — so the card can be held against the map and seen to match. Then the figure, the rank, and the scale's direction in words. A country the metric has no figure for gets the hatch and "no figure" rather than a blank, because on `literacyPct` that is half the world and a hatched country is otherwise unexplained. `rampColour` reimplements the layer's `interpolate` expression, since there is no way to ask MapLibre what colour a feature came out; `map-geo.test.js` pins every stop against `LAND_RAMP` so the two cannot drift.
- **"No figure" is hatched, not shaded** (2026-07-25). On a ramp where lighter means more, *any* tone reads as a position on the scale — so a country painted below the floor is asserting "lowest", and for the ~30 countries absent from `country-augmented` (Saudi Arabia, the US, the UK, South Africa, South Korea, the UAE, New Zealand…) that assertion is simply false. The map drew Saudi Arabia, ~85% urban, as the least urbanised country on earth, and did the same on every other augmented metric. `literacyPct` covers 85 of 169 countries, so there it was making that claim about half the world at once. `nodataHatch()` in `_map/style.ts` registers a 45° 8px sprite and `land-nodata` paints it wherever feature-state is absent — a difference of *kind*, which no choice of tone can express. Registration is wrapped in try/catch and is the only thing so wrapped: everything added after it in `addDataLayers` is the actual data, and a texture must not be able to take the map down with it.
- **Country coverage is a data gap, not a rendering one.** `shared/countries/country-augmented.ts` holds 144 of `country-data`'s 176 countries, and its header names a generator — `scripts/build-country-augment.mjs` — **that is not in the repo**, so it cannot be regenerated. The missing names are genuinely absent, not misspelled; they were checked. The United States has figures for **8 of 27** metrics for this reason. Until that script comes back, those countries are correctly hatched rather than wrongly shaded.
- **`populationDensity` is derived in `getMetricValue`, not read.** It is arithmetic — population ÷ area — and both inputs are native `CountryData` fields; it lived in the augmented table only because that is where the generator happened to compute it. So every country missing from that table reported no density while the site held both of its inputs. It is now derived whenever the table has nothing, which took coverage from 141 to 172 countries and gave the US, the UK, Saudi Arabia, South Africa and South Korea a figure. Stored values are never overwritten, so nothing published changed: France still reads 121, Germany 232, India 424 — the derivation was checked against them.
- **`CC_TO_TOPOJSON_NAME` is a join key, not a label.** `MK` was keyed `'North Macedonia'` — right for a label, wrong here, because Natural Earth 1:110m still says `Macedonia`. The join missed, the feature got no `iso2`, and the country became unshadeable on every metric *and* unclickable through to its profile — drawn, labelled and inert, with nothing thrown and nothing logged. `VU` was missing outright, same result. What the reader sees is `place-names.ts`'s job. A test now walks every Natural Earth feature and fails if one that has an ISO code cannot resolve to it; the five genuinely codeless features are enumerated, not tolerated.
- Solar, decay, basemap-geometry and built-payload invariants are pinned in `scripts/lib/map-geo.test.js`, which bundles the DOM-free modules with esbuild and asserts against them. **The ramp test now checks step contrast**, because the flat ramp passed every assertion there was — monotonic, neutral, under the border. Nothing asked whether the steps could be seen.

## Charts

Every series on this site is drawn by one thing: `shared/chart/series.ts` for
the geometry, `public/islands/_chart.ts` for the browser, and a ten-line
adapter per surface. Pinned in `scripts/lib/chart.test.js`.

- **There were three, and they had drifted.** `_map/chart.ts` (imperative DOM),
  `entity-sheet.ts` (a Preact VNode, since deleted — see the islands list) and
  `entity-pages.js` (an HTML string from
  Node) each carried the same thirty lines of scale arithmetic, and the header
  of the first argued the duplication was unavoidable: three runtimes, three
  node constructors, so "what is shared is the *shape*". That holds for the
  renderer and not for the chart. The domain, the scales, the axis precision,
  where the extremes fall, which points are finite — none of it has a runtime
  opinion in it. So the arithmetic emits **SVG nodes as plain data** and each
  surface walks the list with whatever constructor it has. What the drift
  actually cost: the map's chart had a y-axis, an area, a reference rule and a
  direction tint and the other two had a line and two dots, and
  `preserveAspectRatio="none"` — diagnosed and removed twice — was still in
  `/e/{id}`, the one page on this site whose entire subject is a chart, drawing
  its axis labels stretched and its end dots as ellipses.
- **A chart that can only be looked at is half a chart.** These drew 86 days of
  vessel traffic and printed three of those numbers, so a reader could see that
  something had fallen and could not find out when, by how much, or what it was
  on any given day. The shape was the whole of the information, and a shape is
  exactly the part a reader cannot check. Four things answer that: a **cursor**
  (pointer, touch, or arrow keys) that reads any observation off the line into
  a live readout; a **range control** that rescales the domain to a shorter
  window; the **extremes ringed** where they fell, so the high and low printed
  on the axis acquire a *when*; and **the numbers themselves**, every
  observation in a `<details>` table with its step-over-step change, plus a
  copy-as-TSV.
- **The readout is never empty.** At rest it names the latest observation *and
  its date* — a fact none of these charts stated before and the one most
  readers came for — and tracks the cursor when there is one. The row is
  height-reserved, so moving a pointer across the chart never shifts the layout
  under it.
- **`reference: 'open'` is a different quantity from `reference: 11.9`.** A
  number is external and fixed — a chokepoint's published 90-day baseline, which
  must not move when the reader narrows the range, because being able to see a
  fortnight against the quarter's normal is the whole point of drawing it.
  `'open'` is intrinsic and recomputed per window. Getting this wrong is silent:
  a rule pinned to the full series drifts off the top of a narrowed domain,
  squashes the data into a third of the box, and still looks exactly like a
  rule — under a caption going on calling it "the window's open". `direction:
  'window'` is the same idea for the tint, so a series that fell over the
  quarter and rose over the last month is not drawn in the decline's colour.
- **The caption states nothing the chart states.** It used to carry the date
  range and the window's percentage change; both go stale the moment the range
  control moves, and both are already on screen — the dates on the x-axis, the
  change in the readout, each recomputed for what is actually drawn. So the
  caption is provenance and what the rule marks, and nothing else.
- **The axis rounds and the table does not.** `axisDecimals` is a magnitude
  rule sized for three labels in a 62px gutter — one decimal above 100. Brent
  peaked at 124.24 the day after closing at 124.16, and when the table borrowed
  the axis's precision it printed `124.2` twice and put the word "high" beside
  the second one, which reads as a broken chart in the one place whose entire
  job is letting a reader check the picture. `formatExact` counts the decimals
  the source actually published.
- **The static chart is the whole chart.** `/e/{id}` ships the line, the area,
  the rule, the axis, the extremes, the latest value in words and every
  observation in a table, before any script runs — `<details>` and `<table>`
  need none. `series-chart` then **replaces** it with the interactive figure
  rather than hydrating it, because the two are not the same figure: the range
  control, the cursor and the copy button are meaningless without a script and
  so are deliberately absent from the markup. Same two-renderings-of-one-thing
  pattern `share-bar` uses.
- **The accessible description is composed where the numbers are.** Callers
  used to append the count themselves, so a 30-session view of an 80-session
  series announced itself as "…over 80 observations. 30 sessions." — a label
  contradicting itself in one breath, and only for the readers with no way to
  check it against the picture. `label` is now the subject and nothing else.
  The focusable node is the plot wrapper carrying `role="img"`, not the `<svg>`,
  which would be an image and a keyboard widget at once and announce as
  neither; the readout is a `role="status"` live region; the table is the route
  in for anyone who wants all of it.
- **Colour is a class, never an attribute.** `colour-system.test.js` bans
  literals in the stylesheet and an inline `stroke="#c08a6a"` would route
  straight around it, so every mark takes `currentColor` from a classed
  element. The component lands on both palettes — `:root` follows the reader,
  `body.map-page` commits to dark — so it declares `--chart-*` once and each
  surface says what those resolve to. Aliases only.
- **Charts open over the map, never instead of it.** The chokepoint, exchange
  and quote cards have always been `<dialog>`s on the map. The 54 indicator
  series had no route from the map at all: the article page has carried an
  entity strip for a long time and the map's story card never did, so a story
  about the strait of Hormuz sat a few hundred pixels from the Brent series it
  is about with nothing between them. The story card carries the strip now
  (`entities` on `/api/story/{slug}.json`, filtered through the same
  `indicatorMap` the article page uses), above the isnad since the chain has to
  stay last. A chip is a real `<a href="/e/{id}">` so it survives a modified
  click and a crawler — navigating would throw away a camera, a time slice, a
  set of filters and possibly an open card.
- **A `follows` chip unfolds inside the story card** (2026-07-28), rather than
  opening `entity-sheet` over the map through the loader's `zuhd:mount-island`
  event, which is what it did until now. That solved the navigation and did
  the same damage a different way: a 640x810 dialog over a scrim, which on a
  900px viewport dims the map out entirely and puts the story the reader
  clicked from behind a curtain. Sixty percent of that panel was "Mentioned in
  · 30" — a list of *other* stories to go and read, offered at the moment the
  reader is reading one, on a map where those stories are already drawn as
  beacons. The question a chip is actually asked is narrower: *this story is
  about Brent crude — what is Brent crude doing?* So the chart unfolds in
  place, under the strip, on the map's own dark surface. Chart options match
  `/e/{id}` exactly, so the series here and on the entity page cannot disagree
  about what the rule marks or which direction is which.
- **"Full record" and "full profile" open here too** (2026-07-29). Both panels
  still ended in a link out — `/e/{id}`, `/country/{ISO2}` — which is the whole
  disclosure undone at its own last line: a reader who followed one abandoned a
  camera, a time slice, a set of filters and the story they were reading, to
  answer a question the panel had already started answering. It was the same
  navigation the chips and the tags had just been fixed for, retreated to the
  bottom of the panel with the word "full" in front of it. So each panel has a
  **second density** under its first — the indicator's provenance and the
  stories citing it; the country's remaining twenty-odd metrics — behind a
  `moreLink` that grows the panel rather than leaving. The ordering *is* the
  judgement: the question the chip was asked is answered first, and the one it
  was not is a press away for a reader who turns out to have it. `href`s are
  untouched, so a modified click and a crawler still reach the canonical page;
  nothing routes a reader there by an ordinary click.
- **A list of other stories flies the map instead of leaving it** (2026-07-29).
  Two lists inside the card name other articles — a country's recent coverage,
  and the stories citing an indicator — and every row was an `/a/{slug}` link,
  which is the same navigation in a third costume. A row now calls the island's
  `openStory(slug)`, which resolves it against `pointBySlug` and flies there.
  It returns **false** for a slug outside the loaded fortnight and the row stays
  the plain link it was: a story from five months ago is genuinely not on this
  map, and a click that silently does nothing is worse than a navigation. No
  filter or scrubber check — the reader asked for *that* story by name, and
  refusing because its category chip is unlit would be the map overruling an
  explicit request.
- **A country tag in the prose does the same thing, through the same
  mechanism** (2026-07-28). `build.js` renders every `/country/{ISO2}` link in
  an article as `<a class="country-link" data-island="country-preview">` and
  the loader listens on the document for exactly that — so inside the map's
  story card a tag opened the `country-preview` sheet: a `.island-sheet` over a
  scrim, on the **site** palette, so on a light-mode device a white panel
  covered the dark map. The `follows` mistake from a different direction, and
  worse, because that sheet does not even commit to the map's chrome. Both are
  now one `disclosure()` factory — in `public/islands/_disclosure.ts` since
  2026-07-29, because the article page's strip needed the same behaviour and
  had been given a dialog instead. The tag's handler must `stopPropagation()`, or the inline
  panel and the loader's dialog both open. The `href` is untouched: a modified
  click and a crawler still reach the full profile.
- **The inline country panel leads with the metric shading the land**, which is
  why `createStoryPopup` takes a `standingFor` callback — the island owns the
  metric and the card has to ask. Without it the panel would open on
  `highlights`, that country's best-ranked numbers sorted flattering-first,
  regardless of what the reader was looking at: the exact failure the map's own
  country card was fixed for. `coverage` is dropped for the same reason
  "Mentioned in · 30" is, and only four metrics are shown — this is an aside
  inside a story, and the profile is one click away.
- **The card is capped at 50vh, so the panel opens below the fold, so it must
  be scrolled to.** Measured on a 1440x900 desktop: 152px of a 251px panel
  visible, with the chart's caption, its range control, "the numbers" and the
  full-record link all outside a box the reader has no reason to think has
  scrolled. Growth the reader cannot see is the same as no growth.
  `scrollIntoView({ block: 'nearest' })` after the expansion settles — instant,
  not smooth, because a second movement chasing the first reads as the card
  fidgeting. One panel serves the whole strip: two charts stacked in a card
  that has room for neither would push the first out of view as the second
  arrived.
- The panel's hero figure is `--size-base`, not the `--size-h2` the map's own
  sheets give a focal number. Those cards have no other subject; this one is a
  guest inside a story whose headline is `--size-md`, and a 31px number over an
  18px headline inverts what the card is about.
- **The rank strip is arithmetic too** (`shared/chart/rank-strip.ts`). Rank 1 of
  145 is a full bar. The same expression was written out in `country-pages.js`
  and twice in `_map/popup.ts`; nothing had drifted, and "nothing had drifted"
  was the entire guarantee that a country page and a map card agreed about a
  country's standing. It is deliberately *not* merged with
  `country-metrics.js`'s `p`, which is position on the value scale and a
  different quantity for a different job — the strip sits beside a printed rank
  and has to mean the rank. It is `aria-hidden`: the rank is in the next cell,
  and announcing it twice made a 26-row table read as 52 facts.
- **The time rail is not one of these.** `_map/timeline.ts` is a canvas
  histogram under a real `<input type="range">` — a control, not a chart to
  read values off, and already keyboard- and screen-reader-operable through the
  input. It stays as it is.

## Isnad and corrections

`scripts/lib/article-chain.js`, pinned by `article-chain.test.js` and the
corpus test. Both implement a sentence the site publishes about itself, which
is why they are extracted and tested rather than living inline in `build.js`: a
defect here does not look like a bug, it looks like the page working while the
claim on the about page quietly stops being true.

- **The chain is linked, and ranked by proximity to the event.** `about.md`
  says "*isnad* — Every article ends with its chain of sources, **named and
  linked**", and the article page printed `Sources: A, B, C` as flat text in
  publication order — while the map's story card linked them. The claim was
  false on the canonical page and true on the derived one. Ranking is the other
  half: an isnad is not a bibliography, and what ranks it is how close the
  transmitter stood. For a newsroom that reads as **jurisdiction** — an outlet
  inside the country where it happened leads.
- **Not by distance in kilometres.** `SOURCE_COORDS` covers 41 outlets against
  the corpus's 489 distinct names, so only **32%** of source references resolve
  to a coordinate and a distance sort would be arbitrary two thirds of the time
  while looking principled. `source.country` is on **99%** of them. Story-side,
  the inline `(country:XX)` tags cover ~52% of articles; where there is no tag
  the published order stands, which is what the **stable** sort protects.
- **`adalah` outranks nearness, and that is not a detail.** Ranked on nearness
  alone a state agency leads every chain about its own state — measured against
  this corpus, TASS at the head of 6, RT 10, Mehr 3 — which is exactly what the
  source policy forbids: "State media is included to carry a government's
  position, never as a substitute for independent reporting." `STATE_OUTLETS`
  withholds the promotion and nothing else: those outlets stay in the chain,
  named and linked, in the position the pipeline published them in. The list is
  **editorial, short, and holds allies to the same rule** — Anadolu is on it for
  the same reason TASS is. State-*funded* with editorial independence (BBC, Al
  Jazeera) is a different thing and must not creep in; a test asserts the
  boundary in both directions.
- **`sources[]` is never reordered.** `sources[0]` is the published primary
  source in `/api/*.json`, in `feed.xml` and on the generated share card. The
  ordering sorts a display copy.
- **Corrections are a record on the article, not an edit to it.**
  `foundation.md`'s first principle promises "Corrections issued openly" and
  nothing in the repo could record that an article had ever been wrong — so a
  correction meant editing the prose and letting the earlier version disappear.
  The record is `corrections: [{ date, note }]` in the article's own
  frontmatter, so it travels with the article in git and lands in the same diff
  as the text it fixes. It renders as a dated block **above** the source chain
  (the isnad has to stay last, or `about.md`'s sentence is untrue), with a
  `corrected` mark in the kicker linking to it — a correction the reader has to
  scroll to find is filed, not issued.
- **It reaches people through the channels that already exist**: `dateModified`
  in the article's JSON-LD, `<updated>` in the Atom feed, and a `corrections`
  field on the article in both `feed.json` and `feed-lite.json` (added to the
  one `apiCategories` object, spread-conditionally — absent on the ~100% of
  articles never corrected, so the published shape is unchanged and the app
  keeps parsing). There is no `/corrections` index page.
- **The parser drops a malformed correction rather than throwing**, which is
  right inside a live pipeline and useless as a warning — so `corpus.test.js`
  fails the build on any `corrections:` entry that would not survive the filter,
  including one dated before the article it corrects.

## The Hijri calendar

`public/islands/_map/hijri.ts` — no library and no table of dates. `Intl` has
shipped the Islamic calendars since ES2015, so the whole conversion costs a
`DateTimeFormat` and nothing in the bundle, which is the only reason it earns
its place: a date the reader can get from their own phone does not justify a
dependency.

- **Umm al-Qura specifically.** The four variants `Intl` exposes disagree by up
  to two days on the same instant (`islamic-civil` reads 10 Safar where
  `islamic-umalqura` reads 12), and picking the wrong one produces a date that
  is wrong and entirely plausible — no shape to the error, nothing renders
  oddly, no reader can catch it. It is the civil calendar of Saudi Arabia and
  what the Gulf exchanges schedule against, which is the right instrument for
  both uses here. A test pins the choice. Month names come from our own table,
  because ICU spells Safar "Ṣafar" in some builds and emits the numeral in
  others.
- **In the map's time readout, and nowhere else.** It is the site's one line
  saying what time it is, so it is the only place a second calendar does not
  repeat itself — the article kicker says "3h ago" and the footer date would be
  a third statement. It earns the space by *moving*: the rail spans fourteen
  days, so scrubbing walks half a lunar month.
- **Read in the same frame as the clock beside it** — **Makkah** since
  2026-07-26, previously UTC. Mixing frames on one row puts two different days
  on the same line for most of the world, which is worse than the
  approximation. The frame is `MAKKAH_TZ` in `_map/format.ts` (`Asia/Riyadh`;
  there is no `Asia/Mecca` in the IANA database) and **everything that states a
  time uses it**: the header clock, the scrubber readout, the rail's day
  anchor and tick labels, and this date. Changing only the readout is the
  smaller edit and the wrong one — between 21:00Z and midnight the Makkah date
  is already tomorrow, so for three hours a day the readout would name a day
  the tick under the scrub head contradicted. The offset is resolved through
  `Intl` (`zoneOffset`), not hardcoded as `3 * HOUR_MS`: Saudi Arabia has never
  observed daylight saving, so the two agree today, and only one of them stays
  honest if that ever changes. It is resolved **once per rail** rather than per
  value, which is safe only because there is no DST in this zone. The label is
  "Makkah", not `AST` — that also means Atlantic Standard Time, and the place is
  the point. This pairing is now *correct* rather than merely consistent: Umm
  al-Qura is Saudi Arabia's own civil calendar, so Saudi Arabia's zone is the
  frame it is defined in. `HIJRI_NOTE`, on the element's `title`, states the
  real caveat: the Hijri day turns at **maghrib**, so there are always two
  Hijri dates in the world at once and the boundary between them is the
  terminator this map already draws.
- **Eid is modelled in the markets layer; no other holiday is.** CLAUDE.md used
  to record "Holidays are not modelled — an Eid closure reads as trading" as a
  known defect, and it was the one the layer built to carry the Gulf could least
  afford: five exchanges shut for the better part of a week twice a year and the
  map drew each as a live disc with the previous week's number in it.
  `eidClosure` suppresses `isTrading` and `sessionLabel` names the Eid —
  "closed · Eid al-Fitr" answers the question "last close · Thu" only dodges.
  Christmas, national days and unscheduled halts still read as trading.
- **`holidays: 'islamic'` is an editorial flag on the catalog, not derived from
  `iso2`** — and the trap it avoids is real: TASE runs Sunday–Thursday exactly
  as Tadawul does, so any rule inferring Eid from the trading week closes the
  Tel Aviv exchange for Eid al-Fitr. A test pins the five that carry it and that
  TASE does not. The windows are **wider than the two feast days** (29 Ramadan –
  4 Shawwal, 8–14 Dhu al-Hijja) because Umm al-Qura is calculated and the actual
  Eid is sighted; the two can differ by a day either way.
- **Nisab, on the metals card only** (`nisab` in `_map/markets.ts`). The one
  question a Muslim reader actually has about the gold price, and the whole
  answer is arithmetic on the figure already in the card's hero line — no fetch,
  no payload, no new surface. It **prints the range rather than choosing**
  (85–87.48 g gold, 595–612.36 g silver): the classical thresholds are 20 dinars
  and 200 dirhams, and converting those to grams is where the schools part, so
  picking one would have the site holding a fiqh position it has no business
  holding. Silver is the more consequential figure — the lower threshold, and
  the majority position for zakat on cash — and is currently **uncomputable**,
  because `xag` is in `trends-registry.js` and absent from the published
  `/api/trends.json`; landing that series is what turns it on, not a code change.

## Prayer lines

`public/islands/_map/prayer.ts`, drawn by `situation-map.ts` and pinned in
`map-geo.test.js`. At any instant the set of places where a given prayer is
entering is a curve; five of them sweeping west is the earth as a prayer clock.
Added 2026-07-26.

- **The library is a test oracle, not an import.** adhan-js (Batoul Apps) is in
  `devDependencies` and the island ships none of it. adhan answers "what time is
  Fajr at this place" and the map needs the inverse, which has a closed form:
  `cos H = (sin alt − sin φ sin δ) / (cos φ cos δ)`, and the hour angle *is* the
  offset from the sub-solar meridian, so the answer is a longitude directly.
  Inverting adhan per latitude would be more code for a worse answer — it rounds
  to the minute (0.25° of longitude, so the curve staircases), it reads the
  calendar day off a `Date`'s *local* components, and its high-latitude rule
  substitutes a synthetic time rather than reporting that none exists. The test
  compares every curve against it to within 20 seconds, which is a stronger
  guarantee than importing it and costs the reader nothing.
- **A line stops where the prayer has no time.** `|cos H| > 1` means the sun
  does not reach that altitude at that latitude today, and the honest answer is
  no point. On the June solstice the Fajr line ends at 48°N; you can watch it
  retreat from the pole as the season turns. This is the reason above that
  actually matters — adhan would have kept drawing across the Arctic.
- **Umm al-Qura**, matching the Hijri date and the Makkah clock: Fajr 18.5°,
  Isha ninety minutes after Maghrib, Asr at shadow length one. No method is
  right everywhere and every method is a claim; the point is that the site makes
  one claim rather than two, and the chip's `title` names it.
- **Maghrib rides the terminator, ~0.83° outside it** — sunset is the disc's
  upper limb at −0.833° where `terminatorLat` is the geometric 0°. About three
  pixels of daylight between the shade edge and the line, at world zoom. They
  are not meant to coincide; snapping them together is a regression. This is
  also the highest-value label of the five: it says the boundary the reader can
  already see is a prayer time. Shuruq is deliberately absent — not a prayer,
  and its label would collide with Fajr's 18.5° away.
- **They keep drawing at the equinox, when the terminator does not.**
  `terminatorLat` bails at `|tan δ| < 1e-6` and the shade blinks out; the closed
  form has no such singularity. The window is about **twelve seconds**, twice a
  year — not the "few hours" `solar.ts` claims.
- **Asr parts from adhan by up to two minutes, deliberately.** `SolarTime`
  builds its solar coordinates at 0h UT of the local calendar day and
  `afternoon()` reads the declination straight off them, so adhan's shadow rule
  is anchored up to twelve hours from the prayer it describes. We anchor it at
  the place's own noon, which is what "the shadow an object casts at noon" means
  and is the only anchor that does not tear the curve: which calendar day a
  place is on changes *along* a line that circles the planet, so adhan's anchor
  would step the declination 0.4° at the date line and kink the Asr line in the
  middle of the Pacific. Two pixels at world zoom. Both halves are pinned.
- **Asr also needs a `|φ − δ| < 90` guard.** Past that, `tan` goes negative, the
  reciprocal comes back a negative altitude, and the solve returns a perfectly
  plausible longitude for a prayer with no time there — a second, fictitious Asr
  limb across the winter polar cap, every day of the year.
- **The walk is adaptive and cut at the antimeridian.** Near the poles these
  curves run nearly east-west and a flat 1° latitude step moves up to **31° of
  longitude** — a chord across the Arctic. Bisecting where the step exceeds 2°
  brings the worst case to 2.95°, and only at the map edge. And unlike the
  terminator ring these are functions of latitude, so they *do* cross ±180;
  with `renderWorldCopies` off an uncut segment is drawn straight back across
  the whole map as a horizontal bar.
- **`symbol-spacing` has a ceiling of 512, and going over it deletes the labels
  rather than thinning them.** MapLibre multiplies it by `EXTENT / tileSize`
  (8192 / 512 = 16) to get tile units, then places an anchor every `spacing`
  along each tile-clipped fragment. At 1400 that is 22400 units across a tile
  8192 wide, so no anchor is ever placed, at any zoom — five dashed curves and
  not one word saying what they are, with nothing in the console. It is 250.
  `text-rotation-alignment: 'viewport'` is load-bearing too: Dhuhr is a meridian
  and the default map-aligned rotation sets it bottom-to-top.
- **The labels are placed last of everything, so they are opportunistic.**
  MapLibre walks symbol layers top-down and the *later* layer claims its boxes
  first, so `beforeId: 'country-labels'` is what makes country names win — and
  it necessarily also puts prayer labels behind the city labels, the cluster
  counts and the market numerals, because all of those sit above
  `country-labels` in the style. There is no position that loses to country
  names and beats the rest. So the two knobs that matter are the number of
  candidate anchors and the size of the box each one asks for: at
  `symbol-spacing: 420` with `text-padding: 6` the Dhuhr line went unnamed
  across the Americas and *every* line went unnamed zoomed into Europe. 250 and
  2 fixed both. Some line will still occasionally go unlabelled — which is what
  the hover readout below is for, and why it is not a nicety.
- **Hovering a line names it and says when it reaches that spot**
  (`.map-prayer-tip`). The name is the part the labels cannot guarantee. The
  time is the part worth reading twice: it is the same prayer all along the
  line and not the same o'clock, and watching Isha run from 20:37 at one
  latitude to 19:20 further down is the curve explaining its own shape. It is
  **local mean solar time, marked `solar`** — the one place this map does not
  speak Makkah, because "what o'clock is it *there*" is a different question
  from the map's own clock. Civil time would want a lat/lng → IANA-zone dataset
  the site does not ship, and the nautical approximation is a guess dressed as
  a clock; solar is exact, free, and the frame the sun is actually in. Up to
  about ninety minutes separates it from a phone standing there, so the word
  `solar` is not decoration. `prayerInstantAt` is the curve solved for time
  rather than longitude, and it is correct *off* the line too — the grab box is
  seven pixels, which at world zoom is minutes of solar time, so a readout that
  reported the time on the line rather than under the cursor would look right
  and drift. Pinned against adhan in both directions.
- **Dashed, near-neutral (`MAP_COLOURS.prayer`), and the colour is the absence
  of one.** Solid would read as a coastline. These lines carry no value, so they
  get no hue — a warm tone was the first instinct and landed six points of hue
  from `OVERLAY_COLOUR.straits`, the exact collision the mark alphabet was built
  to stop making. The line sits at `line-opacity` 0.2 (about 1.5:1 on the land,
  quieter than a frontier); the **label is full strength**, because it is the
  whole difference between a prayer time and a stray hairline. `line-width` is
  constant: `line-dasharray` is measured in line widths, so a varying width
  stretches the pattern instead of thickening the line, in floored steps.
- **Hover lights the line; nothing takes a click.** A padded box query on the
  existing global `mousemove`, only when no mark has already claimed the
  pointer, then `feature-state`. It is deliberately absent from `MARKER_LAYERS`:
  these lines cross every country there is, so joining the click path would
  carve a band out of every country card on the map.
- **It has a toggle, unlike the terminator it is drawn against.** The terminator
  is an unlabelled wash; this is five named lines across every continent, which
  is a larger footprint than any feed here. The chip leads the layer row because
  the lines are drawn first, and its glyph comes from `_map/glyphs.ts` like
  every other chip — a chip-only entry, as `dot` is, since MapLibre dashes a
  `line` layer natively and there is nothing for `addImage` to rasterise.
- **They read the wall clock, not `scrubNow`**, as the terminator always has:
  the lines are drawn against the shade, and a Tuesday Maghrib over today's
  night would be two clocks in one picture. Redrawn by `drawSolar` on the
  existing 120-second tick — `prayerLines()` costs 0.26ms.

## Islands (interactive enhancements)

Interactive features (situational map, entity sheet, country preview) load via the islands architecture to keep pages framework-free:

- Source: `public/islands/*.ts` — each entry exports `mount(container, props)`; shared utilities in `public/islands/_framework.ts` (Preact + `@preact/signals` + `htm` tagged templates, no compile step needed).
- Bundler: `scripts/build/islands.js` runs esbuild as part of the SSG, emitting `dist/islands/*.js` ES modules. `@shared/*` imports resolve to `/shared/`.
- Loader: `public/island-loader.js` — included on every page, listens globally for clicks on `[data-island]` triggers, dynamically imports the matching module on first activation, passes `data-*` attributes as props. Also listens for `zuhd:mount-island` CustomEvents so an island can open another island programmatically without a DOM trigger.
- Sheet pattern: native `<dialog popover>` with CSS `@starting-style` transitions — no sheet library. Styles under `.island-sheet` in `public/style.css`.
- Islands shipped: `situation-map` (auto-mounted homepage map), `entity-strip` (auto-mounted on an article's `follows` row; unfolds the indicator's value, delta and chart **under the strip**, plus its provenance and mentions behind `full record →`; fetches `/api/entity/{id}.json`), `series-chart` (auto-mounted on `/e/{id}`; upgrades the server-rendered chart in place), `country-preview` (opened from inline country tags), `spacefield` (auto-mounted background on static pages), `doc-sheet` (footer document links over the map), `share-bar` (auto-mounted; upgrades a server-rendered share row).
- **`entity-sheet` was deleted (2026-07-29).** It was the article page's answer to a `follows` chip: a 44rem `<dialog>` with a scrim and a backdrop blur, thrown over the sentence that raised the question, carrying a header, the chart, "Mentioned in · 30" and a link to `/e/{id}`. The chart was the only part anyone had asked for. Its argument was that "a modal is the right answer because there is no view to protect" — true about the map and not about the reader: an article being read is a view too, and the panel that answers a question a sentence raised belongs under that sentence. So the strip now uses the same `_disclosure.ts` mechanism the map's story card does, and the surface a reader happens to be standing on stops changing what a chip means. `/e/{id}` is untouched and still canonical for a modified click, a crawler and a JS-less browser.
- **`_disclosure.ts` is the shared mechanism**: `disclosure()` (one panel, many triggers, one open at a time, a `seq` guard so a chip pressed mid-fetch wins) and `moreLink()` (the second density, opened in place). What is shared is the *behaviour*, not the rendering — the map is dark chrome and the article is the site palette — which is why the class names are parameters. Pinned in `scripts/lib/disclosure.test.js`, which drives both against jsdom and asserts the property rather than the markup: an ordinary click never navigates, a modified click always can.
- Note: the loader **discards** teardown functions returned by `mount()`. Long-lived islands own their own lifecycle (visibility pausing, resize observers, rAF cancellation) internally. A `<dialog>` island must therefore use `mountSheetIsland` from `_framework.ts`, which tears itself down on the dialog's native `close` event and keeps one sheet open at a time — without it every activation leaves another container and another shut dialog in the document.

## Sharing, discovery, and the app

Everything about how a link to this site behaves somewhere else. It is the one
part of the surface that cannot be checked by looking at it — a card with no
image renders perfectly in a browser and fails only in a stranger's timeline —
so the invariants are pinned in `scripts/lib/share-surface.test.js`.

- **One definition of where this site is**: `shared/share.ts` — store URLs, the App Store id, the Android package, the app's scheme, the masthead's accounts, `ORG_SAME_AS`, and `shareLinks()`. Imported by the SSG through `loadShared()` and by the islands through `@shared/share`. The X account has already been renamed once and the Instagram handle is explicitly a placeholder; a test asserts every hardcoded copy in the templates still agrees with this file.
- **Sharing is a row of real links, upgraded in place.** `build.js` renders it server-side from `shareLinks()` (`.share` → label + x / whatsapp / email), so it works with JavaScript off and survives the bundle failing. `share-bar.ts` then replaces it with `navigator.share` — the operating system's own sheet — where the device has one, and adds "copy link" where a clipboard exists. Two renderings of one row, which is why the targets live in `/shared/` and the test compares them.
- **The map's story card carries the share, because the map's URL cannot.** The homepage URL stays `/` no matter which story is open — deliberate, and it makes the address bar the one thing a reader must *not* copy. The card shares `/a/{slug}`, which is also the URL holding that story's generated OG card. The overlay sheets (disaster, chokepoint, conflict, genocide) get no share row: they are marks on a layer, not documents, so the only URL they could offer is `/`.
- **No web push, on purpose.** A browser notification subscription is a per-device endpoint held on our server — the same kind of record the app-open beacon was removed for. So "tell me when something breaks" is answered by the app, which already has push (`functions/api/push.js` → Expo). That makes `_app-prompt.ts` a fact about the app rather than a request, and it is bounded: it waits for four opens across the whole site, shows at most three times, and stops for good the moment a reader follows it. All three counters are in the reader's own localStorage.
- **`.app-banner` in `templates/index.html` is dead.** `body.map-page .app-banner { display: none }` has hidden it since the map became the homepage, so its markup and inline script ship on every homepage load and never render. The contextual prompt above replaced what it was for; it has not been deleted, only identified.
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
- **Generated share cards**: articles (`/api/og/{slug}.png`), countries (`/api/og/country/{ISO2}.png` — globe centred on the country, three best-ranked metrics), categories (`/api/og/c/{cat}.png`). Country and category pages previously shared the one static `og-image.png`, so passing on Palestine's profile produced a card that said nothing about it. Country cards use the **largest polygon's centroid**, not `geoCentroid` of the whole feature: averaging the United States with Alaska and Hawaii lands the globe in the Pacific. **No flags on the cards** — resvg is handed the Source Sans buffer and nothing else, so a regional-indicator pair renders as two empty boxes.
- **Meta**: `twitter:site` is the masthead (`@zuhd_news`), `twitter:creator` the maker — only the second was declared, so every shared story credited a personal account. `og:image:alt`/`twitter:image:alt` everywhere; `static-page.html` asked for `summary_large_image` and named no image at all. The Organization carries `sameAs` in both the homepage `@graph` and each article's inline `publisher`, which is what connects the domain to the feeds and the two store listings.
- **No campaign parameters on a shared URL, ever.** The site's claim is that it does not track anyone, and a share link that quietly reports where it came from is exactly the sort of thing that claim then has to keep covering.
- **App Links (`al:*`) are deliberately absent.** They would let Facebook's and Instagram's in-app browsers hand a zuhd.news link to the native app — but the app is a single screen (`mobile/app/index.tsx`) with no per-article route, so the handoff would drop the reader on the app's home screen and lose the story they tapped. Worth adding the day the app has a `/a/{slug}` route.
- `manifest.json` opens on the map, so its `theme_color`/`background_color` are `#080a0d` rather than white; `related_applications` names both stores with `prefer_related_applications: false`, which keeps desktop PWA install available while still letting Chrome surface the native app.

## Type

One scale, in `:root`: **11 / 12 / 14 / 16 / 18 / 20**, then 25 / 31 / 40 / 52 / 68
for editorial mass. `--size-base` (20px) is body copy and has never moved; every
rung below it went up one step on 2026-07-27, and `--size-md` (18px) is new.

- **The small end was a floor, not a scale.** The three rungs the chrome is built
  from were 12 / 12 / 11px on a bottom rung of 10, and between `--size-sm` (14)
  and `--size-base` (20) sat a 6px gap with nothing in it. So everything that was
  not body copy fell to 11–14px and stayed there, because there was no rung to
  promote it *to*: the map's story headlines, the whole HUD, the money ribbon,
  the footer, and on the article page the kicker, the share row, the pagination
  and the isnad — a sentence the site publishes about itself, set two rungs under
  the prose it certifies. Nothing was renamed, so the ~200 call sites rose
  together and the relationships the three-rung rule encodes are untouched: a
  legend is still a step under the control it explains.
- **The literals were the real floor.** A scale only binds what uses it, and the
  smallest type on the site was off it entirely — `.map-feed-title` at `0.9rem`
  (the rail's *headlines*, smaller than the article page's kicker),
  `.map-popup-lead` at `0.85rem`, `.map-country-metric` at `0.82rem`. Those are
  the map's reading surfaces. They are all on the scale now, and
  `font-size: 0.8x rem` should not come back; `--size-md` exists because
  `.map-popup-title` wanted 18 and the ramp had no such step.
- **Quiet is an ink step, never opacity.** The rule the filter chips and the
  scrubber head already followed, with the footer as the last holdout:
  `.footer-links` was `--text-secondary` at `opacity: 0.5` (**2.73:1**) and
  `.footer-social a` at `0.62 × 0.85` (**2.21:1**) — both under AA, on the only
  links that reach /about, /sources and /privacy. `colour-system.test.js` cannot
  see this class of bug, because opacity is not a colour literal. That is what
  makes it worth restating rather than assuming.
- **Bigger type is paid for, not absorbed.** Leading and padding are the budget:
  `.map-feed-item` gave back 0.2rem of vertical padding and tightened both
  leadings, so the rail row went from ~60px to ~58px while its headline grew
  14.4 → 16px and its dateline 12 → 14px. More readable *and* denser.
- **The HUD folds when width stops paying for it** (`@media (max-width: 1250px)`).
  Between the phone layout and a wide desktop, the strip is still the desktop's
  but no longer has the room that made it affordable: at 1200px it got 719px of
  the window and wrapped onto five rows — 194px of chrome lying over the map.
  Two things go, both already said elsewhere on the same screen. The **clock**,
  because the scrubber readout carries the same instant in the same frame with
  more of it — and because it is *painted over* the strip rather than laid out in
  it, so the HUD reserves its width as `padding-right` on every row to clear
  something that only sits on the first. And the **key's second clearance**, a
  `padding-right: 5.5rem` holding the door for that same clock. Then
  `.map-filters` becomes `display: contents` so its chips join the HUD's own wrap
  run instead of breaking as a unit — grouping survives because `.map-filter-sep`
  is a real element and simply becomes an item too. **194px → 126px, with every
  control still on the strip.** `.map-key` is deliberately *not* dissolved: it
  reads "what the beacons mean" and its items decode channels rather than
  offering anything to press, so flattened into the run they came out
  indistinguishable from two more toggles. The phone block must restate
  `display: flex` on `.map-filters` — every phone width also matches 1250px, and
  without it the panel opens onto chips that have escaped it.
- Sizes are not pinned by a test. `colour-system.test.js` covers contrast, and
  the contrast of every rung was checked in a browser at the sizes above; the
  quietest ink now measures 4.91:1 (the isnad) against a 4.5:1 floor.

## Colour

Two palettes, declared once each. **No colour literal may appear outside those two blocks** — `scripts/lib/colour-system.test.js` fails the build if one does, along with every other invariant below.

- **The site palette** (`:root`), for pages that follow the reader: four inks, two surfaces, two rules, plus the marks — `--accent` (neutral, link underlines and value bars), `--brand` (the one chromatic mark, gold; was `--dome`, which named the shape it debuted as), `--pos`/`--neg` (a signed change), `--focus`, `--scrim`. Every token is `light-dark()`; there is no `[data-theme]` and no duplicate dark block. Remember `light-dark()` is a *colour* function — `opacity: light-dark(0, 0.85)` is an invalid declaration that gets dropped, which is how a black canvas once covered every light-mode article.
- **The dark-surface palette** (`body.map-page, body.doc-page`), for the two page types that commit to dark regardless of the reader: five surfaces, two row states, five lines, six inks, and the marks. It is *not* "the site in dark mode" — it is a blue-grey chrome built to sit under saturated data marks. Before it existed these were 180 raw hex literals across 61 values, with nine near-blacks inside three points of each other.
- **Contrast is enforced, not assumed.** Every ink clears WCAG AA (4.5:1) on every surface in its own palette, in both schemes; focus rings clear the 3:1 of WCAG 2.2 SC 1.4.11 on every surface they can land on. The test checks combinations no rule currently makes, because a scale whose steps are only safe in the places they happen to be used is a trap for the next edit.
- **The seam with MapLibre.** `_map/style.ts` paints the canvas, CSS paints the chrome on top of it, and neither can import the other (the style is handed to a worker before any stylesheet is queryable). Three values live on both sides — `MAP_COLOURS.ocean` = `--map-ground`, `OVERLAY_COLOUR.straits`/`.straitsSurge` = `--map-straits`/`--map-straits-surge` — and the test asserts they agree. Category and overlay hues are *not* duplicated: HUD chips receive the layer's own value inline as `--cat`, so a chip cannot disagree with the mark it names.
- `theme-color` follows the page, not the preference: `body.map-page`/`body.doc-page` are served an unconditional `#080a0d` (see `headCommonDark` in `build.js`), because a white address bar over a permanently dark map is a claim about the page that isn't true.

## Shared datasets (`/shared/`)

Single source of truth for data consumed by both web and mobile:
- `shared/data/*.json` — Natural Earth TopoJSON (countries, capitals, lakes, rivers, seas). All five are read by both surfaces now: mobile through `mobile/components/blocks/locations-geo.ts`, the web map through `scripts/build/basemap.js` → `/basemap/`. Lakes, rivers and seas were unused by the web for a long time — see "Water is on the map" above for what each one cost to land.
- `shared/countries/country-data.ts`, `country-augmented.ts`, `country-ranking.ts` — 145 countries × 26 metrics + percentile-ranking logic
- `shared/chart/series.ts`, `rank-strip.ts` — the one chart and the one rank bar, as arithmetic. See "Charts" above.
- `shared/globe/coordinates.ts` — city/source coordinates, timezones, country overrides
- `shared/types.ts` — Article, ContextBrief, Chokepoint, Entity, TrendsSnapshot types
- `shared/genocide.ts` — the genocide record: hand-kept, one entry per situation, each carrying the UN body, document and date behind it. `GENOCIDE_MARKED` (determinations only) is what the build publishes and the map draws; `risk` entries are recorded and deliberately not drawn. Invariants pinned in `scripts/lib/map-geo.test.js`.

Mobile imports via `@shared/*` (path-mapped in `mobile/tsconfig.json` + `moduleNameMapper` in jest). Web reads directly via relative paths.

## Architecture

```
Stage 0: node fetch-news.js → /tmp/zuhd-feed.json
Stage 1: Claude CLI selector (select-prompt.md) → /tmp/zuhd-selection.json
Stage 1.5: node prefetch-articles.js → enriches selection with fetched content
Stage 2: Claude CLI writer (write-prompt.md) → content/articles/*.md
Stage 3: Claude CLI editor (check-prompt.md) → style fixes
Stage 3b: validate-articles.js → build.js → git commit → wrangler deploy → breaking push (api/push) + X tweet (post-to-twitter.js) + Instagram post (post-to-instagram.js)
Stage 4: node generate-briefing.js (04:00/16:00 UTC) → content/audio/ → redeploy
Stage 5: node measure-quality.js (Sunday 22:00 UTC only) → content/.quality-trend.json
Stage 6: Claude CLI tune (tune-prompt.md) (daily 22:00 UTC) → parameter changes
```

## Deploy

- **Site (Cloudflare Pages):** `npm run publish` — builds (`scripts/build.js`)
  then `npm run deploy` (`wrangler pages deploy dist --project-name zuhd-news
  --branch master`). `npm run deploy` alone uploads the existing `dist/`
  without rebuilding. Production branch is `master`; the pipeline (Stage 3b)
  deploys automatically each cycle.
- **MCP worker (`workers/mcp`):** `npm run deploy` inside that dir (`wrangler deploy`).
- **`workers/share-preview`:** RETIRED (2026-06-19) — do not deploy; its routes
  are intentionally empty (see its `wrangler.toml`).

## Dashboard

Pipeline monitoring at `localhost:7777` (SSH tunnel). 6 tabs: Pipeline, Quality, Logs, Experiment, Editorial, Status. Systemd service: `zuhd-dashboard.service`. Files in `scripts/dashboard/`.

## Experiments

Single-variable pipeline experiments tracked in `content/.experiments.json`. One active at a time, auto-evaluated by the 22:00 UTC tuning stage after the evaluation period.

- **Create**: use `/experiment` slash command — it guides objective, metric, change, baseline, registration
- **Track**: dashboard Experiment tab shows active experiment with daily metric chart, baseline comparison, and progress bar
- **Tunable parameters**: selector category floors (`select-prompt.md`), feed params (`fetch-news-api.js`, `fetch-news.js`), build params (`build.js`). Full list in `/experiment` skill and `tune-prompt.md`.
- **Rules**: one variable, one experiment, minimum 3 days, ≤ 20% of parameter range

## Tests

`npm test` (= `node --test scripts/lib/*.test.js`, also aliased as `npm run verify`) — corpus and log invariants. Each test pins a real bug the pipeline has had; baselines (e.g. known-bad cycle names, dup-pair counts) are observed values, not targets. If a test fails, read the diagnostic and fix the underlying issue — don't just raise the baseline to silence it.

## Mobile

Design system reference: `mobile/DESIGN.md` — tokens, primitives, variants, a11y checklist. Read before touching mobile UI. Mobile-scoped instructions: `mobile/CLAUDE.md`.

## Dev Reference

Developer/operator details (key files, sources, hosting, Notion workflow, roadmap) are in `DEV.md`.
