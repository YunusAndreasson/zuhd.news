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
- Article pages (`/a/{slug}.html` → served extensionless): standalone reader with prev/next, per-article OG meta, inline country-tag links
- Category pages (`/c/{politics|economy|science|tech}`): chronological list per category
- Country pages (`/country/{ISO2}`): flag, region, meta line, 26-metric tabular block with percentile strips and rankings, recent coverage list
- Entity pages (`/e/{id}`): indicator hero value + inline SVG sparkline + articles that reference the indicator via frontmatter `entities[]`
- OG images (`/api/og/{slug}.png`): typography + monochrome orthographic map inset, generated build-time via `scripts/lib/og-image.js`
- Static pages: `/about`, `/contact`, `/sources`, `/privacy`, `/support`, `/mcp`. On the map (and every other page) the footer links open these **over** the page via the `doc-sheet` island reading `/api/doc/{page}.json`, pushing the canonical URL into history so the address bar, back button and reload all behave — leaving the map to read two paragraphs throws away the view the reader built. The standalone page stays canonical for shared links, crawlers, modified clicks and no-JS, and `.doc-page` renders it on the map's own surface rather than the old light template.
- Feeds: `/feed.xml` (Atom), `/sitemap.xml`
- JSON APIs consumed by mobile: `/api/articles.json`, `/api/feed.json`, `/api/feed-lite.json`, `/api/heatmap.json`, `/api/context/{id}.json`, `/api/chokepoints.json`, `/api/gdacs.json`, `/api/conflict.json`, `/api/trends.json`, `/api/meta.json`, `/api/articles/{category}.json`. **These shapes are a published contract — the app is live in both stores. Add endpoints rather than changing them.**
  - `feed.json` is the full payload — it carries the ~3,200-entry `contexts`
    index and per-article `threadSummary`, and is read by `workers/mcp` and the
    dashboard. `feed-lite.json` is the same articles without either (~15 KB
    gzipped vs ~180 KB) and is what the mobile app fetches. Both are derived
    from one `apiCategories` object in `build.js`, so the article shape cannot
    drift; add a field there, not in one endpoint.
- JSON APIs consumed by the web map: `/api/map.json` (14-day point set), `/api/map-leads.json` (lead sentences, idle-fetched), `/api/story/{slug}.json` (per-story reading card), `/api/gdacs.json` and `/api/conflict.json` (overlay layers), plus `/basemap/*.geojson` (countries at two detail tiers, country labels, places) and `/basemap/fonts/` (SDF glyphs)

## Situational map (homepage)

- Island: `public/islands/situation-map.ts` + helpers in `public/islands/_map/` (`style`, `feed`, `timeline`, `sheet`, `popup`, `solar`, `types`). Imperative and framework-free — it stays off the Preact runtime the sheet islands use.
- **MapLibre GL renders the basemap**, from GeoJSON and SDF glyphs served from our own origin (`scripts/build/basemap.js` → `/basemap/`). No tile provider, no API key, no third-party request: the CSP stays `default-src 'none'` apart from the blob: worker MapLibre spawns. Coastlines ship at two tiers — 110m for first paint, 50m swapped in past zoom 3.2.
- **MapLibre is not bundled into the island.** `scripts/build/islands.js` resolves the bare specifier to the copied vendor file, because the worker MapLibre spawns imports `maplibre-gl-shared.mjs` as a sibling regardless — inlining it shipped that chunk twice. The three `.mjs` files are copied verbatim, `modulepreload`ed from `templates/index.html`, and cached apart from the content cycle by the `/islands/*.mjs` rule in `_headers`.
- Stories are the only layer rebuilt as the scrubber moves: their decay alpha is per-feature and the cluster counts must reflect the filtered set. GDACS and conflict carry an event time and move by **`setFilter`**; layer toggles are **visibility**. Neither re-serialises GeoJSON per frame. Refreshes coalesce onto a rAF.
- Hover is **`promoteId` + `setFeatureState`**, read by a `['feature-state','hover']` paint expression — not a `setPaintProperty` rewrite per pointer move.
- Clusters aggregate via **`clusterProperties`**: category counters, max coverage rank, max recency, contested flag. Fill is a cold→hot ramp on `point_count` with two blurred rings under it for falloff, rim is the dominant category, and the count label **steps** from light to dark rather than blending through an illegible midpoint. A `heatmap` layer under all of it carries the density field, capped at zoom 5.
- **The heat ramp's domain is rescaled to the visible set** (`heatStops` / `applyClusterScale`), not fixed. Calibrated against the 14-day corpus it tops out near 220, which renders the default 24h view — a few dozen stories, no cluster above single digits — entirely in the two coldest colours. Stops are forced strictly ascending; `interpolate` rejects a repeated input, which is what a naive rescale produces once the domain gets small.
- **The map opens on 24h**, not the full fortnight — the widest range is the one view where nothing stands out. The scrubber still spans all 14 days.
- **Getting back out**: a "whole world" control appears bottom-right once the view leaves home and hides when it returns; Escape resets the view when no card is open; the wordmark does the same. The URL never changes for any of it.
- Interaction: hovering a story previews it and a dwell flies in; hovering a disaster/strait/conflict mark opens the sheet in its non-modal **peek** mode and a click pins it. Clusters expand on **click only** — the old hover-dwell expansion moved the camera whenever the pointer crossed a dense area. The wordmark resets the view instead of reloading the homepage (the `href` stays, so modified clicks and a JS-less browser still navigate).
- Beacon size is a **percentile rank over the window's coverage figures, computed in `build.js`** — raw `eventCoverage` is absent on ~65% of articles and holds occasional nonsense (values in the tens of thousands), so a log curve left most of the corpus at the minimum radius and a handful of bad rows saturated. Stories with no figure get a fixed neutral size, which says "unknown" rather than "smallest".
- Decay half-life is **72h** (`_map/types.ts`), sized to this map's 14-day window. The 18h curve borrowed from mobile's 72-hour globe put 85% of the corpus at the alpha floor and collapsed recency to "today or not".
- **Cartography of historic Palestine**: `scripts/build/basemap.js` merges the Natural Earth "Israel" and "Palestine" geometries with topojson `merge()` — a topological union, so the shared arc is dissolved rather than stroked twice — and labels the result Palestine (ISO2 `PS`, so a click opens that profile). Place labels run through the same `displayLocation` table the articles use, so the basemap prints Yafa and Al-Quds rather than contradicting the story drawn on top of it.
- Sources that disagree sharply about a story (`sentimentDivergence` ≥ 0.35) get a contested ring; chokepoints size on the signed magnitude of `delta7vs90`, not a binary threshold.
- Conflict recency anchors on the **dataset's newest event**, not `Date.now()` — UCDP publishes months in arrears, and decaying against wall-clock renders the whole layer at the opacity floor. Its 260 KB payload and the lead sentences are both `requestIdleCallback`-deferred.
- Solar, decay, basemap-geometry and built-payload invariants are pinned in `scripts/lib/map-geo.test.js`, which bundles the DOM-free modules with esbuild and asserts against them.

## Islands (interactive enhancements)

Interactive features (situational map, entity sheet, country preview) load via the islands architecture to keep pages framework-free:

- Source: `public/islands/*.ts` — each entry exports `mount(container, props)`; shared utilities in `public/islands/_framework.ts` (Preact + `@preact/signals` + `htm` tagged templates, no compile step needed).
- Bundler: `scripts/build/islands.js` runs esbuild as part of the SSG, emitting `dist/islands/*.js` ES modules. `@shared/*` imports resolve to `/shared/`.
- Loader: `public/island-loader.js` — included on every page, listens globally for clicks on `[data-island]` triggers, dynamically imports the matching module on first activation, passes `data-*` attributes as props. Also listens for `zuhd:mount-island` CustomEvents so an island can open another island programmatically without a DOM trigger.
- Sheet pattern: native `<dialog popover>` with CSS `@starting-style` transitions — no sheet library. Styles under `.island-sheet` in `public/style.css`.
- Islands shipped: `situation-map` (auto-mounted homepage map), `entity-sheet` (indicator header + value/delta + inline SVG sparkline + mentions; opened from an article's entity strip; fetches `/api/entity/{id}.json`), `country-preview` (opened from inline country tags), `spacefield` (auto-mounted background on static pages).
- Note: the loader **discards** teardown functions returned by `mount()`. Long-lived islands own their own lifecycle (visibility pausing, resize observers, rAF cancellation) internally.

## Shared datasets (`/shared/`)

Single source of truth for data consumed by both web and mobile:
- `shared/data/*.json` — Natural Earth TopoJSON (countries, capitals, lakes, rivers, seas)
- `shared/countries/country-data.ts`, `country-augmented.ts`, `country-ranking.ts` — 145 countries × 26 metrics + percentile-ranking logic
- `shared/globe/coordinates.ts` — city/source coordinates, timezones, country overrides
- `shared/types.ts` — Article, ContextBrief, Chokepoint, Entity, TrendsSnapshot types

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
