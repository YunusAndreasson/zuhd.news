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
- `comparison` is a second line on the model's own scale (the world's median),
  never a second model laid over it. It widens the domain unless `domain` is
  given, before `reference` is weighed, and reaches no dot, axis or table.
- A series that is a rate, or that crosses zero, sets `change: 'points'`: the
  table's third column is then a difference (`rowChange`), not a percentage of
  last year's inflation. Both tables read `rowChange`; never `stepChange` direct.
- `referenceChange: false` where the rule is a threshold (replacement, 2.1)
  and not a base: the readout then takes no percentage against it.
- `series-chart` draws an indicator's chart unless `chart-source` carries
  `options`, which must be the options the static figure beside it was built
  with. A value's format travels as a name (`formatTrajectory`); `NaN` as
  `null`.
- Chart type is in viewBox units, floored at `--size-3xs` in a box narrower
  than `CHART_W` (`--chart-drawn-w`). The gutters are not, so never raise it.
- A country's trajectory cards (`trajectoriesHtml`, `country-pages.js`) are
  `seriesModel` at build, one column at every width: a half column drops the
  chart's type to that floor and halves its plot. The sentences are
  `shared/countries/country-trajectories.ts`, which names the year it used.
- `marks` (`SeriesMark`) is an annotation on the model's own scale, never a
  second shape: indexed into the source series, dropped outside the drawn
  window, merged where two share an observation, and named in the table.

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
- A record's `deltaLabel` (`stepMoveLabel`) is its last step, in points where
  the unit is `%` and a dash from a base of zero: never a percentage of a rate.
- The step is `stepOf`, read off the series' own dates: two weekly series are
  carried as `daily`, because the shipped app accepts only two cadences.
- A unit is placed by `withUnit` (`series.ts`): a bare currency sign leads its
  figure, anything else follows it. Never append one by hand.

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
- The map's card holds three folds (the story's chart, the country tags, the
  strip) and opening one shuts the others (`fold`, `onExpand`).
- A story's chart (`storyChart`, `chartOf`) is a `sparkline` under the
  title whose press unfolds `buildEntityPanel`: the series the story names,
  else the first it follows with a record, so a story with a series always
  shows one. Its move is the line's own
  (`windowPct`, or `ends` in points for a `%` series), never the record's
  `deltaLabel`. The strip drops the chip for the same id.
- A strait's `/api/entity/cp:*.json` is its week's mean (`trailingMean`,
  `shared/chart/smooth.ts`), cut in `build.js`: a day's count is noise.
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
