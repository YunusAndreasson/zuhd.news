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
layers, market marks). The sun is `sky.md`, prayer lines `prayer.md`, the
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
- The opening zoom, also `minZoom`, is `globeFitZoom` of the canvas's shorter
  side, capped at `GLOBE_ZOOM.sphere`. `onResize` must call `map.resize()` and
  re-apply it.
- The reachable floor is about 0.1 below `minZoom`: MapLibre adds
  `log2(cos lat)` on the sphere. Not a bug.
- Keep `maxPitch: 0`, `touchPitch: false` and `keyboard.disableRotation()`:
  `calibrate` (`_map/sky.ts`) draws no sky for a tilted or turned camera.
- On the sphere every zoom is about the centre (`setZoomAnchor`): a pointer off
  the disc makes MapLibre slide the planet sideways. The pointer anchor returns
  past `GLOBE_ZOOM.plane`. This works around a MapLibre globe-zoom bug that
  upstream PR #8095 fixes; re-test on the current version before removing it.
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
  is `MAP_COLOURS.ocean`. Never give space another tone: every scrim fades into
  that ground.
- The graticule (`_map/graticule.ts`) is generated, not fetched, and stops at
  85°. It sits before `land`: no tone works on both sea and land. Keep
  `line-width` at 1.2 or more: thinner never reaches its tone.
- `atmosphere-blend` is a constant 0.34. Never zoom-interpolate it: MapLibre
  already fades it with the projection.
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
  nothing (`loadWater`, the 1:10m swap at `ULTRA_ZOOM`).
- `['zoom']` is legal only as the direct input of a top-level `step` or
  `interpolate`. Nested, MapLibre rejects the layer, `addDataLayers` throws and
  every later layer is lost. Per-feature terms go in the outputs.
- `antialias: true` stays: without it the limb crawls against the sky's circle.
- `Popup` keeps `locationOccludedOpacity: 0`, and `syncOccludedPointer`
  mirrors it to `pointer-events`: opacity alone leaves an unseen card taking
  clicks.
- Hover is `promoteId` and `setFeatureState`, never a `setFilter` or
  `setPaintProperty` per pointer move, which reloads the source.
- Only `applyMetric` calls `removeFeatureState` on `countries` without an id,
  to clear the old metric. Hover must unset its own id (`countryHoverWritten`),
  or it wipes the ground metric.
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
- `story-density` is the only density encoding. It is raised from places,
  sits under `borders`, and has no filter or toggle. Its weight is the
  place's freshest decay times `sqrt(n)`, on a fixed domain, without coverage.
- Keep `GAUSS_COEF` in the calibration, and keep stop 0 of `DENSITY_STOPS`
  transparent. Without them the field vanishes or paints the whole world.
- Only stories are rebuilt as the scrubber moves. Dated overlays move by
  `setFilter` (`applyTimeFilters`); toggles are visibility.
- Beacon radius is a percentile rank from `build.js`. A story with no figure
  gets a neutral size, not the smallest.
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
  again once, from `lastPointer`.
- `Popup.addTo` fires `close` synchronously on an open popup. Attach only
  through `attach()` (`reattaching`), or the card stays on "Loading…".
- A story card is one width at two densities. `preview()` prefetches the
  story, and `growTo` runs after the position is final.
- A dense place opens `openPlace`. It does not fly.
- Peek answers one question and clips (`.map-sheet.is-peek`). Its offsets
  are `--map-scrub-h` and `--map-rail-w`; the first is set on `body`, where
  the sheet is appended, and teardown removes it.

## Idle cost and measurement

- **Never write to a source on `idle` unless something changed.**
  `setFeatureState` always schedules a render, which fires `idle` again;
  compare first (`hoverStateWritten`, `prayerStateWritten`).
- `scheduleMetric` waits on the `countries` source (`sourcedata`), never a
  count of idles: a missed window leaves the world fully hatched.
  `applyMetric` sets `metricApplied` before it writes.
- Idle cost cannot be measured headless. `scripts/perf/idle-renders.mjs` runs
  headed behind a drag control; zero frames is also a broken measurement.
