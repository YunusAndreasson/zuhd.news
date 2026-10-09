---
paths:
  - "mobile/lib/cards/**"
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
- The row is what the map is not already saying (`contextualStrip`): the
  settled story's gauges, then what is in view and not printed on the globe,
  largest move first; with neither, the week's largest moves. At most
  `STRIP_SLOTS`, and nothing ends the row: every instrument is in the menu.
  Only the row is cut; `strip` keeps every mover for lookups.
- A mark the globe names takes no slot, so no number is printed twice. A
  story's own gauges are the exception: the story is why they are there.
- In view means a mark the globe could not name, or the currency of a country
  whose capital is on screen (`countryCurrencySlots`), and only for a move of
  at least `NOTABLE_WEEK`. The globe says what it named
  (`lib/resting-view.ts`); the strip never projects for itself.
- Every number is the same seven calendar days (`gaugeMove`,
  `lib/cards/week-move.ts`). The globe's marks, the chooser and the menu's
  lists print that same week. A card prints it first, then its own window
  (`cardMoves`), so the number pressed is the first one read. The row prints
  no window label.
- A monthly series has no week and takes no slot. Neither does a contract or a
  date.
- A label is one line, never cut; the slot widens. It is words, not a code
  (`stripLabel`): `Turkey stocks`, `Hormuz`, `Oil`, `Gold/silver`. Bare names,
  except `stocks` stays and a currency keeps its country.
- A swipe lands on a slot (`lib/strip-snap.ts`, the slots' measured edges).

## The menu

- The root leads with the data groups. The app's own pages sit behind
  `settings & about`.
- A group's row is its name and one number that summarizes its whole list
  (`groupFigure`, `lib/world-summary.ts`). No subtitle, no count, never the
  largest mover. No overview block or band that repeats the categories. No
  single score across everything. The list's own page prints that number
  again over its rows, named (`GroupFigure.measure`).
- A list opens with one line (`GROUP_NOTES`, `ListIntro`): the unit and the
  window its rows share, so no row repeats them (`CatalogRow.note`). Never a
  sentence on how to read the screen.
- `world hazards` keeps a line under its name (`hazardParts`): alerts standing
  now, then the week's dead with its dates, then people in hunger; two at
  most.
- The lists hold every published series (`lib/instrument-catalog.ts`), not the
  strip's ranked pool. A row reuses the pool's card object (`take`), so a row,
  its slot and its card are one thing. A series the table does not name is
  listed by its `source`.
- Whatever a row opens is a page of the menu (`MenuDetail`), rendered from that
  sheet's own body. Never hand a row off to its own sheet. A story leaves the
  menu.
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
- A series in per cent moves in points at any cadence (`movesInPoints`): a
  monthly rate, a bond yield, on the strip as in the lists. A price under a
  dollar prints four decimals.

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
- The chart can be scrubbed. It draws the chip's window start as a dashed rule
  and the cited stories as numbered dots.
- `current ·` in the kicker is an ink step, never a colour. A strait's
  `current` uses `CHOKEPOINT_CURRENT_DAYS`, because its source publishes about
  five days behind.
- A strait has one card (there is no separate strait sheet), with the 90-day
  normal as a line on the chart.
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
