---
paths:
  - "scripts/**"
  - "public/islands/**"
  - "functions/**"
  - "workers/**"
---

# Shared modules

Check here before writing a helper. Use these instead of a second copy, and
prefer a parameter (class names, a link renderer) over a copy, as
`_disclosure.ts` does.

| Module | Holds |
|---|---|
| `scripts/lib/site-chrome.js` | the footer and the archetype header |
| `scripts/lib/html.js` | `escHtml`, `escXml`, `smartQuotes` |
| `scripts/lib/page-css.js` | the stylesheet without the map's rules |
| `scripts/lib/contrast.js` | WCAG and HSL arithmetic |
| `scripts/lib/regions.js` | lat/lng to region |
| `scripts/lib/concurrency.js` | `runWithConcurrency` |
| `scripts/lib/argv.js` | `--flag value` parsing |
| `scripts/lib/island-bundle.js` | the esbuild + jsdom test harness |
| `scripts/lib/claude-envelope.js` | envelope parsing, `callClaudeJson`, `claudeArgs` (the `claude` argv), and `unquote` and `firstLine` for a model's line |
| `scripts/lib/ig-image.js` | `igCardInputs`, what a story's card is drawn from, and `igLead`, its lead; it never cuts on an ellipsis |
| `scripts/lib/post-log.js` | `postLog`: a log of posts read strictly, written atomically, capped |
| `scripts/lib/social-post.js` | what the posters share: `loadStory`, `writeCopy`, `runPoster` |
| `scripts/lib/serve-dist.js` | the local `dist/` server and its MIME table |
| `scripts/lib/paths.js` | `ROOT` |
| `scripts/lib/json-file.js` | `readJson`, atomic `writeJson`, atomic `writeText` |
| `scripts/lib/http.js` | fetch with a deadline and a user agent |
| `scripts/lib/csv.js` | `parseCsv`, and `csvObjects` with its required columns |
| `scripts/lib/iso-date.js` | `isIsoDate`, the app's own test of a published date |
| `scripts/lib/snapshot-stage.js` | `snapshotStage`: a fetcher's read, freshness gate, empty guard, kept-snapshot line and write |
| `scripts/lib/quote-snapshot.js` | `fetchQuotes`: one Yahoo quote per catalog entry, in turn, with what was left out |
| `scripts/lib/stage-budget.js` | `stageBudget`: one signal a fetcher passes with every request, cut from its stage's `timeout` |
| `scripts/lib/article-files.js` | the corpus window by filename, and `batchFiles`, the cycle's batch |
| `scripts/lib/article.js` | `readArticle`, `visibleText`, `datelineOf`, `stripDateline`, `ARTICLE_CEILING` |
| `scripts/lib/frontmatter.js` | `splitFrontmatter`, `parseFrontmatter`, and the one-key edits |
| `scripts/lib/blocks.js` | `splitBlocks`, `countBlocks`, and how many blocks may ship |
| `scripts/lib/quality-metrics.js` | `articleFlags`: the per-article detectors the weekly scan and the cycle score share |
| `scripts/lib/datasets.js` | `pathOf`: every state location, by name |
| `scripts/lib/models.js` | `modelFor`: every model id, by use |
| `scripts/lib/period.js` | a series' period labels (`dayLabel`, `monthLabel`) |
| `scripts/lib/wikipedia.js` | the Wikimedia user agent and `wikiSummary` |
| `scripts/lib/rss-sources.js` | the RSS outlets, one row each |
| `scripts/lib/prune-cache.js` | `pruneOlderThan`, a ceiling for a file cache |
| `scripts/lib/trends-snapshot.js` | the newest `content/trends/*.json` |
| `scripts/lib/hash.js` | sha1 cache keys |
| `scripts/lib/dispatch.js` | the dispatch stages' loop, prune and answer checks; the INPUT prompt wrapper |
| `scripts/lib/country-hazards.js` | `countryHazards`: the IPC totals, UCDP's week and the GDACS alerts, per ISO2 |
| `scripts/lib/country-codes.js` | ISO alpha-3 to the name a country profile is keyed on |
| `shared/chart/record.ts` | `seriesRecord`, `recordLine`: whether a series' newest reading is a record, and the sentence for it |
| `shared/chart/smooth.ts` | `weekMeanSeries` and `trailingMean`: a daily count that is noise a day at a time (a strait's ships), as the series the build publishes and the map reads |
| `shared/countries/country-trajectories.ts` | `trajectoryCards`: a country's four trajectories as a headline, a sentence and a series against the world's median |
| `shared/countries/country-facts.ts` | the sentences for a country's hunger and conflict counts (`hungerLine`, `conflictLine`, `weekWindow`, `formatPeople`) |
| `shared/sun.ts` | `subsolarPoint` and the solar primitives under it: the one sun the web map and the app's globe draw |
| `shared/prayer.ts` | the five prayer lines (Umm al-Qura), `prayerRuns`, `prayerInstantAt`, `PRAYER_NOTE`; the web cuts them for a flat map |
| `shared/source-framing.ts` | a source's lean and a story's divergence: the thresholds and their words, for the app, the article page and the map's card |
| `public/islands/_dom.ts` | `el`, `svgEl` |
| `public/islands/_entity-panel.ts` | the `follows` panel |
