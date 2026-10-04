---
paths:
  - "public/islands/situation-map.ts"
  - "public/islands/_map/markets.ts"
  - "public/islands/_map/series-window.ts"
  - "public/islands/_map/format.ts"
  - "public/islands/_map/panes.ts"
  - "public/islands/_map/timeline.ts"
  - "public/islands/_map/feed.ts"
  - "public/islands/_map/sheet.ts"
  - "scripts/lib/map-markets.test.js"
  - "public/style.css"
---

# The map's rails: readings, rows, layout, the scrubber, the story list

Camera, MapLibre and cards are `map.md`; layers and marks are `map-layers.md`.

## What a reading means

- A rail row's figure, the panel's composite and the indicator card's hero
  come from `sparkInput` (`_map/markets.ts`), over the rail's one range.
  **Never add a second calculation**; `sparkPct` is `sparkline`'s own first
  lines. Panel rows, the up and down counts, the net tick and the exchange
  card's hero are the day's move, whatever the range.
- The window is calendar days, not observations. Dates are rebuilt by
  `seriesDates` (`_map/series-window.ts`) from `asOf`. If one member's labels
  fail to parse, the whole row falls back to the full published series; never
  mix dated and undated members.
- A block's window should end on `blockEdge` (`lastTradedDay`), the last day
  that block traded, not on the wall clock: weekday series blank every Sunday
  and Monday otherwise. The edge is per block, never per row, or a stale
  series redraws as fresh. Today only the exchange row and `world` pass one;
  an indicator card windows on its row's `entry.edge`.
- A stale row prints its age (`staleLabel`). Do not add a carry-in on the
  `covered` gate: it draws a stub.
- A row with nothing in the window prints `.map-markets-nil` and its age, no
  tick, no figure. A calendar step needs two observations inside the window,
  or `windowByDate`'s two-point floor labels an older move as this period's.
- A monthly series (`copper`, `wheat`, `rice`) stays out of daily rows
  (`worldEntries`).
- A series quoted in `%` reports its change as a difference (`ribbonPoints`,
  `pts`), from `SparkInput.ends`. `ends` is absent on a composite, which is
  rebased to 100.
- At the 24h step only the drawn slope is clamped (`DAY_SLOPE_CAP`), never
  the printed figure.
- A composite (`meanIndex`) is as long as its shortest member, so
  `sparkInput` drops members under four fifths of the median length, keeps
  all if fewer than two survive, and states the bound (`members`) in the label.
- Feed the currency composite `TickerEntry.values` (the inverted series) and
  leave `usd-index` out of the composite; `summarise` still counts it. Nothing
  checks either.
- FX is published `X / USD`: `invert: true` flips the figure and the card's
  series.
- A group's net tick is the mean of the displayed percentages (`summarise`),
  not derived from the up and down counts.
- `odds` and `attention` are a rule over the payload (`selectEntries`), not a
  catalog, because the ids rotate. Rank through `sparkInput` over the current
  window, ties on id. `MIN_SELECT_POINTS` sorts a young series last and never
  excludes it.
- Attention ranks on percent change above `MIN_ATTENTION_LEVEL`. The floor
  reads the published `ind.values`, never `sparkInput` output, which is
  rebased to 100 and empties the block in silence. Do not rank on views moved
  or on a z-score: each prints the same large articles every day. Odds rank
  on `points`.
- `attention` returns nothing at the 24h step: that move is the weekday.
- An odds label keeps its deadline (`oddsShort`). Its disclosure is
  `TickerEntry.caveat`, never `note`, which the dispatch's `standing` replaces.
- A story chip's count is judged by halves (`halfOverHalf`), bucketed across
  what the payload covers, not the range asked for. An empty first half prints
  no figure.
- Straits are picked by `delta7vs90` (`chokepointEntries`) and each prints its
  own window change. Never print `delta7vs90` on a row.
- The indicator card's hero uses the rail's window; the exchange and strait
  cards do not. `CARD_MIN_DAYS` floors the chart only.
- The exchange card leads with the index's definition (`ex.standing`),
  falling back to the exchange's `blurb`.
- The indicator card's `/api/entity/{id}.json` fetch is guarded by
  `indicatorSeq`: a reader presses several rows inside one round trip.

## Rows and columns

- The rail draws no shapes. A row is tick, figure and age in
  `.map-markets-move`; the shape is on the card or in
  `.map-markets-panel-figure`, built at open from the current range.
- Every row says direction twice, by `toneClass` and by the tick. `--map-pos`
  and `--map-neg` mean the number rose or fell, not a verdict. The tone sits
  on `.map-markets-move` only: a label, a level (`.map-markets-level`) and an
  age are not signed quantities.
- The tick is drawn at zero too (`tick-flat`, `FLAT_PCT`), or that row's figure
  leaves the column.
- `.map-markets-summary > .map-markets-tick` is hidden in the rail and still
  built: on the phone strip it is the only direction channel.
- A money row carries no switch and a `layers` chip carries no reading. A
  `<button>` inside a `<button>` is dropped by the browser.
- Nothing in `layers` draws a trend. Only the story category chips do
  (`countTrend`), tinted by the chip's `--cat`, never `--map-pos` or
  `--map-neg`: a green rise in a hazard is a verdict. `.map-filter-spark` is
  always appended and falls back to `--map-ink-dim`, not `currentColor`.
- **Never** a prayer-times column in the rail: the `prayer-lines` hover gives each time where it is true.
- One column always: no two-abreast `auto-fill` money grid.
- A code sits in the label column (`--map-row-label-w`, measured from the
  widest code). A phrase is a `.map-markets-caption` in a grid row, so it
  wraps, clamped at two lines. Never hold it to one line or invent a short
  label.
- These rows are `<button>`s, which centre their text; a fixed-width label or
  figure needs `text-align`.
- Flex wraps on an item's base size before it shrinks. `min-width: 2.2rem` on
  `.map-markets-window` is the widest natural figure; raising it wraps rows.
- `odds` and `attention` rows print the movement; the level is on the card.
- `.map-markets-item` is `display: contents; gap: inherit` outside the rail.
  `.map-markets-group` reads its parent's gap, so the wrapper must pass it on.
- `trigger` adds a click listener on every call. Call it once per element and
  read `last*` through thunks; a doubled listener opens and closes the panel
  in one press.

## Layout, panels and controls

- There are two layouts and one threshold: `syncWide` sets `body.map-wide`
  from `NARROW_PX`. Never gate a layout on the window's shape.
- `syncWide` runs before `new MapLibreMap` (the opening zoom is `minZoom` and
  `fitZoom` reads the canvas's shorter side) and before `map.resize()` in
  `onResize`.
- `body` is an element: `body.map-wide .x` scores (0,2,1) and beats two
  classes.
- Width taken from the canvas costs the globe nothing until the canvas is
  square. `--map-aside-w` is capped at what its contents want.
- The rail holds readings only. Whatever configures the map stands on the map:
  `layers` in `.map-mapctl.is-left`, the ground picker with `key` and the
  legend in `.is-right`, the range on the scrubber.
- Controls are moved, not copied (`placeMapControls`, `placeRangeGroup`,
  `placeMarketStrip`). Below `NARROW_PX` the map's controls return to
  `.map-hud-more` and the strip goes to `timeline.head`; the range chips stay
  on the scrubber. Nothing is hidden on a phone that the reader cannot reach.
- Controls stay in sight. Explanations (`.map-key`, the ground note) fold
  behind the disclosure, which opens `.map-hud-more` on the phone and
  `.map-hud-legend` on the desktop. `is-open` goes on both; each is a
  `display: contents` pass-through in the other layout.
- `mapEl`'s `pointerdown` dismiss returns early inside either `.map-mapctl`.
- `layers` opens in place. **Never a modal**: the reader watches the map
  change.
- The group panel is a non-modal `<dialog>` on `document.body` (`show()`), so
  it escapes the rail's overflow. Escape and the light dismiss are wired by
  hand, the dismiss on `pointerdown`, never `click`.
- The panel hangs off the rail's inner edge (`setDock`); the row decides the
  top (`dockedPanelTop`). Place it after `show()`, or its height is zero.
- A card opened from a rail row is docked (`docked()`, desktop only) with the
  same hand-wired Escape; a card from a mark stays `showModal()`. Panel rows
  anchor to `openOn`, because the pressed row is leaving the document.
- The `markets` switch must not hide the money block (`applyLayerVisibility`).
- A folded instrument rail is a spine (`--map-spine-w`): the controls and
  `.map-signals` go, the money keeps tick and figure.
- Seams (`_map/panes.ts`) write `--map-rail-user` and `--map-aside-user`,
  never the properties the layout reads. No `preventDefault()` on
  `pointerdown`: it kills the double-click reset.
- The rails float over a full-width `.map-canvas-host` at 80% of
  `--map-sunken`. That is a contrast floor for `.map-feed-count`: lift the
  quiet inks before lowering it. `applyPadding` measures both rails.
- The phone's `--map-head-h`, `--map-bar-h` and `--map-gutter` on
  `body.map-page` are the one statement of those heights.

## Time range and scrubber

- One time range governs the whole page: beacons, story list, every rail
  window. `setRange` is the only place it is written, and
  `createMarketStrip` takes `rangeDays` with no default.
- The range chips (`.map-range-group`) go in `timeline.controls`, never
  `timeline.head`, which on a hover-capable desktop is `opacity: 0` until
  hover or focus. The timeline is rebuilt on refresh, so `placeRangeGroup`
  moves them back each time.
- 30d and 90d need `/api/map-archive.json`, fetched on the first press. Keep
  it out of `map.json`, which blocks first paint.
- `build.js` parses the archive light (`parseFrontmatter`, not
  `buildArticle`) and ranks it through the fortnight's `coverageRanks`, so a
  radius means one thing at every range.
- `railStart()` is the larger of the range and `BUILD_WINDOW_HOURS` (the
  build's `BUILD_WINDOW_DAYS`). A rail that is only the range has no band.
- The band and the bars key on `windowStart` to the head, not on before or
  after it. Out-of-window bars step down to `--map-line`, never fade.
- `readPalette` reads `--map-*` tokens: the site's `--rule` and `--text-dim`
  are invisible on this page.
- The scrims on `.map-hud` and `.map-timeline` fade in an overhang outside
  the box: padding would move all that reads `--map-scrub-h`.

## The story rail and refresh

- The list is a keyed patch by slug, never `replaceChildren`; rows move with
  `moveBefore` where it exists. A rebuild drops hover and scroll anchoring
  on every scrub frame.
- The list has delegated listeners only: a per-row closure reports the
  `MapPoint` a reused row was built with.
- `.map-feed-count` is `aria-live`: write it only when the text differs.
- Category chips live in `feed.filterHost`, outside the scrolling list. Find
  a chip with `container.querySelector`: `filters` holds only layer chips.
- Refresh refetches `map.json` with `cache: 'no-cache'`, or the browser
  cache answers for five minutes. The first load does not revalidate.
- Refresh never moves the reader: the head follows only at the live edge.
  Ask `timeline.isLive()` each time; a cached flag is wrong before a touch.
- Refresh merges `archivePoints` back in, or 90d collapses to a fortnight.
- The button says what it found, `nothing new` included. It is a sibling of
  the disclosure in `.map-feed-head`, never nested in it.
