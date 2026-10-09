---
paths:
  - "scripts/build.js"
  - "knip.jsonc"
  - "biome.jsonc"
  - "scripts/perf/css-usage.mjs"
  - "scripts/lib/stable-stamp.js"
  - "scripts/lib/published-at.js"
  - "scripts/build/**"
  - "templates/**"
  - "scripts/lib/site-chrome.js"
  - "scripts/lib/html.js"
  - "scripts/lib/island-bundle.js"
  - "scripts/lib/published-at.js"
  - "public/island-loader.js"
  - "knip.jsonc"
  - "tsconfig.node.json"
  - "tsconfig.islands.json"
  - "biome.jsonc"
---

# The SSG and the static checks

`scripts/build.js` is one top-level-await script that writes all of `dist/`;
`scripts/build/*` are the page builders it calls. Which cache keys to bump,
the knip entry rule and the API contract are in the root `CLAUDE.md`; the
shared helpers are indexed in `.claude/rules/shared-modules.md`.

## What the site serves

- `/` is the situational map (MapLibre GL, own-origin basemap, no tile
  provider). `/a/{slug}` is the article reader, with the isnad and any
  corrections. `/c/{cat}`, `/country/{ISO2}` and `/e/{id}` are the category,
  country and indicator pages.
- `/s/{slug}` is the only dynamic page (`functions/s/[slug].js`): the map with
  that story's card open, carrying the article's OG meta and canonical. The
  other two Functions are `functions/api/push.js` and `tokens.js`.
- `/about`, `/contact`, `/privacy` and `/mcp` are static, and opened over the
  current page by the `doc-sheet` island.
- `/feed.xml`, `/sitemap.xml` and `/api/og/**` (generated share cards).
- JSON APIs under `/api/`: for the app (`feed`, `feed-lite`, `heatmap`,
  `trends`, `analysis`, `market-signals`, `companies`, `ai-models`, `meta`),
  for the map (`map`, `map-leads`, `map-archive`, `story/{slug}`,
  `entity/{id}`, `gdacs`, `conflict`, `genocide`, `markets`, `firms`, `ipc`,
  `chokepoints`) and for the MCP worker (`articles`, `context`). This list is
  not complete; `build.js` is.

## Templates and bundles

- `loadTemplate` (`build.js`) fills the shared placeholders once. A page
  builder takes the resolved template as an argument and never reads
  `templates/` itself: an unfilled `{{name}}` ships as literal text.
- `map-page` and `doc-page` bodies load with `headCommonDark`: they are dark
  whatever the reader prefers, so they state one `theme-color`.
- MapLibre stays out of the island bundle (`externalMapLibre`,
  `scripts/build/islands.js`). `copyMapLibreRuntime` copies its three `.mjs`
  files; a missing one is a black map and no error.
- The `/^[a-z0-9-]+$/` test in `public/island-loader.js` stays: the name
  reaches `import()` as a URL segment.
- `@shared` means `shared/` in `islands.js`, `island-bundle.js` and both
  tsconfigs. Tests bundle through `bundleIsland` and never override it.
- Country cards have their own `OG_VERSION`, in `country-pages.js`.

## An article's three times

- `eventAt` is the frontmatter date. The web sorts by it (`eventTime`).
- `addedAt` is the file's mtime, which a rebase or a fresh checkout resets.
  It is a contract field and still decides which articles are in the window.
- `publishedAt` is the adding commit's author time
  (`scripts/lib/published-at.js`), or `addedAt` before the commit. Read it
  for when a story came out; the app orders by it.

## A layer's stamp moves only when the layer does

- The app fetches layers by `ETag`, and a 304 needs identical bytes. A payload
  the app holds by tag is written through `apiStamps.hold`
  (`scripts/lib/stable-stamp.js`), which keeps `generated` still until the
  content changes.
- Keep per-build values out of a held payload: a fetcher's clock
  (`aiModelsPayload` drops `fetched`), an age in seconds, an unstable sort.
- Never hold the feed, the heatmap or `meta.json`: a moved `generated` there
  is how the app learns there is a build to fetch.

## Static checks

- knip covers unused files, exports and dependencies; Biome covers locals;
  nothing covers a CSS rule or a custom property. `knip.jsonc` is almost all
  `entry` by design: scripts are run by name, islands fetched by string path,
  `shared/` imported by `mobile/`.
- `tsconfig.node.json` keeps `strict` off: its value is what TypeScript
  infers, and implicit-any reports would bury that.
- In JSDoc, `{object}` means an object with no properties.
- `ignoreExportsUsedInFile` stays on in `knip.jsonc`: without it the export
  report is noise nobody reads.

## Deleting code safely

Before deleting anything a tool has not proved dead:

1. Grep the whole repo, including `mobile/` and `.claude/`. `shared/**` is a
   knip `entry`, so knip reports nothing about it.
2. Ask what reaches it without an import: `run-cycle.sh` by name, `spawnSync`
   in `lib/cycle-run.js`, `island-loader.js` by string path, `island-bundle.js`
   in tests, `data-island` attributes, class names built from data.
3. Ask whether the value is the point: a `satisfies` const, a type-only
   export, a rule that exists to be overridden.
4. Delete, then run the gate that would have caught a mistake. For CSS that
   is `npm run deadcode:css` again and a `scripts/shoot.mjs` pass.
5. If it has to stay, tag it `@knipignore` and write the reason above the
   tag.

- `deadcode:css` lists candidates. A span is reported when no state in
  `STATES` (`scripts/perf/css-usage.mjs`) matched it, so ask which state
  would, and add it. Judge a new state by covered bytes, not span count.
- Nothing checks custom properties, and a `var()` with no declaration falls
  back silently. Grep the declaration and every use.
