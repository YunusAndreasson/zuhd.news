---
paths:
  - "public/islands/*.ts"
  - "public/island-loader.js"
  - "scripts/build/islands.js"
  - "scripts/lib/island-bundle.js"
---

# Islands

Interactive enhancements, framework-free where possible, loaded on demand.

- Sources are `public/islands/*.ts`, bundled by esbuild in
  `scripts/build/islands.js` to `dist/islands/*.js`.
- `public/island-loader.js` is on every page. It imports the matching module on
  the first activation of a `[data-island]` trigger, auto-mounts
  `[data-island-auto]`, and listens for `zuhd:mount-island`.
- The loader discards teardown functions, so a long-lived island owns its own
  lifecycle. A Preact `<dialog>` island uses `mountSheetIsland`; a
  framework-free one removes its dialog on `close`, as `doc-sheet` does.
- Shared modules: `_dom.ts` (`el`, `svgEl`), `_disclosure.ts` (one panel, many
  triggers), `_entity-panel.ts`, `_chart.ts`, `_spark.ts`, `_share.ts`,
  `_app-prompt.ts`, and `_framework.ts` (Preact + htm; not `@preact/signals`).
- Shipped: `situation-map`, `entity-strip`, `series-chart`, `country-preview`,
  `doc-sheet`, `share-bar`.
- A new island needs an `entry` in `knip.jsonc`: islands are fetched by string
  path, not imported.
