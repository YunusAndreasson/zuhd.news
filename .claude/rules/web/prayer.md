---
paths:
  - "public/islands/_map/prayer.ts"
  - "public/islands/_map/solar.ts"
  - "scripts/lib/map-geo.test.js"
---

# Prayer lines

At any instant the set of places where a given prayer is entering is a curve;
five of them sweeping west is the earth as a prayer clock. adhan-js is the
test oracle, never an import — the island derives the curves in closed form.

## Prayer lines

`public/islands/_map/prayer.ts`, drawn by `situation-map.ts` and pinned in
`map-geo.test.js`. At any instant the set of places where a given prayer is
entering is a curve; five of them sweeping west is the earth as a prayer clock.
Added 2026-07-26.

- **The library is a test oracle, not an import.** adhan-js (Batoul Apps) is in
  `devDependencies` and the island ships none of it. adhan answers "what time is
  Fajr at this place" and the map needs the inverse, which has a closed form:
  `cos H = (sin alt − sin φ sin δ) / (cos φ cos δ)`, and the hour angle *is* the
  offset from the sub-solar meridian, so the answer is a longitude directly.
  Inverting adhan per latitude would be more code for a worse answer — it rounds
  to the minute (0.25° of longitude, so the curve staircases), it reads the
  calendar day off a `Date`'s *local* components, and its high-latitude rule
  substitutes a synthetic time rather than reporting that none exists. The test
  compares every curve against it to within 20 seconds, which is a stronger
  guarantee than importing it and costs the reader nothing.
- **A line stops where the prayer has no time.** `|cos H| > 1` means the sun
  does not reach that altitude at that latitude today, and the honest answer is
  no point. On the June solstice the Fajr line ends at 48°N; you can watch it
  retreat from the pole as the season turns. This is the reason above that
  actually matters — adhan would have kept drawing across the Arctic.
- **Umm al-Qura**, matching the Hijri date and the Makkah clock: Fajr 18.5°,
  Isha ninety minutes after Maghrib, Asr at shadow length one. No method is
  right everywhere and every method is a claim; the point is that the site makes
  one claim rather than two, and the chip's `title` names it.
- **Maghrib rides the terminator, ~0.83° outside it** — sunset is the disc's
  upper limb at −0.833° where `terminatorLat` is the geometric 0°. About three
  pixels of daylight between the shade edge and the line, at world zoom. They
  are not meant to coincide; snapping them together is a regression. This is
  also the highest-value label of the five: it says the boundary the reader can
  already see is a prayer time. Shuruq is deliberately absent — not a prayer,
  and its label would collide with Fajr's 18.5° away.
- **They keep drawing at the equinox, when the terminator does not.**
  `terminatorLat` bails at `|tan δ| < 1e-6` and the shade blinks out; the closed
  form has no such singularity. The window is about **twelve seconds**, twice a
  year — not the "few hours" `solar.ts` claims.
- **Asr parts from adhan by up to two minutes, deliberately.** `SolarTime`
  builds its solar coordinates at 0h UT of the local calendar day and
  `afternoon()` reads the declination straight off them, so adhan's shadow rule
  is anchored up to twelve hours from the prayer it describes. We anchor it at
  the place's own noon, which is what "the shadow an object casts at noon" means
  and is the only anchor that does not tear the curve: which calendar day a
  place is on changes *along* a line that circles the planet, so adhan's anchor
  would step the declination 0.4° at the date line and kink the Asr line in the
  middle of the Pacific. Two pixels at world zoom. Both halves are pinned.
- **Asr also needs a `|φ − δ| < 90` guard.** Past that, `tan` goes negative, the
  reciprocal comes back a negative altitude, and the solve returns a perfectly
  plausible longitude for a prayer with no time there — a second, fictitious Asr
  limb across the winter polar cap, every day of the year.
- **The walk is adaptive and cut at the antimeridian.** Near the poles these
  curves run nearly east-west and a flat 1° latitude step moves up to **31° of
  longitude** — a chord across the Arctic. Bisecting where the step exceeds 2°
  brings the worst case to 2.95°, and only at the map edge. And unlike the
  terminator ring these are functions of latitude, so they *do* cross ±180;
  with `renderWorldCopies` off an uncut segment is drawn straight back across
  the whole map as a horizontal bar.
- **`symbol-spacing` has a ceiling of 512, and going over it deletes the labels
  rather than thinning them.** MapLibre multiplies it by `EXTENT / tileSize`
  (8192 / 512 = 16) to get tile units, then places an anchor every `spacing`
  along each tile-clipped fragment. At 1400 that is 22400 units across a tile
  8192 wide, so no anchor is ever placed, at any zoom — five dashed curves and
  not one word saying what they are, with nothing in the console. It is 250.
  `text-rotation-alignment: 'viewport'` is load-bearing too: Dhuhr is a meridian
  and the default map-aligned rotation sets it bottom-to-top.
- **The labels are placed last of everything, so they are opportunistic.**
  MapLibre walks symbol layers top-down and the *later* layer claims its boxes
  first, so `beforeId: 'country-labels'` is what makes country names win — and
  it necessarily also puts prayer labels behind the city labels, the cluster
  counts and the market numerals, because all of those sit above
  `country-labels` in the style. There is no position that loses to country
  names and beats the rest. So the two knobs that matter are the number of
  candidate anchors and the size of the box each one asks for: at
  `symbol-spacing: 420` with `text-padding: 6` the Dhuhr line went unnamed
  across the Americas and *every* line went unnamed zoomed into Europe. 250 and
  2 fixed both. Some line will still occasionally go unlabelled — which is what
  the hover readout below is for, and why it is not a nicety.
- **Hovering a line names it and says when it reaches that spot**
  (`.map-prayer-tip`). The name is the part the labels cannot guarantee. The
  time is the part worth reading twice: it is the same prayer all along the
  line and not the same o'clock, and watching Isha run from 20:37 at one
  latitude to 19:20 further down is the curve explaining its own shape. It is
  **local mean solar time, marked `solar`** — the one place this map does not
  speak Makkah, because "what o'clock is it *there*" is a different question
  from the map's own clock. Civil time would want a lat/lng → IANA-zone dataset
  the site does not ship, and the nautical approximation is a guess dressed as
  a clock; solar is exact, free, and the frame the sun is actually in. Up to
  about ninety minutes separates it from a phone standing there, so the word
  `solar` is not decoration. `prayerInstantAt` is the curve solved for time
  rather than longitude, and it is correct *off* the line too — the grab box is
  seven pixels, which at world zoom is minutes of solar time, so a readout that
  reported the time on the line rather than under the cursor would look right
  and drift. Pinned against adhan in both directions.
- **Dashed, near-neutral (`MAP_COLOURS.prayer`), and the colour is the absence
  of one.** Solid would read as a coastline. These lines carry no value, so they
  get no hue — a warm tone was the first instinct and landed six points of hue
  from `OVERLAY_COLOUR.straits`, the exact collision the mark alphabet was built
  to stop making. The line sits at `line-opacity` 0.2 (about 1.5:1 on the land,
  quieter than a frontier); the **label is full strength**, because it is the
  whole difference between a prayer time and a stray hairline. `line-width` is
  constant: `line-dasharray` is measured in line widths, so a varying width
  stretches the pattern instead of thickening the line, in floored steps.
- **Hover lights the line; nothing takes a click.** A padded box query on the
  existing global `mousemove`, only when no mark has already claimed the
  pointer, then `feature-state`. It is deliberately absent from `MARKER_LAYERS`:
  these lines cross every country there is, so joining the click path would
  carve a band out of every country card on the map.
- **It has a toggle, unlike the terminator it is drawn against.** The terminator
  is an unlabelled wash; this is five named lines across every continent, which
  is a larger footprint than any feed here. The chip leads the layer row because
  the lines are drawn first, and its glyph comes from `_map/glyphs.ts` like
  every other chip — a chip-only entry, as `dot` is, since MapLibre dashes a
  `line` layer natively and there is nothing for `addImage` to rasterise.
- **They read the wall clock, not `scrubNow`**, as the terminator always has:
  the lines are drawn against the shade, and a Tuesday Maghrib over today's
  night would be two clocks in one picture. Redrawn by `drawSolar` on the
  existing 120-second tick — `prayerLines()` costs 0.26ms.
