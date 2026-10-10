# CLAUDE.md

zuhd.news: a minimalist, typography-first global news site, written by an
editorial pipeline and read on the web and in an app. Philosophy in
`foundation.md`; hosting, sources and operator detail in `DEV.md`.

## Decisions

- Single-family sans-serif typography, no images unless informational
- Smart Brevity format: hook, why it matters, mechanism, what's next, then the
  sources, with an optional counterpoint-or-quote block between the mechanism
  and what's next. Budgets live in `scripts/write-prompt.md`
- English first, global hard news only. Categories: politics, economy, science, tech
- No CMS, no database, no framework — content is files + a node SSG (`scripts/build.js`)
- Content: markdown + YAML frontmatter in `content/articles/`, built to `dist/`

## Working here

Three surfaces, and almost nothing that matters in one matters in the others:

- **Web**: `public/`, `templates/`, `functions/`, built by `scripts/build.js`.
- **Pipeline**: `scripts/` and `content/`. Selector, writer and editor stages
  run through the `claude` CLI with node scripts between them: a stage list
  (`scripts/cycle/stages.js`) that `scripts/run-cycle.sh` starts.
- **App**: `mobile/`, which has its own `CLAUDE.md`, commands and tests. Start
  Claude in `mobile/` for app work.

The pipeline runs on a remote server, not on this machine: five cycles a day,
committing to `master` as `zuhd.news editor` and touching only `content/` (the
daily tuning stage may also merge experiment edits to tunables in `scripts/`).
So `master` moves under you: pull before you push. Don't run the cycle here;
prove a stage with its test, or with its `--dry-run` where it has one.

Verify before calling work done. Run `npm run verify` (here, or in `mobile/`
for the app). Tests do not see CSS or layout: for a visible web change, run
`npm run dev` and look at the page in a browser.

A commit subject names the surface and states what is now true: `mobile: a
menu row that opens a list names what leads it`, `Pipeline: policy rates from
the BIS`, `Build: each country's hunger caseload on /api/ipc.json`. The
reasoning, the measurements and what was tried go in the body, never in an
instruction file.

## Commands

Run at the repo root. `mobile/` has its own.

| | |
|---|---|
| `npm run dev` | watch + local server (`SKIP_OG=1`) |
| `npm run build` | `scripts/build.js` → `dist/` |
| `npm run verify` | `lint && typecheck && test` — run before committing |
| `npm run lint` | Biome, **linter only** (`biome.jsonc`); formatter is off on purpose |
| `npm run typecheck` | three projects: `tsconfig.islands.json` (islands + `shared/`, strict), `tsconfig.node.json` (`allowJs`+`checkJs`, `strict` OFF) and `tsconfig.pipeline.json` (the pipeline's typed core, strict; a file joins once everything it imports is clean) |
| `npm test` | `node --test scripts/lib/*.test.js`; one file: `node --test scripts/lib/<name>.test.js` |
| `npm run test:unit` | the tests that need only the source; what CI runs |
| `npm run test:live` | the ratchets over the live corpus, `logs/` and `/tmp` |
| `npm run test:cycle` | the orchestrator against its recordings (`scripts/lib/fixtures/cycle/`); needs root, takes minutes |
| `npm run deadcode` | knip (`knip.jsonc`) — unused files, exports and dependencies |
| `npm run deadcode:css` | dead CSS, measured in a browser — report only, never a gate |
| `npm run publish` | build + `wrangler pages deploy dist` (branch `master`) |
| `npm run perf` / `perf:idle` / `perf:profile` | browser instruments in `scripts/perf/` |

CI (`.github/workflows/checks.yml`): lint, typecheck, deadcode, `test:unit`,
build. `test:live` is deliberately not in CI — `logs.test.js` reads gitignored
`logs/` and `corpus.test.js` ratchets against the live corpus.

## Gotchas

- **The JSON APIs are a published contract**: the app is live in both stores.
  Add endpoints and optional keys; do not change shapes. Article fields come
  from one `apiCategories` object in `build.js`, so `feed.json` and
  `feed-lite.json` cannot drift.
- Before deleting code a tool calls dead, follow "Deleting code safely" in
  `.claude/rules/web/build.md`. knip, Biome and `deadcode:css` have each
  produced a confident false positive, and nothing checks a CSS rule or a
  custom property.
- When you add a script, an island or a shared module, add it to `entry` in
  `knip.jsonc`. They are reached by name, not by import, so knip calls a
  missing one dead.
- Move the cache key when what it keys changes. Bump by hand: `IG_VERSION`,
  `OG_VERSION` (in `build.js` and in `build/country-pages.js`) and `?v=` on
  `/og-image.png`. `BASEMAP_V` and `ISLAND_V` are content hashes: add every new
  input file to the list they hash.
- Tests pin real bugs. Baselines are observed values, not targets: if one
  fails, fix the cause, don't raise the number.
- Check `scripts/lib/` and `public/islands/_*.ts` before writing a helper:
  most small utilities already have one home
  (`.claude/rules/shared-modules.md`).

## Shared datasets (`/shared/`)

Single source of truth for web + mobile. Mobile imports via `@shared/*`
(path-mapped); web reads relative paths, transpiling TS through
`scripts/build/shared-ts.js`.

`data/*.json` (Natural Earth TopoJSON) · `countries/*` (country data and 27
ranked metrics) · `chart/*` (the one chart and rank bar, as arithmetic) ·
`globe/coordinates.ts` · `place-names.ts` · `genocide.ts` · `share.ts` · `types.ts`

## Deploy

- **Site:** `npm run publish`. Production branch `master`; the pipeline deploys each cycle.
- **MCP worker:** `npm run deploy` inside `workers/mcp`.
- **`workers/share-preview`:** retired — do not deploy.
- Dashboard: port 7777 on the server's public address, read-only and without a login (`DASHBOARD_HOST` in `zuhd-dashboard.service`), `scripts/dashboard/`.
- Experiments: one at a time in `content/.experiments.json`; create with `/experiment`.

## Rules that load with the files they cover

The rules for each surface live in `.claude/rules/`, scoped by `paths:`
frontmatter so they enter context only when you read a file they cover.

| | |
|---|---|
| `.claude/rules/web/` | the map (`map`, `map-rail`, `map-layers`), `sky`, `prayer`, `hijri`, `charts`, `design-system`, `share-surface`, `islands`, and `build` (routes, JSON APIs, caches, static checks) |
| `.claude/rules/pipeline/` | `stages` (the stage list), `cycle` (what stages assume), `articles` (the body's shape, the isnad, corrections) |
| `.claude/rules/mobile/` | the app's `globe`, `story-deck` and `instruments` |
| `.claude/rules/shared-modules.md` | the index of shared helpers |
| `mobile/CLAUDE.md` + `mobile/DESIGN.md` | the app — read DESIGN.md before any UI change |

Adding to one of these is almost always right; adding to this file is almost
always wrong. A rule there is one or two lines: what to do, the symbol, and a
clause of why.
