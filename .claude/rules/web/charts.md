---
paths:
  - "shared/chart/**"
  - "public/islands/_chart.ts"
  - "public/islands/_spark.ts"
  - "public/islands/_map/popup.ts"
  - "public/islands/series-chart.ts"
  - "public/islands/_entity-panel.ts"
  - "public/islands/entity-strip.ts"
  - "public/islands/_disclosure.ts"
  - "scripts/build/entity-pages.js"
  - "scripts/build/country-pages.js"
  - "scripts/lib/chart.test.js"
  - "scripts/lib/disclosure.test.js"
---

# Charts

One series chart for the whole site: `shared/chart/series.ts` is the
arithmetic, `public/islands/_chart.ts` the browser, `_spark.ts` the sparkline.
The rail's readings are `map-rail.md`.

## One chart

- **Never recompute** a domain, scale or window in a surface. `seriesModel`
  owns the arithmetic and emits SVG nodes as data; a surface is an adapter
  (`renderNode`, `staticFigure`). Three copies drifted into three charts.
  Pinned in `chart.test.js`.
- `shared/chart/` holds no DOM and is typechecked by `mobile/` under
  `noUncheckedIndexedAccess`; the app imports `dataDecimals`.
- **Never `preserveAspectRatio="none"`** on a chart: it stretches the axis
  type and draws dots as ellipses. `_spark.ts` is the one exception.
- Colour is a class, never an attribute: marks take `currentColor`, and the
  `--chart-*` tokens are aliases each palette resolves in `style.css`.
- A chart that can only be looked at is half a chart: a card whose subject is
  a series uses `createChart`. A summary over a list uses `sparkline`.
- A second shape gets a second module rather than a `type` field on
  `seriesModel`. `shape: 'bars'` in `_spark.ts` is the argued exception.

## What the numbers mean

- The `reference: 'open'` trap: a numeric `reference` is external and never
  moves with the range; `'open'` is the first value drawn, recomputed per
  window, as is `direction: 'window'`. A figure beside a chart comes from
  the same model and window (`windowPct`, `sparkPct`).
- The range control counts observations (`WINDOW_STEPS`), not days. A card
  opened from a rail row converts the rail's days (`cardWindow`).
- The axis rounds and the table does not: `axisDecimals` is for three gutter
  labels; the readout and table print `formatExact`, the decimals the source
  published.
- `domain` replaces the scale and nothing else: the axis and the rings stay
  on observations. A pair that is not finite and ascending is ignored.
- The caption is provenance and what the rule marks, never dates or change:
  those go stale when the range moves.
- `/e/{id}` ships `staticFigure` whole, table included, with no script.
  `series-chart` replaces it and does not hydrate it.
- `entity-pages.js`, `series-chart.ts` and `buildEntityPanel` pass the same
  `reference`, `direction`, `palette` and `step`. Nothing checks that.

## Sparklines

- `sparkline` rescales `seriesModel`'s points into its own box. `none` is
  right there because the height is fixed in CSS and the box holds no text
  and no `<circle>`: the end dot is a zero-length round-capped stroke
  (`.spark-dot`). Pinned in `map-markets.test.js`.
- Each spark autoscales, so amplitude is not comparable across rows; the
  printed figure carries magnitude. The period is the rail's calendar window
  (`map-rail.md`).
- A level gets a line and a count gets bars; the caller floors a count's
  `domain` at zero.
- The area is decoration: a fill from the line to the window's open and a
  hairline at it were both rejected. Each gradient needs its own id
  (`fillSeq`).

## Disclosures

- `disclosure()` is one panel for many triggers; `seq` lets a trigger
  pressed mid-fetch win. Pinned in `disclosure.test.js`.
- **Never a dialog** over the story being read: a `follows` chip unfolds its
  chart under the strip, on the article and in the map's story card.
  There is no entity sheet.
- An ordinary click never navigates and a modified click always can: chips,
  country tags and `moreLink` keep their real `href`.
- The click handler must `stopPropagation()`: a country tag is also a
  `data-island` trigger, and the loader would open its sheet.
- `scrollIntoView` is for the map's card only, which is capped at 50vh: on
  an article it lurches the page.
- `buildEntityPanel` is the contents on both surfaces: the chart and `recent`
  first, provenance and eight mentions behind `moreLink`, no `standing`. Only
  `classes` and `mentionLink` differ.
- The map's mention row flies (`openStory`) and stays a link when the slug
  is not loaded. It checks no filter.
- In the story card the country panel leads with `standingFor`'s metric,
  then four highlights and no `coverage`.

## The rank strip

- `rankStrip` (`shared/chart/rank-strip.ts`) means the rank: rank 1 is a full
  bar. Never merge it with `country-metrics.js`'s `p`, position on the value
  scale. It is `aria-hidden`: the rank is printed beside it.
