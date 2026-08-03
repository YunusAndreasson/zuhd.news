<!--
  Keep this file under 200 lines. It loads into context on every turn of every
  session, and a long one costs tokens continuously *and* buries the rules that
  matter (Anthropic's guidance: "bloated CLAUDE.md files cause Claude to ignore
  your actual instructions").

  It reached 946 lines by accretion — every design decision this repo made got
  written up here, in full, forever. Most of that is now in `.claude/rules/*.md`
  with `paths:` frontmatter, which loads only when Claude reads a matching file.
  Nothing was deleted.

  Before adding a line here, ask: would removing it cause a mistake in *any*
  session? If it only matters while editing one area, it belongs in a rule. If
  it is the rationale for one module, it belongs in that module's header.
-->

# CLAUDE.md

Minimalist typography-first global news site. Philosophy in `foundation.md`;
operator/dev detail in `DEV.md`.

## Decisions

- Single-family sans-serif typography, no images unless informational
- Smart Brevity format: lead, why it matters, details, what's next, sources
- English first, global hard news only. Categories: politics, economy, science, tech
- No CMS, no database, no framework — content is files + a node SSG (`scripts/build.js`)
- Content: markdown + YAML frontmatter in `content/articles/`, built to `dist/`

## Commands

| | |
|---|---|
| `npm run dev` | watch + local server (`SKIP_OG=1`) |
| `npm run build` | `scripts/build.js` → `dist/` |
| `npm run verify` | `lint && typecheck && test` — run before committing |
| `npm run lint` | Biome 2.5.5, **linter only** (`biome.jsonc`); formatter is off on purpose |
| `npm run typecheck` | two projects: `tsconfig.islands.json` (islands + `shared/`, strict) and `tsconfig.node.json` (`allowJs`+`checkJs`, `strict` OFF) |
| `npm test` | `node --test scripts/lib/*.test.js` |
| `npm run deadcode` | knip (`knip.jsonc`) — unused *files* and *exports*, which Biome cannot |
| `npm run deadcode:css` | dead CSS, measured in a browser — report only, never a gate |
| `npm run publish` | build + `wrangler pages deploy dist` (branch `master`) |
| `npm run perf` / `perf:idle` / `perf:profile` | browser instruments; see `.claude/rules/web/map.md` |

CI (`.github/workflows/checks.yml`): lint, typecheck, deadcode, build. `npm test`
is deliberately **not** in CI — `logs.test.js` reads gitignored `logs/` and
`corpus.test.js` ratchets against the live corpus.

## Gotchas that cost real bugs

- **Dead code has four kinds and three tools, and the gaps are the point.**
  `deadcode` covers files and exports, Biome covers locals, and **nothing covers
  a CSS rule or a custom property** — which is why `--map-status-w`, `--legend-x`
  and a whole `@media` block survived until someone read them. `deadcode:css`
  measures the stylesheet in a real browser and is a *candidate list*: its
  failure mode is calling a rule dead because the sweep never opened the panel it
  belongs to. **The protocol for acting on any of it is "Deleting code safely" in
  `.claude/rules/web/build.md`** — every tool here has produced a confident false
  positive at least once.
- **`knip.jsonc` is almost entirely `entry`, and that is the design.** Pipeline
  scripts are invoked by name from `run-cycle.sh`, islands are globbed by the
  bundler and fetched by string path, `shared/` is imported by `mobile/`. **A
  script missing from that list is a script knip calls dead** — add there when
  you add here.
- **`light-dark()` is a *colour* function.** `opacity: light-dark(0, 0.85)` is an
  invalid declaration that gets dropped silently; that is how a black canvas
  once covered every light-mode article.
- **Quiet is an ink step, never `opacity`.** `colour-system.test.js` cannot see
  opacity, so a composited 2.3:1 label passes it.
- **The JSON APIs are a published contract** — the app is live in both stores.
  Add endpoints; do not change shapes. Article fields come from one
  `apiCategories` object in `build.js`, so `feed.json` and `feed-lite.json`
  cannot drift.
- **Bump the cache key when the thing it keys changes**: `IG_VERSION`,
  `OG_VERSION`, `BASEMAP_V` (every file the basemap is built from belongs in it),
  `ISLAND_V`, and `?v=` on `/og-image.png`.
- **The cycle's typecheck reports and never blocks** (`run-cycle.sh`, behind
  `timeout 120 … || echo WARNING`) so a checker can never cause a no-publish
  cascade. `logs.test.js` ratchets that warning at zero.
- **Tests pin real bugs.** Baselines are observed values, not targets — if one
  fails, fix the cause, don't raise the number.

## Shared modules — check before writing a helper

Eleven small files, each holding one thing that used to be held in several. Four
of the twelve groups they replaced **had already parted**, and in each case the
wrong copy looked exactly like the right one. The rationale for each is in its
own header; this is the index.

| Module | Replaces |
|---|---|
| `scripts/lib/site-chrome.js` | the footer + archetype header — 6 copies, 2 drifted |
| `scripts/lib/html.js` | `escHtml` / `escXml` — 5 names for 2 functions |
| `scripts/lib/contrast.js` | WCAG + HSL arithmetic — 9 copies, 2 sRGB breakpoints |
| `scripts/lib/regions.js` | lat/lng → region bbox ladder — 3 copies |
| `scripts/lib/concurrency.js` | `runWithConcurrency` — 4 copies |
| `scripts/lib/argv.js` | `--flag value` — 5 copies |
| `scripts/lib/island-bundle.js` | the esbuild+jsdom test harness — 7 copies |
| `scripts/lib/claude-envelope.js` | envelope parsing + `runHaiku` argv — 3 copies |
| `scripts/lib/ig-image.js` → `igLead` | 3 copies; **two still cut on an ellipsis**, so the posted card and the cached one could differ |
| `public/islands/_dom.ts` | `el` / `svgEl` — 5 copies |
| `public/islands/_entity-panel.ts` | the `follows` panel — 2 copies whose comments promised they could not disagree |
| `scripts/lib/serve-dist.js` | the local `dist/` server + its MIME table — 2 copies, caught at the second |

**Rule: duplication is only free while the copies agree, and nothing here was
checking that they did.** Prefer a parameter (class names, a link renderer) over
a second copy — that is the split `_disclosure.ts` already makes.

## Architecture

```
Stage 0    node fetch-news.js → /tmp/zuhd-feed.json
Stage 1    Claude CLI selector (select-prompt.md) → /tmp/zuhd-selection.json
Stage 1.5  node prefetch-articles.js → enriches selection
Stage 2    Claude CLI writer (write-prompt.md) → content/articles/*.md
Stage 3    Claude CLI editor (check-prompt.md) → style fixes
Stage 3b   validate-articles.js → build.js → git commit → wrangler deploy
           → push (api/push) + X (post-to-twitter.js) + IG (post-to-instagram.js)
Stage 4    node generate-briefing.js (04:00/16:00 UTC) → content/audio/
Stage 5    node measure-quality.js (Sun 22:00 UTC) → content/.quality-trend.json
Stage 6    Claude CLI tune (tune-prompt.md) (daily 22:00 UTC)
```

The pipeline runs on a remote server and commits to `master` five times a day,
touching only `content/`.

## Web surface

- `/` — the situational map (MapLibre GL, own-origin basemap, no tile provider).
  See `.claude/rules/web/map.md`.
- `/a/{slug}` — article reader, with the isnad and any corrections
- `/c/{cat}`, `/country/{ISO2}`, `/e/{id}` — category, country profile, indicator
- `/s/{slug}` — **the only dynamic path** (`functions/s/[slug].js`): the map with
  that story's card open, carrying the article's OG meta and canonical
- `/about`, `/contact`, `/sources`, `/privacy`, `/support`, `/mcp` — static, and
  opened over the current page by the `doc-sheet` island
- `/feed.xml`, `/sitemap.xml`, `/api/og/**` (generated share cards)
- JSON APIs for mobile (`articles`, `feed`, `feed-lite`, `heatmap`, `context`,
  `trends`, `meta`, …) and for the map (`map`, `map-leads`, `story/{slug}`,
  `gdacs`, `conflict`, `genocide`, `markets`, `firms`, `ipc`, `chokepoints`)

## Islands

Interactive enhancements, framework-free where possible, loaded on demand.

- Sources `public/islands/*.ts` → esbuild via `scripts/build/islands.js` → `dist/islands/*.js`
- `public/island-loader.js` is on every page: it imports the matching module on
  first activation of a `[data-island]` trigger, auto-mounts `[data-island-auto]`,
  and listens for `zuhd:mount-island`. **It discards teardown functions**, so a
  long-lived island owns its own lifecycle and a `<dialog>` island must use
  `mountSheetIsland`.
- Shared: `_dom.ts` (`el`/`svgEl`), `_disclosure.ts` (one panel, many triggers),
  `_entity-panel.ts`, `_chart.ts`, `_share.ts`, `_framework.ts` (Preact + htm —
  **not** `@preact/signals`, which was a dependency nothing used)
- Shipped: `situation-map`, `entity-strip`, `series-chart`, `country-preview`,
  `spacefield`, `doc-sheet`, `share-bar`

## Shared datasets (`/shared/`)

Single source of truth for web + mobile. Mobile imports via `@shared/*`
(path-mapped); web reads relative paths, transpiling TS through
`scripts/build/shared-ts.js`.

`data/*.json` (Natural Earth TopoJSON) · `countries/*` (145 × 26 metrics +
ranking) · `chart/*` (the one chart and rank bar, as arithmetic) ·
`globe/coordinates.ts` · `place-names.ts` · `genocide.ts` · `share.ts` · `types.ts`

## Deploy

- **Site:** `npm run publish`. Production branch `master`; Stage 3b deploys each cycle.
- **MCP worker:** `npm run deploy` inside `workers/mcp`.
- **`workers/share-preview`:** RETIRED 2026-06-19 — do not deploy.
- Dashboard: `localhost:7777` via SSH tunnel, `zuhd-dashboard.service`, `scripts/dashboard/`.
- Experiments: one at a time in `content/.experiments.json`; create with `/experiment`.

## Deeper context, loaded on demand

Three distinct surfaces — **web**, **pipeline**, **mobile** — and almost nothing
that matters in one matters in the others. The design record lives beside each,
scoped by `paths:` frontmatter so it enters context only when you read a file it
covers. Every entry is a bug the site has actually had, most of which failed
silently.

| | |
|---|---|
| `.claude/rules/web/map.md` | the situational map — layers, marks, the ground ramp |
| `.claude/rules/web/sky.md` | the sun, moon, stars and the limb glow around the globe |
| `.claude/rules/web/prayer.md` | the prayer-line geometry and the terminator |
| `.claude/rules/web/hijri.md` | the Hijri calendar, the Makkah clock, Eid closures |
| `.claude/rules/web/charts.md` | `shared/chart/`, `_chart.ts`, `/e/{id}`, disclosures |
| `.claude/rules/web/design-system.md` | the type scale and the two palettes |
| `.claude/rules/web/share-surface.md` | share cards, OG/IG images, `/s/{slug}`, the app prompt |
| `.claude/rules/web/build.md` | the SSG, templates, caches, and the static checks |
| `.claude/rules/pipeline/cycle.md` | stage conventions, Claude CLI stages, experiments |
| `.claude/rules/pipeline/articles.md` | the isnad, corrections, corpus invariants |
| `mobile/CLAUDE.md` + `mobile/DESIGN.md` | the app — read DESIGN.md before any UI change |

Adding to one of these is almost always right; adding to this file is almost
always wrong.
