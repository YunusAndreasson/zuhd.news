---
paths:
  - "public/islands/situation-map.ts"
  - "public/islands/_map/style.ts"
  - "public/islands/_map/graticule.ts"
  - "public/islands/_map/places.ts"
  - "public/islands/_map/popup.ts"
  - "public/islands/_map/sheet.ts"
  - "public/islands/_map/read-state.ts"
  - "public/islands/_map/types.ts"
  - "scripts/lib/map-*.test.js"
  - "scripts/perf/**"
  - "templates/index.html"
---

# The situational map: camera, MapLibre, stories, cards

The island is `public/islands/situation-map.ts` with helpers in
`public/islands/_map/`. It is imperative and framework-free; it stays off
Preact (`_framework.ts`).

Beside this file: `map-rail.md` (the instrument rail, the story rail, the
scrubber, layout) and `map-layers.md` (basemap, labels, the land ramp, hazard
layers, market marks). The sky is `sky.md`, prayer lines `prayer.md`, the
calendar `hijri.md`.

## Camera and projection

- The map opens on Makkah (`HOME_CENTER`), the frame the clock uses. "Whole
  world", a bare Escape and the wordmark call `resetView`; the URL never
  changes.
- It opens on three days (`DEFAULT_RANGE_HOURS`), and a story's decay
  half-life is 72 hours (`DECAY_HALF_LIFE_HOURS`). Both are decisions.
- The world is a sphere below `GLOBE_ZOOM.sphere` (3) and Mercator above
  `.plane` (5), by a `projection.type` expression in `_map/style.ts`. **Never
  use `projection: { type: 'globe' }`**: that preset flattens at zoom 11–12 and
  `maxZoom` is 9, so the flat half would never run.
- `renderWorldCopies` stays off: one Earth.
- The opening zoom, also `minZoom`, is `globeFitZoom` of the shorter side of
  the gap between the rails (`globeSpan`), not the canvas the rails float over;
  capped at `GLOBE_ZOOM.sphere`. `onResize` must call `map.resize()` and
  re-apply it.
- The reachable floor is about 0.1 below `minZoom`: MapLibre adds
  `log2(cos lat)` on the sphere. Not a bug.
- Keep `maxPitch: 0` and `touchPitch: false`: `calibrate` (`_map/sky.ts`)
  draws no sky for a tilted or turned camera.
- The globe takes no keys (`keyboard: false`) and its canvas is out of the
  Tab order. Escape and `[`/`]` are the page's, not the globe's.
- On the sphere the wheel zooms to the pointer over the planet and about the
  centre over space (`pointerOnDisc`, set per wheel in the capture phase):
  MapLibre answers a point in space with the nearest limb point and slides the
  planet toward it. Pinch and double-click stay centred until
  `GLOBE_ZOOM.plane` (`setZoomAnchor`).
- `scrollZoom.enable(options)` does nothing on an enabled handler: `disable()`
  first.
- `doubleClickZoom` takes no anchor, so it is off on the sphere and a
  `dblclick` handler stands in.
- Far-side geometry leaks through the planet during the morph. It is hidden
  only where the limb is off the canvas's short axis before zoom 3, so a
  smaller `GLOBE_ZOOM.sphere`, or a canvas tall enough to hold the whole disc
  at zoom 3, shows it.
- A detail layer's `minzoom` is at least `DETAIL_ZOOM`, or it shows at world
  view.
- Space is transparent canvas. `.map-canvas-host` paints `--map-ground`, which
  is `MAP_COLOURS.space`, and every scrim fades into it. The sea (`ocean`) is
  a blue apart from space: the planet stands off the night by hue.
- The graticule (`_map/graticule.ts`) is generated, not fetched, and stops at
  85°. It sits before `land`: no tone works on both sea and land. Keep
  `line-width` at 1.2 or more: thinner never reaches its tone.
- `atmosphere-blend` is a constant 0.2. Never zoom-interpolate it: MapLibre
  already fades it with the projection. Its colour is MapLibre's own and it
  paints over labels and marks, so raising it washes the day limb.
- `drawSolar` sets the light with `anchor: 'map'` and `sunLightPosition`, the
  antisolar direction (MapLibre negates it). With no `light` the crescent is
  fixed to the screen. No other `sky` property reaches the globe.
- **Never call `setPadding` mid-flight**: it is a `jumpTo`, which cancels the
  flight. Use `writePadding`, which defers while `flying`; the drawer snaps
  shut (`setExpanded(open, true)`) before a flight.

## MapLibre behaviour

- The basemap is our own origin's (`scripts/build/basemap.js`): no tile
  provider, and the CSP stays `default-src 'none'`.
- `setData` takes a parsed object. A URL string makes no request and throws
  nothing (`loadWater`).
- `countries` is vector tiles (`scripts/build/basemap-tiles.js`). Every
  feature-state call on it spreads `COUNTRIES`: without `sourceLayer` MapLibre
  fires an error and writes nothing. A tile URL is absolute (`tileUrl`), joined
  as a string: `new URL` encodes `{z}`.
- `['zoom']` is legal only as the direct input of a top-level `step` or
  `interpolate`. Nested, MapLibre rejects the layer, `addDataLayers` throws and
  every later layer is lost. Per-feature terms go in the outputs.
  `map-island.test.js` runs every layer through `validateStyleMin`.
- `antialias` is on below a device pixel ratio of 2: without it the limb crawls
  against the sky's circle. At 2 it halved the drag (16 to 35 fps) for no
  visible edge.
- `Popup` keeps `locationOccludedOpacity: 0`, and `syncOccludedPointer`
  mirrors it to `pointer-events`: opacity alone leaves an unseen card taking
  clicks.
- Hover is `promoteId` and `setFeatureState`, never a `setFilter` or
  `setPaintProperty` per pointer move, which reloads the source.
- Only `applyMetric` calls `removeFeatureState` on `countries` without an id,
  to clear the old metric, and it rewrites the open card's outline after.
  Hover and the outline unset their own ids (`countryHoverWritten`,
  `countrySelectedWritten`), or they wipe the ground metric.
- The open country card's country is outlined (`country-selected`, told by
  the popup's `onCountry`). A line, never a mask or a dimmed world: the land's
  tone is the metric's value.
- Do not use `global-state`: a filter or data-driven paint reading it
  reloads the source. `applyTimeFilters` stays `setFilter`, because a mark
  hidden by paint is still hoverable.
- `rivers` uses `line-layer-opacity` so a confluence draws no brighter.
  `prayer-lines` keeps `line-opacity` for its hover step.
- Do not adopt: the `reduceMotion` option (overrides the reader's
  setting), `text-overlap: 'cooperative'` (keeps both colliding labels) and
  `map.on('error')` (swallows the `console.error` that fails `npm run perf`).
- `prewarm()` pairs with `clearPrewarmedResources()` at `map.remove()`.
- No `as never` on a layer spec: name the return type so expressions stay
  tuples.

## Stories on the map

- **Never aggregate stories across places.** No clusters, and no count where
  no story stands; `map-island.test.js` fails on a `cluster` key.
- Places (`_map/places.ts`) group a dateline within `PLACE_SPLIT_KM` and any
  name within `PLACE_SAME_KM`. Keep the second tight: Ramallah is not Al-Quds.
  A place stands on its modal coordinate, never a mean.
- `story-density` is the regional field: raised from places, under
  `borders`, no filter or toggle. Its weight is the place's freshest decay
  times `sqrt(n)`, on a fixed domain, without coverage.
- `story-bloom` is a place's heat (`placeHeat`): freshness times coverage
  (`attentionWeight`, unknown weighs the median) summed under a square root,
  under `borders`, only where two or more stories stand. A heatmap in the
  wash's tone on `BLOOM_STOPS`, so overlaps sum under one capped ramp; never a
  hue (the dots carry that) and never circles, whose alpha stacks.
- A flower explains itself on hover (`showPlaceTip`, pointer-only): place,
  count, newest and oldest, then the dot's title and age. The glow takes no
  click, and a click hides the tip. Tips flip at the rails (`tipAt`, the
  camera's padding), not the canvas.
- A place's stories are a flower (`flowerOffset`): newest at the centre at
  beacon size, older ones petals a golden angle round and further out, so
  distance is age. Offsets are a `match` table on `k`: an array property
  arrives as a string, and `icon-rotate` leaves the hit box behind.
- A symbol's hit box is its padded image, so `topHit` keeps only the story dot
  whose drawn disc holds the pointer (`storyAt`). Past `FLOWER_MAX` the oldest
  draw no dot (a filter, not opacity); the numeral and its card still count
  them.
- Keep `GAUSS_COEF` in the calibration, and keep stop 0 of `DENSITY_STOPS`
  transparent. Without them the field vanishes or paints the whole world.
- Only stories are rebuilt as the scrubber moves. Dated overlays move by
  `setFilter` (`applyTimeFilters`); toggles are visibility.
- A range press rebuilds `markets` and `chokepoints` once each
  (`applyMarketRange`), and nothing else does: not a scrub, a tick or `idle`.
- A centre beacon's radius is a percentile rank from `build.js`. A story with
  no figure gets a neutral size, not the smallest. Petals are one size
  (`PETAL_PX`), because the offset table is in icon units.
- `story-place-count` may lose a collision. Its threshold is a `case` inside
  `text-field`, never a `filter`, which would delete the feature the wash needs.
- Read state (`_map/read-state.ts`) is slugs in `localStorage`, marked when a
  card opens. It must never reach the server or sync; if it would, delete it.
- A read row is an ink step, a hollow dot and `.sr-only` text. It is never
  hidden or reordered.

## Cards and the pointer

- Hover never moves the camera. Hover previews or peeks; a click commits.
- There is one `click` and one `mousemove`, resolved by `topHit` through
  `HIT_ORDER`, the same set as `MARKER_LAYERS`. Per-layer handlers both fire
  for one pointer.
- No hover work during a gesture (`flying || interacting`). `moveend` asks
  again once, from `lastPointer`. Every flight goes through `flyCamera`, the
  one thing that clears `flying`; a bare `map.flyTo` leaves hover dead.
- `Popup.addTo` fires `close` synchronously on an open popup. Attach only
  through `attach()` (`reattaching`), or the card stays on "Loading…".
- A story card speaks as the article page does: headline at `--size-h3`,
  the hook (the prose's first paragraph, the preview's lead) at `--size-md` in
  `--map-ink`, then the body. A country's own card shares the headline.
- A story card is one width at two densities. `preview()` prefetches the
  story, and `growTo` runs after the position is final.
- The card's sources (`sourceBlock`) take their thresholds and words from
  `shared/source-framing.ts`, and the fold's words from the article page. A
  lean is a word in ink, never a number and never `--map-pos`/`--map-neg`.
- The card's foot is one line: `Sources`, the names as plain text and `how
  each framed it`, the summary of a fold holding the linked rows, the note
  and the date line. No link inside the `<summary>`.
- The fold is shut when the card opens, on every story: never set
  `details.open`, a contested story's and a single outlet's included.
- A dot opens its story; a place's numeral opens `openPlace`, which does not
  fly.
- Makkah's card (`showMakkah`) is calculated, never fetched: the coming five
  prayers (`nextPrayers`, Umm al-Qura) and the year's markers (`comingMarks`).
  Its countdown ticks only while it is open. It takes the pointer last.
- A card keeps off the rails and the timeline (`writeCardPadding`, the
  popup's `padding`), and its cap is half of `--map-card-room`: MapLibre fits
  a popup to the canvas, which runs under both rails.
- A story opened by Enter takes the focus into its card (`StoryPopup.focus`)
  and gives it back to its row on close (`returnFocus`). The feed reads the
  key from `keydown`: Gecko's keyed click has a `detail` of 1.
- Only a card beside a rail row keeps inline offsets (`placeDocked`): every
  other open calls `clearOffsets`, or a peek opens where the last card stood.
- A story's `chart` is fetched only where `hasSeriesRecord`: a company's or a
  lab's id has no `/api/entity` file.
- Peek answers one question and clips (`.map-sheet.is-peek`). Its offsets
  are `--map-scrub-reach` (the scrubber or the range chips above it) and
  `--map-rail-w`; the first is set on `body`, where the sheet is appended,
  and teardown removes it.
- A docked card takes the canvas's free height (`--sheet-max-h`) and its width
  inside the gap between the rails, so it scrolls as rarely as it can.

## Idle cost and measurement

- **Never write to a source on `idle` unless something changed.**
  `setFeatureState` always schedules a render, which fires `idle` again;
  compare first (`hoverStateWritten`, `prayerStateWritten`).
- `scheduleMetric` waits on the `countries` source (`sourcedata`), never a
  count of idles: a missed window leaves the world fully hatched.
  `applyMetric` sets `metricApplied` before it writes.
- Idle cost cannot be measured headless. `scripts/perf/idle-renders.mjs` runs
  headed behind a drag control; zero frames is also a broken measurement.
