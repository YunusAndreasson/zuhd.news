---
paths:
  - "mobile/components/globe/**"
  - "mobile/components/map/GlobeGestureLayer.tsx"
  - "mobile/hooks/useCameraFlight.ts"
  - "mobile/hooks/useOverlays.ts"
  - "mobile/lib/globe-*.ts"
  - "mobile/lib/map-feed.ts"
  - "mobile/lib/market-map-layout.ts"
  - "mobile/lib/story-places.ts"
  - "mobile/lib/found-store.ts"
  - "mobile/lib/strait-map.ts"
  - "mobile/lib/tap-result.ts"
  - "mobile/scripts/generate-globe-geography.mjs"
  - "mobile/lib/overlays.ts"
  - "mobile/hooks/useConflictEvents.ts"
  - "mobile/components/SheetMapKeyPage.tsx"
  - "mobile/app/index.tsx"
  - "mobile/__tests__/camera-flight.test.ts"
  - "mobile/__tests__/globe-*.test.ts"
  - "mobile/__tests__/ortho-*.test.ts"
  - "mobile/__tests__/sphere-circles.test.ts"
---

# The app's globe

## Camera

- `MiniGlobe.storyProgress` is a float index into `cameraTrack`
  (`cameraTrackOf`, `lib/map-feed.ts`): one entry per story, stories only.
  Alerts never enter it.
- `cameraOwner` is `0` for the deck (`storyProgress`) or `1` for a target (a
  drag, a gauge or alert, a flight). Ownership is decided on the UI thread
  (`claimForDeck`, `releaseForDeck`, `toStoryIfHeld` in `useCameraFlight`).
  Never take the camera back mid-drag: the earth snaps.
- A gesture starts from `viewLat`/`viewLng`, never `cameraLat`/`cameraLng`,
  which are stale while the deck owns the camera.
- A jump is never an animated swipe. Hold the camera, jump the position, then
  fly. Every entry point goes through `focusStory`; the ones that mean "read
  this" pass `grow`.
- Cancel a flight with `cancelFlight`, never by stopping `flightT` alone: the
  zoom override belongs to the flight and would strand the globe zoomed out.
- A flight's last frame must be drawn at the settled tier.
- Whether a crossing rides the finger or flies is a comparison of durations
  (`crossingFlies` in `lib/globe-camera.ts`: `flyMs` against `DECK_SETTLE_MS`),
  never of arcs.
- The flight path is van Wijk's (`flyCurve`, `FLY_RHO` 1.35, the web's
  `flyTo`). Keep `flyPosition`: without it the rise is decoration. The rise is
  capped at `SWIPE_OUT_MAX` by bisecting ρ down.
- Story framings span 18°–24° (`clipAngleForArea`). Keep that spread subtle; a
  wider one reads as the map jumping on every swipe.
- A pinch out holds. Zoom is handed back only by a pinch that ends near the
  story's framing (`pinchHandsBack`).
- Zoom is a clip angle. Zooming in grows the planet past the screen
  (`viewAngleFor`); it never magnifies a patch inside the circle.
- Camera arithmetic is in `lib/globe-camera.ts`, pinned against d3.

## Drawing

- The globe has a 32 ms JS budget. Don't regress the throttle in the reaction
  that schedules a reprojection (`lastTimeRef`), or its trailing edge
  (`retick`): without the trailing run the map stays at the coarse tier after
  a drag.
- Moving layers never go through React. `recordGlobeFrame` records three
  `SkPicture`s that reach the canvas through one shared value. Publish once per
  projection, and never put a `setState` in the frame.
- `GlobeCanvas` stays its own memoized component fed by shared values. Any
  commit under `<Canvas>` redraws the whole scene on the JS thread.
- No inline object prop on `<MiniGlobe>`; key it with `useMemo` on its numbers.
- JS never reads the zoom override to redraw; replay `lastReprojRef`.
- No path goes through d3. Coasts and borders are `ortho-stream.ts`; anything
  that is a circle on the sphere is `sphere-circles.ts`. Both are held to d3 by
  tests. `projRef` survives only for `hitTest`'s `invert`.
- Never read a Skia method per vertex. Hold `moveTo`/`lineTo`/`conicTo` and
  call them through `.call` (`createSkiaPathContext`).
- A label font is a face at a size (`useSizedFont`), one `useTypeface` per
  file. `useFont` reads and parses its file on every call.
- A moving frame is the coarse motion tier. At story framings, lakes, rivers
  and resting detail are settled-frame work (`nearSettled`). The first frame
  is the motion tier.
- A geography tier is decoded in parts, lazily (`warmGlobeGeography`, one stage
  per call), never whole in the slot that needs it. The country bounds table is
  written by `mobile/scripts/generate-globe-geography.mjs`; regenerate it with the
  tiers.
- Between projections the picture is warped on the UI thread, and a landing's
  settled frame is prefetched and faded in (`prefetchSettled`, `drawLanding`,
  `GROUND_FADE_MS`). Don't replace either with a hard swap.
- The warp is one derived value over the picture and the camera (`warp`).
  Never draw from a shared value a reaction writes, such as `tapFrame`: the
  write can land a frame late, and a new picture is drawn with the last one's
  slide, which shows as a wobble before a landing.

## Marks

- Colours are the web's: `mark*` tokens, both themes.
- A tap on a beacon finds its story: `collect` bursts, `found-store` records
  the slug, the deck jumps (`focusStory`) and stays at peek. The camera waits
  for most of the burst (`COLLECT_MS`) before it flies.
- Found means opened: a mark tap, growing a card, or landing on a card while
  grown. Swiping past a card at rest does not find it.
- A found place dims to a hollow ring. It is never erased.
- A story's beacon within 32 px wins the hit test unless a strait, exchange,
  hazard or conflict mark is nearer the finger. Hotspots, the settled dot and
  Makkah never outrank a story.
- The current story's dot holds still. Its place is named large instead.
- Nothing prints over anything else: every always-drawn thing reserves its
  room before a name is placed. A cluster draws no leader line.
- Markets are laid out at rest and carried while the globe moves
  (`followMarketLayout`). Never lay them out per moving frame. Below
  `MARK_NAMES_PLANET_CLIP` they share a target only where there is no room to
  show them apart; past it they group by distance.
- Past `MARK_NAMES_PLANET_CLIP` a cluster keeps only its count and a quiet
  strait only its mark. Single exchanges and pinched or surging straits keep
  their names.
- A mark prints the week, as the strip does, wherever the series has one
  (`exchangeMove` for an exchange, `straitMoves` for a strait). Marks keep the
  index name; the strip uses words.
- Conflict marks are the last day only and are sized by the dead
  (`conflictScale`). The list holds the whole week.
- Famine and thermal are one tinted Atlas each, from the sprite sheet baked in
  `MiniGlobe`. Genocide is drawn as circles, above the stories. `useOverlays`
  fetches all three.
