---
paths:
  - "public/islands/_map/prayer.ts"
  - "public/islands/_map/solar.ts"
  - "public/islands/situation-map.ts"
  - "scripts/lib/map-geo.test.js"
---

# Prayer lines

At any instant the places where a prayer is entering form a curve.
`_map/prayer.ts` derives the five in closed form, `situation-map.ts` draws
them, and `map-geo.test.js` pins them.

## The geometry

- adhan-js is a test oracle in `devDependencies`, never an import. The test
  holds Fajr, Dhuhr, Maghrib and Isha within 20 seconds of it, and Asr within
  150.
- The method is Umm al-Qura (`UMM_AL_QURA`): Fajr 18.5°, Isha ninety minutes
  after Maghrib, Asr at shadow length one. It matches the Hijri date and the
  Makkah clock, so the site makes one claim. `PRAYER_NOTE` names it in the key.
- A line stops where the prayer has no time (`|cos H| > 1`). Never substitute a
  synthetic time, as adhan does across the Arctic.
- Asr also needs the `|φ − δ| < 90` guard. Without it the solve returns a
  plausible longitude for a prayer with no time: a second Asr limb across the
  winter polar cap.
- Asr is anchored at the place's own noon, so it parts from adhan by up to two
  minutes on purpose. adhan's anchor steps the declination at the date line and
  kinks the line.
- Maghrib sits about 0.83° outside the terminator: sunset is the disc's upper
  limb at −0.833°, and `terminatorLat` is the geometric 0°. Snapping them
  together is a regression. Shuruq is absent: it is not a prayer.
- The lines keep drawing at the equinox, when `terminatorLat` bails.
- The walk is adaptive (`MAX_CHORD`) and cut at the antimeridian. An uncut
  segment is drawn back across the whole map as a horizontal bar.
- The lines read the wall clock, not `scrubNow`, like the terminator. They are
  redrawn by `drawSolar` on `SUN_TICK_MS`.

## The layer

- No toggle: a prayer line is geometry, like the terminator. Its explanation
  is a note in the key panel.
- `symbol-spacing` is 250. Over 512, MapLibre places no anchor at any zoom and
  the labels vanish with nothing in the console.
- `text-rotation-alignment: 'viewport'` stays: Dhuhr is a meridian, and
  map-aligned text sets it bottom to top.
- The labels sit `beforeId: 'country-labels'`, so country names win, and so
  does every label layer above them. Keep `text-padding` at 2: larger boxes
  left whole lines unnamed. A line can still go unlabelled, which is what the
  hover is for.
- Hover names the line and gives the time under the cursor
  (`prayerInstantAt`), in local mean solar time marked `solar`
  (`.map-prayer-tip`). Civil time would need a zone dataset the site does not
  ship. It is the one place the map does not speak Makkah.
- Dashed and near-neutral (`MAP_COLOURS.prayer`): the lines carry no value, so
  they get no hue. The line is `line-opacity` 0.2 and the label full strength.
  `line-width` is constant, because `line-dasharray` is measured in line
  widths.
- Hover lights a line through `feature-state`; nothing takes a click. The
  layer stays out of `MARKER_LAYERS`: the lines cross every country and would
  carve a band out of every country card. The grab box is `PRAYER_GRAB_PX`.
