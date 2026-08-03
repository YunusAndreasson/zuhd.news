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

## Deleting code safely

Four kinds of dead code, three tools, and the gaps are as important as the
coverage. Established 2026-08-03, after removing the map's top-strip layout —
where `--map-status-w`, `--legend-x`, `anchorLegend`, the `max-width: 1250px`
block and `.map-filters { display: contents }` were all found **by reading**,
because the only tool that could have found any of them was switched off and the
one that could have found the rest did not exist.

| What | Caught by | Gated in CI |
|---|---|---|
| Unused file | `npm run deadcode` (knip) | yes |
| Unused dependency | `npm run deadcode` | yes |
| Unused **export** | `npm run deadcode` — **on since 2026-08-03** | yes |
| Unused local / import / parameter | `npm run lint` (Biome `noUnusedVariables`) | yes |
| Unused **CSS rule** | `npm run deadcode:css` — report only, run by hand | **no** |
| Unused custom property | nothing | no |

**Exports were off because the report was 79 findings of noise.** Nearly all of
them were module-internal constants that happen to carry `export`
(`markets.ts` alone had fourteen). `ignoreExportsUsedInFile: true` takes it to
**2**, and a 2-finding report is one somebody reads. The two survivors were
*both false positives*, which is the whole reason there is a protocol below
rather than a habit of trusting the tool:

- `placeDensity` is pinned by six assertions in `map-geo.test.js`, reached
  through the esbuild bundle `island-bundle.js` builds at run time — a string
  path, not an import edge.
- `MARKET_CHIP_GLYPHS` is a `satisfies` assertion whose value is never read on
  purpose; deleting it deletes a compile-time check.

Both are suppressed with `@knipignore`, and **the rule is that the comment above
the tag says why**. The tag records that a human checked; the sentence is what
the next person needs. A bare tag is worse than the finding it silences.

**The protocol.** Before deleting anything the tools have not proved dead:

1. **Grep the whole repo, not the workspace** — including `mobile/`, `scripts/`
   and `.claude/`. `shared/**` is declared `entry` to knip precisely because
   mobile's `@shared/*` imports are invisible here, so knip reports *nothing*
   about it and a grep is the only check there is.
2. **Ask what reaches it that is not an import.** This repo is full of edges no
   analyser can follow: `run-cycle.sh` invokes scripts by name, `spawnSync` in
   `run-replay.js`, `island-loader.js` fetching bundles by string path,
   `island-bundle.js` re-bundling modules for tests, `data-island` attributes,
   CSS class names assembled from data. Every one of those has produced a false
   "dead" finding at least once.
3. **Ask whether the value is the point.** A `satisfies` const, a type-only
   export and a rule that exists to be overridden all look unreferenced.
4. **Delete, then run the gate that would have caught the mistake** — for CSS,
   that is a `deadcode:css` re-run *and* a `shoot.mjs` pass, because a stylesheet
   has no type system and a wrong deletion renders silently.
5. **If it survives all four and still cannot be deleted, tag it and write the
   reason.** The next person then inherits the answer instead of the question.

**`npm run deadcode:css` is a candidate list, never a verdict**, and it is
report-only for that reason. It drives a real browser over the built `dist/` and
uses `CSS.startRuleUsageTracking` — the mechanism behind DevTools' Coverage
panel — to record which rules ever *matched*, then reports the difference. A
static approach is not available: class names are built from data
(`map-markets-spark${toneClass(pct)}`), so a grep finds strings that never
render and misses rules that do. PurgeCSS is exactly that static approach and is
the reason it was not used.

**It reports uncovered *byte spans*, not unused selectors, and that was the
second correction.** Two earlier versions tried to name what was unused by
slicing each covered range and taking the text before its `{` — which is a CSS
parser written badly. A covered range can span a *grouping* rule, so the
"selector" came back as `(min-width: 641px)`; `.article-sources`, plainly on the
article page and plainly covered, never produced a key that could cancel the one
the rule list produced; and the run confidently reported 273 dead rules of which
the first dozen checked were all alive. **A dead-code tool that reports live code
is worse than none**, because the next person deletes something. DevTools'
Coverage panel and Puppeteer's `stopCSSCoverage` both report bytes for exactly
this reason. Merging the used intervals and inverting them needs no parser at
all, and because the harness serves the *source* stylesheet the gaps are line
ranges in the file you edit.

Before that, the first version reported nothing at all: `stopRuleUsageTracking`
returns **only the rules that were used** — 395 of 395 matched — so "all minus
used" over that array is empty by construction, and a report that cannot produce
a finding reads as proof there is nothing to find.

Comments are never "covered", and this stylesheet is more prose than declaration
in places, so a gap whose text is only comment and whitespace is dropped. That is
the difference between a report of real spans and one mostly saying "the
paragraph above `.map-hud` is not a rule".

Its accuracy is entirely the state sweep in `STATES`, and its failure mode is
one-directional: **a rule can be reported unused because the sweep never opened
the panel it belongs to, but a rule that matched is never reported.** So the
report prints the states it drove beside the findings, and the first question to
ask of any line in it is "which state would have matched this, and did I run
it?". Adding a state is the cheapest way to improve it — the first run reported
the rail ladder's own `(min-width: 901px) and (max-width: 1199px)` block and the
whole 4.4 KB `prefers-reduced-motion` block as dead, both correctly, because no
viewport in the sweep sat in that band and no context had asked for reduced
motion. Adding those two states cancelled both.

**Judge a new state by the byte figure, not the span count.** Coverage is
monotonic; the count is not. Those two states took coverage from 104,716 to
105,143 bytes and the span count from 95 to **105**, because covering the middle
of a large gap splits it into two smaller ones.

Three things about the mechanism, each of which produced a wrong answer first:

- **Tracking must start before the navigation.** Enable `CSS` and call
  `startRuleUsageTracking` on the CDP session, then `goto` — the other order
  parses the stylesheet with nothing counting and the whole file reads as dead.
- **The stylesheet is inlined and minified**, not linked: `build.js` puts an
  86 KB `<style>` block on the page from 240 KB of source. So matching sheets on
  a `/style.css` sourceURL finds nothing (the first run reported a stylesheet of
  zero rules), and `startOffset` is an offset into a text that is *not* the file
  — line numbers derived from it point at the wrong rules.
- **The harness serves the source stylesheet, not the built one**
  (`serveDist({ transformHtml })`). With the minified block swapped back, a byte
  offset *is* a position in `public/style.css` and a line number is a newline
  count. Nothing about which rules match changes — minification is
  selector-preserving — and the report names the rule as written rather than as
  esbuild rewrote it.

Custom properties (`--map-status-w` and friends) are caught by nothing at all,
in either direction — a `var()` with no declaration falls back silently, and a
declaration nothing reads costs nothing visible. Grep both names when you touch
one.
