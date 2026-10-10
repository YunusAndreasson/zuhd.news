---
paths:
  - "mobile/lib/cards/**"
  - "mobile/components/blocks/Trend*.tsx"
  - "mobile/components/blocks/trend-geometry.ts"
  - "mobile/lib/date-format.ts"
  - "mobile/components/cards/**"
  - "mobile/components/CardSheet.tsx"
  - "mobile/components/Menu*.tsx"
  - "mobile/components/InstrumentRow.tsx"
  - "mobile/components/map/IndicatorStrip.tsx"
  - "mobile/components/map/AlertPill.tsx"
  - "mobile/components/{Conflict,Country,Disaster,Entity,Overlay}Sheet.tsx"
  - "mobile/lib/now.ts"
  - "mobile/lib/valence.ts"
  - "mobile/lib/strip-snap.ts"
  - "mobile/lib/instrument-catalog.ts"
  - "mobile/lib/world-summary.ts"
  - "mobile/lib/companies.ts"
  - "mobile/lib/ai-models.ts"
  - "mobile/lib/markets.ts"
  - "mobile/lib/row-leaders.ts"
  - "mobile/lib/hazard-leaders.ts"
  - "mobile/lib/menu-hazards.ts"
  - "mobile/lib/mark-rows.ts"
  - "mobile/lib/famine-totals.ts"
  - "mobile/lib/conflict-week.ts"
  - "mobile/lib/metric-groups.ts"
---

# The strip, the menu's lists, cards and hazard lists

## The strip

- The strip is for instruments; the sheet is for news. `buildNowSurfaces`
  (`lib/now.ts`) builds both. NOW holds only live Red GDACS alerts, shown as
  `AlertPill`. No conflict events there: the source runs weeks behind.
- The row is the ten largest moves of the past week (`STRIP_SLOTS`), largest
  first, in one order wherever the globe is and whatever story is in front.
  Never make it follow the globe or the story: a row that changes on every
  swipe is not one a reader can come back to. Nothing ends the row: every
  instrument is in the menu. Only the row is cut; `strip` keeps every mover
  for lookups.
- Every number is the same seven calendar days (`gaugeMove`,
  `lib/cards/week-move.ts`). The globe's marks, the chooser and the menu's
  lists print that same week. A card prints it as the middle of its three
  windows (`cardWindows`), so the number pressed is on it. The row prints no
  window label.
- A monthly series has no week and takes no slot. Neither does a contract or a
  date.
- A slot is its label over its move, as wide as the wider of the two (`Slot`,
  `IndicatorStrip`). Never side by side, and never padded out to a rhythm:
  the row is for as many gauges as fit.
- A label is one line, never cut; the slot widens. It is words, not a code
  (`stripLabel`): `Turkey stocks`, `Hormuz`, `Oil`, `Gold/silver`. Bare names,
  except `stocks` stays and a currency keeps its country.
- A swipe lands on a slot (`lib/strip-snap.ts`, the slots' measured edges).

## The menu

- The root leads with the data groups. The app's own pages sit behind
  `settings & about`.
- `markets & trade` is a table. Its label's line names three windows as
  column heads (`WindowHeads`), and each list quoted daily is one row
  (`MoveWindows`, `GroupEntry`): its move over a day and over seven as
  numbers (`groupLadder`), and its thirty days as a small line (`groupPath`,
  `Spark`). The windows are named there and nowhere else.
- A day and a week are numbers and the month is drawn: never a line for a
  day, which is one step, and never a bar for a move.
- Every row of the table has all three windows. A list quoted monthly sits
  under `economy` (`MENU_SECTION`): food is there.
- Every row under `economy` moves by the month, named once as a head on the
  section's line (`ECONOMY_WINDOW`). No row there carries a window of its
  own, and no line says "unless noted": `borrowing costs`, quoted daily, is
  read against four weeks back (`fourWeeksBack`, `rateFigure`).
- A list's line is made of the rows its numbers are made of, weighed and
  combined the same way (`movePath`, `lib/cards/path.ts`), and is never drawn
  to its own range alone (`QUIET_SPAN_PCT`): a quiet month lies flat.
- Its first row is `world stocks`, the stock list under the name of what its
  numbers are, a step larger than the rows under it. No block over the lists
  and no second headline.
- `world stocks` is each exchange's move in US dollars, weighed by its
  country's GDP (`stocksSummary`, `lib/world-summary.ts`): one set of markets
  and weights for all three windows. A payload with no rates or no weights is
  averaged as it was. Never call it the economy: it is shares.
- The middle window is the list's own figure, and the other two are made the
  way it is, over the same rows. A day is a series' last step (`dayMove`), so
  a weekly or monthly series has none, and a close repeated under its own
  date is one reading (`settledLength`).
- Any other group's row is its name and one number that summarizes its whole
  list (`groupFigure`, `lib/world-summary.ts`). No subtitle, no count, never
  the largest mover. No overview block or band that repeats the categories. No
  single score across everything. The list's own page prints that number
  again over its rows, named (`GroupFigure.measure`).
- A list opens with one line (`GROUP_NOTES`, `ListIntro`): the unit and the
  window its rows share, so no row repeats them (`CatalogRow.note`). Never a
  sentence on how to read the screen.
- A list of moves runs from its largest rise to its largest fall (`byMove`,
  `lib/instrument-catalog.ts`), the contracts by their points: the carets and
  colours are the order, so it is never said. Never by size alone, which
  alternates them. A row with no such move follows in the list's own order.
- A row quoted daily draws its own thirty days between its name and its
  reading (`CatalogRow.path`, `Spark`), made as the first page's line is. A
  series in per cent draws none: its move is a difference. Every row of such a
  list keeps the slot, and the two columns are named once over the first row
  (`InstrumentHeads`), which then replaces the window in the list's line.
- Under `explore` a row is its name alone, `world hazards` included
  (`GroupRow`, `HazardsRow`): no figure and no line under it. What it opens is
  a screen reader's hint (`EXPLORE_HINTS`).
- The lists hold every published series (`lib/instrument-catalog.ts`), not the
  strip's ranked pool. A row reuses the pool's card object (`take`), so a row,
  its slot and its card are one thing. A series the table does not name is
  listed by its `source`.
- Whatever a row opens is a page of the menu (`MenuDetail`), rendered from that
  sheet's own body. Never hand a row off to its own sheet. A story leaves the
  menu.
- A row that opens as a page never moves the globe: the menu covers it. Only a
  row with no page (`onSelectRow`, a strait with nothing to chart) closes the
  menu and flies there.
- A menu row never appears or leaves while the menu is open.
- The menu reopens where it was for five minutes (`MENU_RESUME_MS` in
  `app/index.tsx`). A longer gap opens its root (the `rootKey`
  prop).
- A row that opens a list names what leads it (`leadNames`), not what the list
  is. A row says what its number counts (`readingNote`) and names its subject
  in words.
- Companies are gauges like any other and are never on the globe. A row is a
  name, what the company does and where it is from, never a ticker. Their
  prices are in `API_SNAPSHOTS` because the strip needs them at launch.
- `AI models`: a row is a lab, not a model. No rank number, `#1` or leader's
  badge; the scores overlap within the margin. The move is a year, in points, taken inside one
  snapshot's history.
- A lab's row draws its likely range on one scale for the whole list
  (`RangeMark`, `rangeScale`), so the overlap is seen. Never coloured: it is
  where a score stands, not a move.
- A series in per cent moves in points at any cadence (`movesInPoints`): a
  monthly rate, a bond yield, on the strip as in the lists. A price under a
  dollar prints four decimals.
- A rate prints the places it is published to (`rateDecimals`,
  `Indicator.decimals`): one for inflation and unemployment. Its move is the
  difference of the two printed readings.
- A currency reads as its market quotes it (`currencyQuote`, `formatRate`): so
  many per dollar at the rate's own places, the euro in dollars
  (`quotedInDollars`). Words under the number, never the feed's pair of codes.
- A company's row is its market value to two figures (`companyValue`), where
  every company has one: the share count behind it is kept by hand. Its card
  keeps the share price and carries the value as a figure.
- The contracts' list is `prediction markets`, never `predictions`: its first
  line says a price is not a forecast.
- A strait's count is of ships broadcasting a position. Say so wherever the
  count is explained (`GROUP_NOTES.straits`, the map key): one with its
  transponder off is missing from it.

## Cards

- A card enters only with live analysis (`why`) and a usable series
  (`hasGraphAndAnalysis`); a `ScheduledCard` is the one exemption from the
  series. **A card with no prose source is silently dropped**, so a new card
  needs a `why` and a fallback (`deskText`, `straitWhy` in
  `lib/cards/markets.ts`).
- One paragraph is on screen: `recent` (why it moved), else `standing` (what it
  is), else the catalog's sentence (a strait's or company's `blurb`, a signal's
  `facts`). Never two rungs at once. The exception is a market-signal card:
  the index's definition, then the desk's account.
- An indicator card's `recent` and cited stories come from
  `/api/analysis.json`, and a 404 there is a supported state. A strait's, a
  company's and a signal's ride on their own payloads.
- The graph is the headline's history. A strait graphs total traffic; the
  gold/silver card graphs the ratio.
- A card is one column scrolled by its sheet (`CardSheet`). No inner
  `ScrollView`.
- A card whose series has a week prints the menu's three windows under its
  reading (`cardWindows`), by the functions the menu's table uses. Its own
  move stays only where it measures against something else
  (`CardDelta.versus`: a strait's 90-day average). A rate per dollar names
  what moved (`the lira`).
- A chart's height stands for something (`chartScale`): never less than
  `QUIET_SPAN_PCT` of the level, or a point for a series in per cent, and a
  chance is drawn from 0 to 100 (`CardSeries.domain`).
- A value that holds until it is changed is drawn as steps
  (`CardSeries.shape`): a policy rate (`isPolicyRate`), a lab's best score.
- A rate per dollar is drawn turned over (`CardSeries.inverted`), so its line
  rises as the currency does, and its caption says so. The numbers on the
  scale stay the rate's.
- The chart can be scrubbed, and the readout says the move from that day to
  now (`moveSince`). It draws where the thirty days began as a dashed rule
  (`spanReference`), or the start of the card's own window where it has no
  three, and the cited stories as numbered dots.
- A chart reads its periods with `periodDates`, never `new Date`: Hermes
  rejects the feeds' `Jul 18` and `Oct 2024`, and the chart loses its time
  axis on a phone while the tests, on Node, still pass.
- Every chart prints its time axis, a story's line included (`TrendBlock`).
- `current ·` in the kicker is an ink step, never a colour. A strait's
  `current` uses `CHOKEPOINT_CURRENT_DAYS`, because its source publishes about
  five days behind.
- A strait has one card (there is no separate strait sheet), with its 90-day
  average as a line on the chart. Never call that its normal: it sinks during
  a long closure.
- The caption sentence is one, in this order: an index's week in US dollars
  where it differs from the chip (`dollarLine`), the reading's record on its
  own chart (`recordLine`), the builder's own. A record prints no number and
  never reaches past the chart.
- A rate decision's card carries the market's contract on it as a figure
  (`eventOdds`): the bank's name and `rates` in the question, and a deadline
  within a week after the decision.
- A sheet that shows an indicator with no card prints `indicatorReading`, so
  the two cannot print one series two ways.
- A card headed by a ticker says what the ticker is: the kicker carries the
  exchange.
- Quote a currency's own move (`currencyMove`, the exact reciprocal of the
  rate). The second FX slot is the largest move among the majors. Do not rank
  the FX slots by unusual movement: it promotes noise over consequence.
- Ranking takes the strongest linked story, not the sum, and allows at most two
  consecutive cards with one kicker.
- One module answers a move's colour (`moveTone`). Slate is a colour, not an
  absence; a contract's points are slate.

## Hazard lists

- Famine: the list leads with countries by people (`lib/famine-totals.ts`). A
  total says its month, and its share is of the people analysed, never of the
  country.
- What a hazard list holds, its headings and the page a row opens are data
  (`lib/menu-hazards.ts`), tested there; `MenuSheet` only renders them.
- Conflict: the list is the source's whole week under each country's toll
  (`lib/conflict-week.ts`). The country is the heading; its toll is a line
  under it, never set in the heading's caps. Every line that names the week names its dates.
  Civilians are a floor. It is UCDP's sum over coded events; never print it as
  a country's death toll.
- Thermal events carry no country.
