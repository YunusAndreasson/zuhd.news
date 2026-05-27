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

- Homepage (`/`): vim-keybindings, silent refresh, list+reader split-pane
- Article pages (`/a/{slug}.html` → served extensionless): standalone reader with prev/next, per-article OG meta, inline country-tag links
- Category pages (`/c/{politics|economy|science|tech}`): chronological list per category
- Country pages (`/country/{ISO2}`): flag, region, meta line, 26-metric tabular block with percentile strips and rankings, recent coverage list
- Entity pages (`/e/{id}`): indicator hero value + inline SVG sparkline + articles that reference the indicator via frontmatter `entities[]`
- OG images (`/api/og/{slug}.png`): typography + monochrome orthographic map inset, generated build-time via `scripts/lib/og-image.js`
- Static pages: `/about`, `/contact`, `/sources`, `/privacy`, `/support`, `/mcp`
- Feeds: `/feed.xml` (Atom), `/sitemap.xml`
- JSON APIs consumed by mobile: `/api/articles.json`, `/api/feed.json`, `/api/heatmap.json`, `/api/context/{id}.json`, `/api/chokepoints.json`, `/api/trends.json`, `/api/meta.json`, `/api/articles/{category}.json`

## Islands (interactive enhancements)

Interactive features (entity sheet, country preview, ambient globe) load via the islands architecture to keep the homepage framework-free:

- Source: `public/islands/*.ts` — each entry exports `mount(container, props)`; shared utilities in `public/islands/_framework.ts` (Preact + `@preact/signals` + `htm` tagged templates, no compile step needed).
- Bundler: `scripts/build/islands.js` runs esbuild as part of the SSG, emitting `dist/islands/*.js` ES modules. `@shared/*` imports resolve to `/shared/`.
- Loader: `public/island-loader.js` — included on every page, listens globally for clicks on `[data-island]` triggers, dynamically imports the matching module on first activation, passes `data-*` attributes as props. Also listens for `zuhd:mount-island` CustomEvents so an island can open another island programmatically without a DOM trigger.
- Sheet pattern: native `<dialog popover>` with CSS `@starting-style` transitions — no sheet library. Styles under `.island-sheet` in `public/style.css`.
- Islands shipped: `entity-sheet` (indicator header + value/delta + inline SVG sparkline + mentions; opened from an article's entity strip; fetches `/api/entity/{id}.json`), `country-preview` (opened from inline country tags), `ambient-globe` (auto-mounted background on the homepage).

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
Stage 3b: validate-articles.js → build.js → git commit → wrangler deploy
Stage 4: node generate-briefing.js (04:00/16:00 UTC) → content/audio/ → redeploy
Stage 5: node measure-quality.js (Sunday 22:00 UTC only) → content/.quality-trend.json
Stage 6: Claude CLI tune (tune-prompt.md) (daily 22:00 UTC) → parameter changes
```

## Dashboard

Pipeline monitoring at `localhost:7777` (SSH tunnel). 6 tabs: Pipeline, Quality, Logs, Experiment, Editorial, Status. Systemd service: `zuhd-dashboard.service`. Files in `scripts/dashboard/`.

## Experiments

Single-variable pipeline experiments tracked in `content/.experiments.json`. One active at a time, auto-evaluated by the 22:00 UTC tuning stage after the evaluation period.

- **Create**: use `/experiment` slash command — it guides objective, metric, change, baseline, registration
- **Track**: dashboard Experiment tab shows active experiment with daily metric chart, baseline comparison, and progress bar
- **Tunable parameters**: selector category floors (`select-prompt.md`), feed params (`fetch-news-api.js`, `fetch-news.js`), build params (`build.js`). Full list in `/experiment` skill and `tune-prompt.md`.
- **Rules**: one variable, one experiment, minimum 3 days, ≤ 20% of parameter range

## Tests

`node --test scripts/lib/*.test.js` — corpus and log invariants. Each test pins a real bug the pipeline has had; baselines (e.g. known-bad cycle names, dup-pair counts) are observed values, not targets. If a test fails, read the diagnostic and fix the underlying issue — don't just raise the baseline to silence it.

## Mobile

Design system reference: `mobile/DESIGN.md` — tokens, primitives, variants, a11y checklist. Read before touching mobile UI. Mobile-scoped instructions: `mobile/CLAUDE.md`.

## Dev Reference

Developer/operator details (key files, sources, hosting, Notion workflow, roadmap) are in `DEV.md`.
