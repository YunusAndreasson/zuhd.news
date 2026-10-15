---
paths:
  - "public/islands/situation-map.ts"
  - "public/islands/_map/markets.ts"
  - "public/islands/_map/slow.ts"
  - "public/islands/_map/series-window.ts"
  - "public/islands/_map/format.ts"
  - "public/islands/_map/panes.ts"
  - "public/islands/_map/timeline.ts"
  - "public/islands/_map/feed.ts"
  - "public/islands/_map/sheet.ts"
  - "scripts/lib/map-markets.test.js"
  - "scripts/lib/map-slow.test.js"
  - "public/style.css"
---

# The map's rails: readings, rows, layout, the scrubber, the story list

Camera, MapLibre and cards are `map.md`; layers and marks are `map-layers.md`.

## What a reading means

- A rail row's figure, the panel's composite and the indicator card's hero
  come from `sparkInput` and `readingOf` (`_map/markets.ts`), over the rail's
  one range. **Never add a second calculation**; `sparkPct` is `sparkline`'s
  own first lines.
- One exchange is `exchangeReading`: its mark, its panel row, the up and down
  counts and its card's hero all take it, over the range. A quote panel's rows
  and a group's net tick are still the day's move.
- The window is calendar days, not observations. Dates are rebuilt by
  `seriesDates` (`_map/series-window.ts`) from `asOf`. If one member's labels
  fail to parse, the whole row falls back to the full published series; never
  mix dated and undated members.
- A block's window should end on `blockEdge` (`lastTradedDay`), the last day
  that block traded, not on the wall clock: weekday series blank every Sunday
  and Monday otherwise. The edge is per block, never per row, or a stale
  series redraws as fresh. The exchange row, `world` and the straits pass
  one; an indicator card windows on its row's `entry.edge`.
- The exception is one exchange read alone (`exchangeReading`): it windows on
  its own last session, or a market shut since Thursday is blank on Friday.
  What keeps a dead series from reading as fresh there is
  `EXCHANGE_DEAD_DAYS` (`STRAIT_DEAD_DAYS` for a strait). **Never gate a
  reading on `staleLabel`**: that is when to print an age, three days at every
  range up to a month, and it blanks a market after any long weekend.
- A stale row prints its age (`staleLabel`). Do not add a carry-in on the
  `covered` gate: it draws a stub.
- A row with nothing in the window prints `.map-markets-nil` and its age, no
  tick, no figure. A calendar step needs two observations inside the window,
  or `windowByDate`'s two-point floor labels an older move as this period's.
- A monthly series (`copper`, `wheat`, `rice`) stays out of daily rows
  (`worldEntries`). Wheat and rice are rows of `economy`.
- A weekday group (`TICKER`'s `weekday`, `companyEntries`) carries one `edge`
  on every daily row: its rail row, its panel's figure and its cards window on it.
- A row with a `step` is outside its group's edge, reading and counts
  (`groupSummary`): a week's move is never counted as a day's.
- The companies' edge is the day at least half the list closed on, never the
  newest close: four calendars, and the newest day belongs to a handful.
- The exchanges' panel asks `lastTradedDay` at the press (`PanelEdge`): on a
  weekend the wall clock gives the row and its panel different moves.
- A series that steps by the week says `on the week` on its quote row
  (`TickerEntry.step`): a week's move in a column of days is read as today's.
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
  own window change, of the week's mean (`straitSeries`): a day's ship count
  is noise. Never print `delta7vs90` on a row.
- The indicator card's hero uses the rail's window, and so does the exchange
  card's (`heroDays` when it was opened from a mark, whose chart keeps the
  whole quarter). With no reading it is the last session's move and names no
  period. The strait card's does not. `CARD_MIN_DAYS` floors the chart only.
- The exchange card leads with the index's definition (`ex.standing`),
  falling back to the exchange's `blurb`.
- A pinned exchange or strait card sets its move against 1, 7 and 30 days
  (`movesRow`), each the reading the rail would print at that range
  (`exchangeReading`, `straitReading`), and says a record that has stood a
  month (`recordLine`, `shared/chart/record.ts`). A range with no reading
  keeps its column, with a dash.
- A card numbers the stories its account was written from, on its chart and
  in its list (`citedOn`), and only where the build says the list is that
  account's citations (`relatedCited`): a dot for a tag match claims a cause
  nobody wrote. A story sits on the observation of its own UTC day
  (`citedMarks`), inside the window the chart opens on, or takes no number.
- The strait card charts `straitSeries`, the series its row and label read,
  and lists the vessel classes that sail there from PortWatch's averages.
- A flagged exchange states its run in the run's own figures (`patternLine`):
  a caption on its panel row and a line under its card's hero. The card has
  one account: the signal's `commentary` with its citations, else the
  exchange's own `recent`.
- The indicator card's `/api/entity/{id}.json` fetch is guarded by
  `indicatorSeq`: a reader presses several rows inside one round trip.
- A card's table states a step as its hero does: `TickerEntry.change` where
  the unit does not say (a lab's index is points, never a percentage).
- A company's list is `Read from` only with `account.cited` (the payload's
  `relatedCited`): an account can outlive its citations.
- A monthly row's card is dated by its month (`monthLabel`): its series is
  stamped the first, and `1 Sep` reads as a day.

## The slow blocks

- `economy` and `ai` do not follow the range. Each row reads over its own
  period (`TickerEntry.own`, `_map/slow.ts`), which its block's heading names
  once (`slowHead`). **Never window one on the range**: a monthly series has no
  two observations in three days.
- They stand under every daily block of the money box and above
  `.map-signals`. A list is one row that opens it; a list of one opens that
  series' card (`fillSlow`).
- A slow move is the difference of the two printed readings, at the places the
  series is published to (`pointsFigure`). Never `ribbonPoints`, which rounds a
  cut of two and a half points to three.
- A move in points sets `OwnReading.pct` to ±1 or 0: `FLAT_PCT` would draw a
  tenth of a point as no move.
- A month is never compared across a gap, and a list's figure is taken at the
  newest month every row has (`groupMove`): the Fed's series ends a month
  before the BIS's.
- A slow row in a list prints its level, its move and the month it is of
  (`slowRow`). No move is no tick.
- The economy block is built once per payload (`slowFrom`), not per range
  press, which would close an open list.
- An AI row is a lab, in the payload's order, with no rank. A lab without the
  whole 90 days is left out of the average and says its own window
  (`aiSummary`, `aiScoreChange`).
- The card of a row with `own` states that reading and its period, and draws
  the whole series with no rule at an open. A row with `account` asks
  `/api/entity` for nothing.

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
- The companies' row has a fixed slot under `markets` (`companiesItem`); the
  trend groups are re-sorted after it. Both kinds are made by `groupSummary`.
- `companies` and `energy` are rail-only (`.map-markets-rail-only`,
  `railOnly`): a fifth group takes the phone's money line to a second line.
- A money row carries no switch and a `layers` chip carries no reading. A
  `<button>` inside a `<button>` is dropped by the browser.
- Nothing in `layers` draws a trend. Only the story category chips do
  (`countTrend`), tinted by the chip's `--cat`, never `--map-pos` or
  `--map-neg`: a green rise in a hazard is a verdict. `.map-filter-spark` is
  always appended and falls back to `--map-ink-dim`, not `currentColor`.
- **Never** a prayer-times column in the rail: the `prayer-lines` hover gives each time where it is true.
- One column always: no two-abreast `auto-fill` money grid.
- Every row in the wide rail is a grid on `--map-rail-cols` (label, level,
  tick, figure, age, caret), and `.map-markets-move` is `display: contents`,
  so each column keeps one x down the rail. A row with no age leaves the cell
  empty. Size a track to the widest value it prints.
- A phrase is a `.map-markets-caption` across the label and level tracks, so
  it wraps, clamped at two lines. Never hold it to one line or invent a short
  label.
- These rows are `<button>`s, which centre their text; a fixed-width label or
  level needs `text-align`.
- The spine restates `display: flex` on the row and the move: it stacks a name
  over its reading and takes no columns.
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
- A capped scroller (card, docked sheet, group panel) ends in a sticky foot
  (`--card-foot`): it is the bottom padding, so never add padding beside it.
- The two `.map-mapctl` boxes are capped against the canvas between the rails
  (`100%` is the window), and `is-right` also against `layers` open.
- A card opened from a rail row is docked (`docked()`, desktop only) with the
  same hand-wired Escape; a card from a mark stays `showModal()`. Panel rows
  anchor to `openOn`, because the pressed row is leaving the document.
- An exchange's card pinned from its mark is docked too, with no row
  (`dockTo(null)`, `.is-corner`): no backdrop, in its peek's corner. A press
  on the map does not shut it (`onDocDown`); a click on open water does.
- The `markets` switch must not hide the money block (`applyLayerVisibility`).
- A folded instrument rail is a spine (`--map-spine-w`): the clock, the events
  and `.map-signals` go, the money keeps tick and figure.
- **Never hide a control in the spine**: the range chips and `key` stand on
  the map and outlive the fold.
- Seams (`_map/panes.ts`) write `--map-rail-user` and `--map-aside-user`,
  never the properties the layout reads. No `preventDefault()` on
  `pointerdown`: it kills the double-click reset.
- The rails float over a full-width `.map-canvas-host` at 80% of
  `--map-sunken`. That is a contrast floor for `.map-feed-count`: lift the
  quiet inks before lowering it. `applyPadding` measures both rails.
- The phone's `--map-head-h`, `--map-bar-h` and `--map-gutter` on
  `body.map-page` are the one statement of those heights.
- Both rails' top band is `--map-band-h` (taller on a day with a briefing), so
  the two hairlines and the first headings sit level. Both rails' inner edge
  is `--map-gutter-x`.
- A heading stands `--map-block-gap` under the block above and
  `--map-head-gap` over its rows: about five to one, or proximity stops
  saying which rows it names.

## Time range and scrubber

- One time range governs the whole page: beacons, story list, every rail
  window but the slow blocks'. `setRange` is the only place it is written, and
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

## Payloads

- `/api/companies.json` and `/api/ai-models.json` are fetched only in the wide
  layout (`fetchRailLists`), and only when
  `data-feeds` on the shell names them (`mapFeeds` in `build.js`): the build
  writes each only where its snapshot exists, and a fetch that misses is a
  404 `npm run perf` reports.

## The story rail and refresh

- A row is title and `loc · age`. **No sentence under the headline**: the
  rail is scanned for a story to open, and the card has the prose.
- On the desktop the rule between stories starts at the headline's edge
  (`.map-feed-item::after`); the filters' and the head's rules span the rail.
- The list is a keyed patch by slug, never `replaceChildren`; rows move with
  `moveBefore` where it exists. A rebuild drops hover and scroll anchoring
  on every scrub frame.
- The list has delegated listeners only: a per-row closure reports the
  `MapPoint` a reused row was built with.
- `.map-feed-count` is `aria-live`: write it only when the text differs. On
  the desktop it is said and not shown (`body.map-wide .map-feed-count`); on a
  phone it is the drawer handle's label.
- On the desktop the head keeps no row of its own: refresh is placed at the
  end of the `stories` heading's line (`body.map-wide .map-feed-refresh`,
  `top: 100%`), by CSS and not by moving it.
- Category chips live in `feed.filterHost`, outside the scrolling list. Find
  a chip with `container.querySelector`: `filters` holds only layer chips.
- Refresh refetches `map.json` with `cache: 'no-cache'`, or the browser
  cache answers for five minutes. The first load does not revalidate.
- Refresh never moves the reader: the head follows only at the live edge.
  Ask `timeline.isLive()` each time; a cached flag is wrong before a touch.
- Refresh merges `archivePoints` back in, or 90d collapses to a fortnight.
- The button says what it found, `nothing new` included. It is a sibling of
  the disclosure in `.map-feed-head`, never nested in it.
