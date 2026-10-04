---
paths:
  - "public/islands/situation-map.ts"
  - "public/islands/_map/style.ts"
  - "public/islands/_map/glyphs.ts"
  - "public/islands/_map/markets.ts"
  - "scripts/build/basemap.js"
  - "scripts/lib/map-geo.test.js"
  - "shared/genocide.ts"
  - "shared/place-names.ts"
  - "shared/countries/**"
  - "scripts/lib/ipc.js"
  - "scripts/lib/firms.js"
  - "scripts/lib/conflict.js"
  - "scripts/lib/gdacs.js"
  - "scripts/lib/market-metadata.js"
  - "scripts/lib/chokepoint-metadata.js"
---

# The map's layers: basemap, names, the land ramp, hazards, market marks

Camera, MapLibre and cards are `map.md`; the rails are `map-rail.md`.

## Basemap and build

- Every file the basemap is built from belongs in the list `BASEMAP_V` hashes
  (`scripts/build.js`). The basemap files `public/_headers` names are cached
  for a day, so a source left out goes stale with no way for a reader to force
  it.
- There is no 1:110m first-paint tier: 110m deletes real geography.

## Labels and names

- `basemap.js` merges Natural Earth's Israel and Palestine with `merge()` and
  labels the result Palestine (ISO2 `PS`). This is a decision.
- Names come from `shared/place-names.ts` (`displayLocation`,
  `displayCountryName`): Yafa, Al-Quds, Malvinas, Kanaky, Kalaallit Nunaat.
  **Never** read `properties.name` straight off Natural Earth.
- Western Sahara, Puerto Rico, Persian Gulf, Sea of Japan and Bahía de Campeche
  keep their names. These are decisions; `scripts/lib/map-geo.test.js` pins
  Western Sahara, Persian Gulf and Sea of Japan.
- `country-labels` and `sea-labels` carry no `minzoom`. Density is the `area`
  or `rank` filter's job, never a zoom floor's.
- The density lever for country names is `text-padding`, not a higher `area`
  gate, which deletes small states such as Lebanon at every zoom it covers.
- `sea-labels` stays the last layer in the base style, so it claims its space
  before country and city names.
- Country names stay quiet (Regular, halo 1) in `labelDim`; `neutral` fails on
  the brightest land. A halo does not make a label readable.
- `DENSITY_STOPS` peaks at 0.30: type on the wash must keep 3:1.

## Water, day and night

- Rivers and lake rims take `water`, not `ocean`, which vanishes on hatched
  land. Saturation is what separates `water` from `border`.
- `lakes` fill in `ocean`, above `land` and under `borders`: a frontier across
  a lake stays drawn.
- River width does not vary by rank: a river is not a quantity.
- `night-shade` is `MAP_COLOURS.ocean` at 0.28, not black: the dark half must
  not be darker than space.
- `day-shade` is inserted before `land` so it reaches only water. Which pole
  `dayPolygon` closes over fails silently if reversed.
- `twilight` is one blurred band that lightens. The three real twilight caps
  would come and go with the season.

## The land ramp

- The map opens on `population` (`DEFAULT_METRIC`). Press freedom as the
  default was an editorial claim.
- The tone is the value, not the percentile. Every metric states
  `METRICS[key].scale` (`'linear'` or `'log'`); it is editorial, never derived.
- `ascending` means lower is better and flips the ramp. Do not add it to other
  metrics: it renumbers the ranks the country pages print.
- No figure is hatched, never shaded (`nodataHatch`, `land-nodata`): any tone
  claims a position. Its registration is the only try/catch in
  `addDataLayers`. `NODATA_HATCH` feeds the sprite and the key's swatch.
- `CC_TO_TOPOJSON_NAME` (`shared/countries/iso.ts`) is a join key in Natural
  Earth's spelling (`Macedonia`), not a label. A miss leaves a country
  unshadeable and unclickable, with nothing thrown.
- `populationDensity` is derived in `getMetricValue` where the table has
  nothing. Stored values are never overwritten.
- `country-augmented.ts` cannot be regenerated (its generator is not in the
  repo), so its missing countries are hatched, correctly.

## Hazard layers

- Genocide marks only what a named UN body has determined
  (`shared/genocide.ts`). It draws last, never collides, and its card leads
  with the body that made the finding, not a casualty figure.
- Genocide and famine are conditions: the scrubber must never filter them.
- The genocide chip is a real toggle switching `genocide-marks`, `-core` and
  `-labels` together. It is the last chip, after `famine`, and shares
  `conflict`'s hue. Every other overlay stays 20 saturation points under it
  (`map-geo.test.js`).
- Famine reads the IPC's `overall_phase`, never derives it from populations.
  `0` means not analysed.
- The famine bar is compound (`publishable`): Phase 4+, or anyone counted in
  Phase 5. Gaza's areas classify at 3 while holding Catastrophe caseloads; the
  card says so where the two disagree.
- Analyses older than `AGE_LIMIT_MONTHS` are dropped. Projections are never
  drawn: they have no published phase.
- Famine is a mark at `representativePoint`, not a land tint, and not the
  IPC's palette, whose top stops are conflict's red. Phase rides on shape.
- Thermal is corroboration, not a fire map. A detection is drawn only near a
  story whose title or concepts match `THERMAL_VOCABULARY`. Never match the
  body, and never match `strike` bare.
- Persistence is the only flare filter (`PERSIST_DROP_DAYS`, distinct dates).
  `ESCALATION_FACTOR` keeps a growing wildfire.
- The thermal card says what the instrument saw and its distance from the
  story, never what burned.
- Conflict recency anchors on `conflictNewest`, never `Date.now()`: UCDP
  publishes months in arrears.
- Overlay contrast is held against the ocean and `labelHalo`, not the land.
- Refused: live military aircraft and ship positions, jamming maps, imagery
  change detection, navigation warnings, ACLED. A layer needs a named
  institution's republishable finding: no force movements, no spoofable
  feed, and never this site as the primary source.

## Market marks and glyphs

- Shape says what, colour says which way. Silhouettes are real distance
  fields (`_map/glyphs.ts`, `sdf: true`); a mask ignores the halo.
- The chips are the legend and draw from the same `GLYPHS` (`chipGlyph`).
- Every mark layer sets `icon-allow-overlap` (a collided mark cannot be
  hovered) and `icon-ignore-placement: true` (MapLibre deletes a label a mark
  suppresses, so a beacon over a name is accepted). `genocide-labels` is the
  exception (`text-ignore-placement: false`): text over text is unreadable.
- **Off is an ink step, never opacity**: `colour-system.test.js` cannot see it.
- A market's sign picks `--map-pos`/`--map-neg`, pinned to `OVERLAY_COLOUR`.
  A closed exchange sits back in opacity; under `FLAT_PCT` the mark is
  `tick-flat` in `neutral`.
- Only large moves print a numeral, with its `%`, by a `case` in `text-field`.
- Markets and thermal draw above stories: a single mark, covered, is absent.
- Which exchanges is editorial (`market-metadata.js`). One with no free
  series stays, `available: false` with a reason. `days` are per exchange.
- Yahoo answers an unknown symbol with another instrument. Each entry pins
  currency and zone for `instrumentMismatch`. The day's change is the last
  two closes, never `chartPreviousClose`.
