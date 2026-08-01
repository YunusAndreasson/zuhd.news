---
paths:
  - "scripts/build.js"
  - "scripts/build/**"
  - "templates/**"
  - "scripts/lib/site-chrome.js"
  - "scripts/lib/html.js"
  - "scripts/lib/island-bundle.js"
  - "public/island-loader.js"
  - "knip.jsonc"
  - "tsconfig.node.json"
  - "tsconfig.islands.json"
  - "biome.jsonc"
---

# The SSG and the static checks

`scripts/build.js` is 1,900 lines of top-level await that produces the whole
site. `scripts/build/*` are the page builders it calls.

## Templates

- `templates/*.html` carry `{{placeholder}}`s; `loadTemplate` in `build.js`
  substitutes the shared ones (`headCommon`, `archetypeHeader`, `footerNav`,
  `wordmark`, `v`, `basemapV`) once at load, and the per-page builders fill the
  rest. **A page builder must not read and process a template itself** —
  `country-pages.js` did, which was a second copy of `loadTemplate` that then
  had to be told about every new placeholder, and would silently have emitted a
  literal `{{footerNav}}`. It takes the resolved template as an argument now.
- The page furniture (footer, archetype header, wordmark) is
  `scripts/lib/site-chrome.js`, built once from the loaded `shared/share.ts`.
  It was six copies and two had drifted; pinned by "every page type wears the
  same footer" in `share-surface.test.js`.
- Escaping is `escHtml` / `escXml` from `scripts/lib/html.js`. There were five
  names for those two functions.
- `headCommonDark` exists because `theme-color` is a claim about the page:
  `body.map-page` / `body.doc-page` commit to dark whatever the reader prefers,
  so they get an unconditional `#080a0d` rather than the light/dark pair.

## Caches

The OG and IG cards are content-hash disk caches under `.cache/`. **Bump
`OG_VERSION` / `IG_VERSION` whenever the rendering changes**, or every cached
card stays composed against the old layout. `SKIP_OG=1` bypasses both — that is
what `npm run dev` uses, and `share-surface.test.js` knows to skip the
generated-card check when the directory is empty.

`BASEMAP_V` and `ISLAND_V` are content hashes of their inputs. **Every file the
basemap is built from belongs in `BASEMAP_V`** — `/basemap/*` is served
`max-age=86400`, so a file left out of the hash goes stale for a day with no way
for a reader to force it. That is how the map went on printing "Tel Aviv" after
the build had started emitting "Yafa".

## Islands bundling

`scripts/build/islands.js` runs esbuild over the non-underscore island sources,
resolving `@shared/*` to `/shared/`. **MapLibre is not bundled into the island**:
the bare specifier resolves to the copied vendor file, because the worker
MapLibre spawns imports `maplibre-gl-shared.mjs` as a sibling regardless, and
inlining shipped that chunk twice.

`public/island-loader.js` mounts on click, on `[data-island-auto]`, and on the
`zuhd:mount-island` event. The `name` reaches `import()` as a URL segment, so
the `/^[a-z0-9-]+$/` check is what keeps a `data-island` attribute from naming a
path. **The loader discards teardown functions** returned by `mount()`.

## Static checking

`npm run verify` = `lint && typecheck && test`. Added 2026-08-01; before it, 112
`.js` files under `scripts/`, `functions/` and `workers/` were checked by
nothing at all, including `build.js`.

- **Biome's formatter is off, deliberately.** This codebase is hand-aligned
  where the alignment is the argument — the vertex tables in `_map/glyphs.ts`,
  the ramp stops in `_map/style.ts`, the comment prose. A format pass over 171
  files is a diff nobody can review. `organizeImports` is off for the same
  reason. `mobile/biome.json` sets `"root": false` so the two configs coexist.
- **`tsconfig.node.json` is `allowJs` + `checkJs` with `strict` and
  `noImplicitAny` OFF, and that is the design.** The value is in what TypeScript
  *infers* — wrong arity, a property that isn't on the shape — not in extracting
  annotations from 20,000 lines of working pipeline. `strict` would bury those
  under thousands of implicit-any reports and the gate would go unread.
  Instructive finds: `{object}` in JSDoc means TypeScript's *non-primitive with
  no properties*; an em-dash inside a `@param` is TS1127 and **silently discards
  the annotation**.
- **`noUncheckedIndexedAccess` is the one gap left** in
  `tsconfig.islands.json`: 96 errors, concentrated in `_map/prayer.ts`,
  `shared/chart/series.ts` and `_map/places.ts`. `mobile/tsconfig.json` already
  sets it and already includes `../shared/**/*.ts`, so `series.ts` reports 18
  errors there today. Landing it here closes both, and belongs in its own change.
- **`knip.jsonc` is almost entirely `entry`, and that is the shape of the
  problem, not laziness.** Nothing in this repo imports the things that run. A
  script missing from that list is a script knip calls dead — it did exactly
  that to `generate-edu-context.js`, which `run-replay.js` still runs via
  `spawnSync`. `shared/**` is declared `entry` rather than analysed, which trades
  export coverage for not reporting mobile's imports as dead.
- **Test suites bundle islands through `scripts/lib/island-bundle.js`.** The key
  that matters is `alias: { '@shared': … }`, which has to match what
  `scripts/build/islands.js` gives the real bundler — a suite whose alias had
  drifted would be the one place `@shared` resolved differently from the shipped
  bundle. Seven suites had their own copy.
- **CI `paths-ignore: content/**` is load-bearing** — without it the workflow
  runs ~1,800 times a year to check nothing.
