---
paths:
  - "shared/chart/**"
  - "public/islands/_chart.ts"
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

One chart, drawn by three surfaces. They had drifted once; this is what
keeps them one figure.

## Charts

Every series on this site is drawn by one thing: `shared/chart/series.ts` for
the geometry, `public/islands/_chart.ts` for the browser, and a ten-line
adapter per surface. Pinned in `scripts/lib/chart.test.js`.

- **There were three, and they had drifted.** `_map/chart.ts` (imperative DOM),
  `entity-sheet.ts` (a Preact VNode, since deleted — see the islands list) and
  `entity-pages.js` (an HTML string from
  Node) each carried the same thirty lines of scale arithmetic, and the header
  of the first argued the duplication was unavoidable: three runtimes, three
  node constructors, so "what is shared is the *shape*". That holds for the
  renderer and not for the chart. The domain, the scales, the axis precision,
  where the extremes fall, which points are finite — none of it has a runtime
  opinion in it. So the arithmetic emits **SVG nodes as plain data** and each
  surface walks the list with whatever constructor it has. What the drift
  actually cost: the map's chart had a y-axis, an area, a reference rule and a
  direction tint and the other two had a line and two dots, and
  `preserveAspectRatio="none"` — diagnosed and removed twice — was still in
  `/e/{id}`, the one page on this site whose entire subject is a chart, drawing
  its axis labels stretched and its end dots as ellipses.
- **A chart that can only be looked at is half a chart.** These drew 86 days of
  vessel traffic and printed three of those numbers, so a reader could see that
  something had fallen and could not find out when, by how much, or what it was
  on any given day. The shape was the whole of the information, and a shape is
  exactly the part a reader cannot check. Four things answer that: a **cursor**
  (pointer, touch, or arrow keys) that reads any observation off the line into
  a live readout; a **range control** that rescales the domain to a shorter
  window; the **extremes ringed** where they fell, so the high and low printed
  on the axis acquire a *when*; and **the numbers themselves**, every
  observation in a `<details>` table with its step-over-step change, plus a
  copy-as-TSV.
- **The readout is never empty.** At rest it names the latest observation *and
  its date* — a fact none of these charts stated before and the one most
  readers came for — and tracks the cursor when there is one. The row is
  height-reserved, so moving a pointer across the chart never shifts the layout
  under it.
- **`reference: 'open'` is a different quantity from `reference: 11.9`.** A
  number is external and fixed — a chokepoint's published 90-day baseline, which
  must not move when the reader narrows the range, because being able to see a
  fortnight against the quarter's normal is the whole point of drawing it.
  `'open'` is intrinsic and recomputed per window. Getting this wrong is silent:
  a rule pinned to the full series drifts off the top of a narrowed domain,
  squashes the data into a third of the box, and still looks exactly like a
  rule — under a caption going on calling it "the window's open". `direction:
  'window'` is the same idea for the tint, so a series that fell over the
  quarter and rose over the last month is not drawn in the decline's colour.
- **The caption states nothing the chart states.** It used to carry the date
  range and the window's percentage change; both go stale the moment the range
  control moves, and both are already on screen — the dates on the x-axis, the
  change in the readout, each recomputed for what is actually drawn. So the
  caption is provenance and what the rule marks, and nothing else.
- **The axis rounds and the table does not.** `axisDecimals` is a magnitude
  rule sized for three labels in a 62px gutter — one decimal above 100. Brent
  peaked at 124.24 the day after closing at 124.16, and when the table borrowed
  the axis's precision it printed `124.2` twice and put the word "high" beside
  the second one, which reads as a broken chart in the one place whose entire
  job is letting a reader check the picture. `formatExact` counts the decimals
  the source actually published.
- **The static chart is the whole chart.** `/e/{id}` ships the line, the area,
  the rule, the axis, the extremes, the latest value in words and every
  observation in a table, before any script runs — `<details>` and `<table>`
  need none. `series-chart` then **replaces** it with the interactive figure
  rather than hydrating it, because the two are not the same figure: the range
  control, the cursor and the copy button are meaningless without a script and
  so are deliberately absent from the markup. Same two-renderings-of-one-thing
  pattern `share-bar` uses.
- **The accessible description is composed where the numbers are.** Callers
  used to append the count themselves, so a 30-session view of an 80-session
  series announced itself as "…over 80 observations. 30 sessions." — a label
  contradicting itself in one breath, and only for the readers with no way to
  check it against the picture. `label` is now the subject and nothing else.
  The focusable node is the plot wrapper carrying `role="img"`, not the `<svg>`,
  which would be an image and a keyboard widget at once and announce as
  neither; the readout is a `role="status"` live region; the table is the route
  in for anyone who wants all of it.
- **Colour is a class, never an attribute.** `colour-system.test.js` bans
  literals in the stylesheet and an inline `stroke="#c08a6a"` would route
  straight around it, so every mark takes `currentColor` from a classed
  element. The component lands on both palettes — `:root` follows the reader,
  `body.map-page` commits to dark — so it declares `--chart-*` once and each
  surface says what those resolve to. Aliases only.
- **Charts open over the map, never instead of it.** The chokepoint, exchange
  and quote cards have always been `<dialog>`s on the map. The 54 indicator
  series had no route from the map at all: the article page has carried an
  entity strip for a long time and the map's story card never did, so a story
  about the strait of Hormuz sat a few hundred pixels from the Brent series it
  is about with nothing between them. The story card carries the strip now
  (`entities` on `/api/story/{slug}.json`, filtered through the same
  `indicatorMap` the article page uses), above the isnad since the chain has to
  stay last. A chip is a real `<a href="/e/{id}">` so it survives a modified
  click and a crawler — navigating would throw away a camera, a time slice, a
  set of filters and possibly an open card.
- **A `follows` chip unfolds inside the story card** (2026-07-28), rather than
  opening `entity-sheet` over the map through the loader's `zuhd:mount-island`
  event, which is what it did until now. That solved the navigation and did
  the same damage a different way: a 640x810 dialog over a scrim, which on a
  900px viewport dims the map out entirely and puts the story the reader
  clicked from behind a curtain. Sixty percent of that panel was "Mentioned in
  · 30" — a list of *other* stories to go and read, offered at the moment the
  reader is reading one, on a map where those stories are already drawn as
  beacons. The question a chip is actually asked is narrower: *this story is
  about Brent crude — what is Brent crude doing?* So the chart unfolds in
  place, under the strip, on the map's own dark surface. Chart options match
  `/e/{id}` exactly, so the series here and on the entity page cannot disagree
  about what the rule marks or which direction is which.
- **"Full record" and "full profile" open here too** (2026-07-29). Both panels
  still ended in a link out — `/e/{id}`, `/country/{ISO2}` — which is the whole
  disclosure undone at its own last line: a reader who followed one abandoned a
  camera, a time slice, a set of filters and the story they were reading, to
  answer a question the panel had already started answering. It was the same
  navigation the chips and the tags had just been fixed for, retreated to the
  bottom of the panel with the word "full" in front of it. So each panel has a
  **second density** under its first — the indicator's provenance and the
  stories citing it; the country's remaining twenty-odd metrics — behind a
  `moreLink` that grows the panel rather than leaving. The ordering *is* the
  judgement: the question the chip was asked is answered first, and the one it
  was not is a press away for a reader who turns out to have it. `href`s are
  untouched, so a modified click and a crawler still reach the canonical page;
  nothing routes a reader there by an ordinary click.
- **A list of other stories flies the map instead of leaving it** (2026-07-29).
  Two lists inside the card name other articles — a country's recent coverage,
  and the stories citing an indicator — and every row was an `/a/{slug}` link,
  which is the same navigation in a third costume. A row now calls the island's
  `openStory(slug)`, which resolves it against `pointBySlug` and flies there.
  It returns **false** for a slug outside the loaded fortnight and the row stays
  the plain link it was: a story from five months ago is genuinely not on this
  map, and a click that silently does nothing is worse than a navigation. No
  filter or scrubber check — the reader asked for *that* story by name, and
  refusing because its category chip is unlit would be the map overruling an
  explicit request.
- **A country tag in the prose does the same thing, through the same
  mechanism** (2026-07-28). `build.js` renders every `/country/{ISO2}` link in
  an article as `<a class="country-link" data-island="country-preview">` and
  the loader listens on the document for exactly that — so inside the map's
  story card a tag opened the `country-preview` sheet: a `.island-sheet` over a
  scrim, on the **site** palette, so on a light-mode device a white panel
  covered the dark map. The `follows` mistake from a different direction, and
  worse, because that sheet does not even commit to the map's chrome. Both are
  now one `disclosure()` factory — in `public/islands/_disclosure.ts` since
  2026-07-29, because the article page's strip needed the same behaviour and
  had been given a dialog instead. The tag's handler must `stopPropagation()`, or the inline
  panel and the loader's dialog both open. The `href` is untouched: a modified
  click and a crawler still reach the full profile.
- **The inline country panel leads with the metric shading the land**, which is
  why `createStoryPopup` takes a `standingFor` callback — the island owns the
  metric and the card has to ask. Without it the panel would open on
  `highlights`, that country's best-ranked numbers sorted flattering-first,
  regardless of what the reader was looking at: the exact failure the map's own
  country card was fixed for. `coverage` is dropped for the same reason
  "Mentioned in · 30" is, and only four metrics are shown — this is an aside
  inside a story, and the profile is one click away.
- **The card is capped at 50vh, so the panel opens below the fold, so it must
  be scrolled to.** Measured on a 1440x900 desktop: 152px of a 251px panel
  visible, with the chart's caption, its range control, "the numbers" and the
  full-record link all outside a box the reader has no reason to think has
  scrolled. Growth the reader cannot see is the same as no growth.
  `scrollIntoView({ block: 'nearest' })` after the expansion settles — instant,
  not smooth, because a second movement chasing the first reads as the card
  fidgeting. One panel serves the whole strip: two charts stacked in a card
  that has room for neither would push the first out of view as the second
  arrived.
- The panel's hero figure is `--size-base`, not the `--size-h2` the map's own
  sheets give a focal number. Those cards have no other subject; this one is a
  guest inside a story whose headline is `--size-md`, and a 31px number over an
  18px headline inverts what the card is about.
- **The rank strip is arithmetic too** (`shared/chart/rank-strip.ts`). Rank 1 of
  145 is a full bar. The same expression was written out in `country-pages.js`
  and twice in `_map/popup.ts`; nothing had drifted, and "nothing had drifted"
  was the entire guarantee that a country page and a map card agreed about a
  country's standing. It is deliberately *not* merged with
  `country-metrics.js`'s `p`, which is position on the value scale and a
  different quantity for a different job — the strip sits beside a printed rank
  and has to mean the rank. It is `aria-hidden`: the rank is in the next cell,
  and announcing it twice made a 26-row table read as 52 facts.
- **The time rail is not one of these.** `_map/timeline.ts` is a canvas
  histogram under a real `<input type="range">` — a control, not a chart to
  read values off, and already keyboard- and screen-reader-operable through the
  input. It stays as it is.
- **`_spark.ts` is the second shape, and it is a second module rather than a
  flag on the first** (2026-08-02). Seven rows at the head of the map's
  instrument rail draw a line and nothing else — no axis, no dots, no rings, no
  readout, no table. It could not be `createChart({ ranges: false, table: false })`:
  those are the only two shrink levers that exist and neither touches the
  geometry, so the box would still be 640×112 with its right **62 units — 27%
  of the width — a blank y-axis gutter**, plus axis text, date text, extreme
  rings and a caption row, in a column 5.5 to 21rem wide. What it *does* reuse
  is `seriesModel`, by dividing the points back out of the big chart's box and
  multiplying them into its own. So the domain, the windowing and the
  "fewer than two finite points is a dot pretending to be a trend" rule are
  still decided in one place, and a sparkline cannot disagree with the full
  figure a press opens about where a point falls.
- **`preserveAspectRatio="none"` is right for exactly this one shape.** The ban
  above is real and was earned twice, and the reason it gives is what does not
  apply: it was "drawing its axis labels stretched and its end dots as
  ellipses". A bare `<polyline>` with `vector-effect: non-scaling-stroke` has
  nothing in it that a non-uniform scale can distort. The first version obeyed
  the letter of the rule — `xMidYMid meet` against a matched `aspect-ratio` —
  and that ties the height to the width, which for a row spanning 71px in the
  folded spine and 240px in an open rail meant **a 47px-tall line per row and
  an instrument rail overflowing its own column by 436px**, measured at
  2361×984. A sparkline is a line *in a line of type*: its height belongs to
  the row's rhythm and never to how much horizontal room the row happened to
  have. It is 1.05rem, and the width is whatever is left.
- **Each one autoscales to its own domain, so amplitude is not comparable
  across rows and the printed percentage is what carries magnitude.** A
  30-exchange composite moving 0.3% and Brent moving 14.1% draw with the same
  visual swing, because `seriesModel` fits the domain to what is actually in the
  window — which is the behaviour that makes a small series legible at 17px and
  the reason every sparkline anywhere works this way. What must not drift is the
  *period*: all seven cover the same **calendar window**, taken from the map's
  one time range, because a column of lines covering different spans is seven
  incomparable pictures at one rhythm with nothing on screen saying so. That
  used to be `SPARK_WINDOW` observations, which is a different quantity and did
  not deliver it — see `map.md`, where the unit was the bug.
- **A level gets a line, a count gets bars** (2026-08-03). `_spark.ts` drew
  everything as a polyline, and half of what it draws is not a level. A price,
  an index, a day's vessel transits — the line *between* two of those means
  something, the value passed through it. A count per bucket is not a level,
  nothing connects one bucket to the next, and joining them draws a slope where
  there is only a pair of independent tallies; at thirty buckets of story volume
  that came out a seismograph, legible as "busy" and useless as a shape. The map
  already agreed with itself about this — the scrubber draws story volume as a
  histogram from the same points — so `shape: 'bars'` makes the rail and the
  rail below it one vocabulary. **A count's domain is floored at zero by the
  caller**, or a run whose smallest bucket is three draws that three as no bar
  and exaggerates every difference above it. This is a `type` field on a module
  whose header says a second shape gets a second module, and the exception is
  argued rather than assumed: that rule earned itself because `createChart`'s
  shrink levers could not touch its *geometry*, and here bars and line share the
  model, the box, the span, the domain, the tone and the renormalisation, and
  differ in which children are appended.
- **The end dot is a zero-length stroke, and it has to be.** A sparkline's most
  valuable pixel is the latest observation, and the box is scaled
  non-uniformly — so a `<circle>` renders as an ellipse whose eccentricity
  depends on how wide the rail happens to be, which is precisely the failure
  `preserveAspectRatio="none"` is banned for everywhere else. A zero-length
  subpath with `stroke-linecap: round` and `vector-effect: non-scaling-stroke`
  is a disc of exactly its stroke width in CSS pixels at every width. Pinned:
  the suite asserts no `<circle>` enters that box.
- **The area under a sparkline is decoration, and two more honest ideas were
  worse.** It was first drawn *between* the line and the window's open, on the
  sound reasoning that area to the floor measures from an arbitrary place — the
  floor is the window's minimum, not zero. These series mostly move one way
  across a short window, so that region came out a wedge with a hard horizontal
  lid and every row read as a shaded rectangle with a diagonal cut. The open
  then survived as a hairline across the fill, and sat at the top edge of every
  falling row where it read as a box lid rather than a datum — and it was the
  third thing on the row stating direction, after the tone and the printed
  figure. What ships is area under the curve, plainly weight, stating nothing.
- **The fill is a gradient, and a flat one is what made the money rows look
  wrong.** At the range the map opens on, a money series is **four points** —
  three segments of daily closes — so constant alpha under it is not an area
  under a curve, it is a trapezoid: hard top, hard sides, hard floor, filling
  most of a 17px box. Every row read as a bar with a diagonal lid, which is what
  it geometrically was. Fading from 0.3 against the line to nothing by the floor
  makes it behave like what it is for, and does so identically at four points
  and at sixty, which a conditional fill would not. Two consequences. The stops
  are `currentColor`, so the row's hue arrives the one way this component allows
  — `fill="url(#…)"` is an attribute naming *where* the colour comes from, not
  what it is, which is not what "colour is a class, never an attribute" forbids.
  And **each spark needs its own gradient id**: an `id` is document-scoped even
  inside its own `<svg>`, so one shared id would draw thirteen fills in whichever
  row parsed last. Pinned.
- **Wrapping a row in a box means the rebuild has to remove the box.**
  `setTrends` cleared its stale summaries by `.remove()`ing the summary, which
  was right while those were direct children and left an orphan the moment they
  gained a wrapper — so every press of the time range added three empty 27px
  rows between `markets` and `currencies` and kept them. Nothing looked broken:
  an empty box exactly one row tall reads as spacing. Found by measuring row
  offsets, which is the only thing that finds it.
- **`domain` is the one place autoscaling is wrong, and it is narrow** (2026-08-03).
  `SeriesOptions.domain` replaces the scale the data would choose with a fixed
  one, for the case where the *magnitude* is the fact and there are too few
  points to carry it: the money rail's 24h step is two closes, and two points
  fitted to their own domain are a full-height diagonal whatever they are. It
  replaces the scale and nothing else — `obsLo`/`obsHi` stay the observations,
  so the axis still prints numbers somebody reported and the extreme rings still
  land on real data. A domain that is not finite and ascending is ignored rather
  than obeyed into a broken chart, since the alternative is a figure that
  refuses to draw because a constant was fat-fingered. It lives here rather than
  in `_spark.ts` for the reason that file opens with: it owns no scale
  arithmetic, and this record already says what three copies of it cost.

## The disclosure mechanism

- **`_disclosure.ts` is the shared mechanism**: `disclosure()` (one panel, many
  triggers, one open at a time, a `seq` guard so a chip pressed mid-fetch wins)
  and `moreLink()` (the second density, opened in place). What is shared is the
  *behaviour*, not the rendering — the map is dark chrome and the article is the
  site palette — which is why the class names are parameters. Pinned in
  `scripts/lib/disclosure.test.js`, which drives both against jsdom and asserts
  the property rather than the markup: an ordinary click never navigates, a
  modified click always can. `_entity-panel.ts` makes the same split for the
  panel's *contents*, which the two surfaces had also been building twice.
- **`entity-sheet` was deleted (2026-07-29).** It was the article page's answer
  to a `follows` chip: a 44rem `<dialog>` with a scrim and a backdrop blur,
  thrown over the sentence that raised the question, carrying a header, the
  chart, "Mentioned in · 30" and a link to `/e/{id}`. The chart was the only part
  anyone had asked for. Its argument was that "a modal is the right answer
  because there is no view to protect" — true about the map and not about the
  reader: an article being read is a view too, and the panel that answers a
  question a sentence raised belongs under that sentence. `/e/{id}` is untouched
  and still canonical for a modified click, a crawler and a JS-less browser.
- **Sheet pattern**: native `<dialog popover>` with CSS `@starting-style`
  transitions, no sheet library; styles under `.island-sheet` in `style.css`. A
  `<dialog>` island must use `mountSheetIsland` from `_framework.ts` — the
  loader discards teardown functions, so without it every activation leaves
  another container and another shut dialog in the document.
