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
| `scripts/lib/json-file.js` | `readJson`, atomic `writeJson` |
| `scripts/lib/http.js` | fetch with a deadline and a user agent |
| `scripts/lib/article-files.js` | the corpus window by filename |
| `scripts/lib/trends-snapshot.js` | the newest `content/trends/*.json` |
| `scripts/lib/hash.js` | sha1 cache keys |
| `public/islands/_dom.ts` | `el`, `svgEl` |
| `public/islands/_entity-panel.ts` | the `follows` panel |
