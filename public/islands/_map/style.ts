// MapLibre style for the situational map.
//
// Everything is served from our own origin — country geometry, place labels and
// the SDF glyph ranges — so there is no tile provider, no API key and no
// third-party request. The CSP stays `default-src 'none'`.
//
// Dark by design rather than by theme: coloured markers need a dark ground to
// read against, and every operational map worth copying commits to it.

import type { StyleSpecification } from 'maplibre-gl'

/**
 * What MapLibre paints.
 *
 * The chrome *over* this canvas is painted by CSS, from the `--map-*` block in
 * `style.css` scoped to `body.map-page, body.doc-page`. The two are one palette
 * split across two languages because neither can read the other: the style is
 * handed to a worker before any stylesheet is queryable, and CSS cannot import
 * a module. Where a value appears on both sides it is called out here and
 * there — change one, change the other.
 *
 * `ocean` is `--map-ground`. It is not only the sea: the HUD and scrubber
 * gradients fade into it, and a cluster disc is filled with it so a numeral
 * reads clear of the coastline underneath. A drift here shows up as a seam
 * between the canvas and the chrome sitting on it.
 */
export const MAP_COLOURS = {
  /** = `--map-ground` in style.css. */
  ocean: '#080a0d',
  land: '#15181e',
  landHi: '#1b1f27',
  /**
   * Frontiers *and* coastlines — `borders` is the only line layer, so this one
   * value has to read against the ocean on one side and against whatever the
   * metric has painted the land on the other.
   *
   * Was `#2b313b`, which measured 1.06:1 against the land it was drawn on. That
   * is not a quiet border, it is an absent one: the line was there and nobody
   * could see it. It sat just above the old ramp's ceiling, and the ramp was
   * capped to protect it — a cap that cost the metric encoding its whole range
   * and bought a border that was invisible anyway.
   *
   * Now above the widened ramp's ceiling (1.36:1) and 3.3:1 against the ocean,
   * so a coastline is a coastline and a country with no figure still reads as
   * land rather than sea.
   */
  border: '#5c6470',
  /**
   * A mark that is making no claim: a strait running at its baseline, an
   * exchange that has not moved.
   *
   * Was `coast: '#39414e'`, and the name was already wrong — nothing has ever
   * drawn a coastline in it, because `borders` is the only line layer and it
   * uses `border`. Its three real users were all "nothing to report", and it
   * did that job at **1.93:1 against the ocean** and 1.26:1 against the land
   * ramp's top. So the map's most common state — on a quiet day most of the
   * market layer is flat — was also its least visible one, on marks that sit in
   * straits and coastal cities.
   *
   * It was `label`'s value when it was chosen, on the reasoning that this is the
   * map's tone for "furniture, not data": 6.7:1 on the ocean, 2.8:1 on the ramp's
   * brightest stop, and with the marks' dark halo the ground stops being a
   * variable at all. `label` has since moved much lighter and this has not,
   * because that argument is sound for a *mark* and was never sound for text —
   * see the note there. A 7px silhouette with a dark halo is read by its shape;
   * a letterform needs the ground behind it. Same value once, two jobs, and the
   * jobs have parted.
   */
  neutral: '#8d97a6',
  /**
   * Basemap place labels, and the numeral naming how many stories a place holds.
   *
   * Was `#8d97a6`, the same value as `neutral` — and the note there still
   * describes that value as "the map's tone for furniture, not data". The two
   * have parted: `neutral` is a *mark* saying nothing is happening, which a dark
   * halo and 7px of silhouette carry perfectly well, and this is **text**. A
   * letterform is read by its shape, so what matters is its contrast against the
   * pixels immediately behind it, not against a halo drawn around it.
   *
   * At `#8d97a6` a city name measured **2.76:1 on the brightest land the metric
   * can paint and 1.80:1 once the density wash lifted it** — well under AA, on
   * the labels naming the places the news is happening in. It is 5.66:1 and
   * 3.87:1 now. The chrome's own text uses `--map-ink-*`, which is a different
   * scale tuned against the panels rather than against the land.
   */
  label: '#d3d7dd',
  /**
   * Country names, and the dot marking a capital.
   *
   * This used to be `#727b88` and read *"quiet on purpose, and carried by
   * `labelHalo` rather than by its own contrast — the land underneath is now a
   * variable, so the halo is the only thing about a label that does not move."*
   * That reasoning is why the map was hard to read, and it is worth keeping the
   * sentence to say so. A halo makes a label **findable**; it does not make it
   * **readable**. A 1.1px outline around an 8.5px glyph leaves the letterform
   * itself at whatever contrast the ground happens to allow — and measured, that
   * was **1.90:1 on the brightest land and 1.24:1 under the density wash**. The
   * most prominent text on the map was, on a third of the world, an outline of a
   * word rather than a word.
   *
   * It is 4.90:1 and 3.35:1 now: AA against every tone the ground can take
   * unwashed, and clear of the 3:1 non-text floor even at the wash's peak. Which
   * is only reachable because the wash's own ceiling came down at the same time
   * — see `DENSITY_STOPS`. The halo did not go away, it got thicker; it is now
   * the *second* line of defence rather than the only one.
   *
   * Deliberately still a step below `label`: cities are the louder of the two,
   * because a country name is already carried by being uppercase, letter-spaced
   * and set at a centroid with nothing near it. And it lands within a hair of
   * `prayer` (1.05:1), which is not an oversight — both are basemap furniture in
   * the same 216° family, and what separates a prayer label from a country name
   * is that one runs along a dashed curve and the other sits still. Shape does
   * the work, exactly as `MAP_COLOURS.prayer` argues.
   */
  labelDim: '#c5c9cf',
  labelHalo: '#05070a',
  /**
   * The prayer lines, and their labels.
   *
   * Near-neutral on purpose. Every hue on this map means something — a
   * category, a direction, a severity — and these lines mean none of those:
   * they carry no value, so they get no value channel. Shape does the work
   * instead, the way `glyphs.ts` argues it should. A dash is the one silhouette
   * nothing else here uses.
   *
   * A warm tone was the first instinct and it was wrong: at 38° of hue it lands
   * six points from `OVERLAY_COLOUR.straits` (#c9a84c), which is the exact
   * collision the mark alphabet was built to stop making. Lighter than `border`
   * and cooler than nothing, so a hairline at 0.2 sits at about 1.5:1 over the
   * land — present, and quieter than a frontier — while the label at full
   * strength clears AA against every ground tone the ramp can paint.
   */
  prayer: '#c0c4ca',
  /**
   * Inland water — river threads, and the rim of a lake.
   *
   * There is no colour that works flat here, and finding that out is the whole
   * reason this is a separate token rather than a reuse. A river drawn in
   * `ocean` — the obvious choice, since it is literally the same substance —
   * measures **1.04:1 against `LAND_NO_DATA`** and 1.21:1 on the ramp's darkest
   * stop, so it would vanish across the thirty hatched countries and most of
   * the dark half of every metric. And any mid-tone picked to survive that
   * collides with one of the ramp's own five stops: the best flat candidate a
   * search could find still measured 1.10:1 against `border`, which is a river
   * indistinguishable from a frontier.
   *
   * Hue cannot break the tie either, because `border` and `prayer` are *both*
   * at 216° — the blue-grey family is already this map's furniture. So the
   * separation is saturation, the same argument the genocide tone makes against
   * conflict: 40% here against `border`'s 10%, thirty points clear, in a family
   * a reader already reads as "ground, not data". Against the six tones the
   * land can be painted it holds a 1.92:1 minimum — louder than the prayer
   * lines' ~1.5:1, which is right, since a river is a fact about the ground
   * rather than a construction laid over it.
   */
  water: '#4a7fae',
  /**
   * Marine labels — the seas, gulfs and straits.
   *
   * Split off from `water` on 2026-07-30 for the reason `label` split from
   * `neutral`: a line and a word are not the same job. Everything the long note
   * on `water` argues is about a *line* — it has to separate from `border` at
   * thirty saturation points and survive on a hatched country — and none of it is
   * about text. Measured as text, `water` read **1.92:1 on the brightest land**
   * and 1.25:1 under the wash, which is where labels like the Persian Gulf and
   * the Red Sea sit once they drift onto a coast.
   *
   * Same hue, same family, lightness raised until a sea name clears 3:1 on every
   * ground it can reach: 4.6:1 unwashed, 3.2:1 at the wash's peak, and 11:1 on
   * the open water where most of them actually sit. Saturation is held near
   * `water`'s so a sea *reads* as the same substance as the rivers running into
   * it — the relationship that note was written to protect.
   */
  waterLabel: '#b8c4d7',
  /**
   * The density wash — how far the news reaches.
   *
   * 216°, the same hue as `border` and `prayer`, because blue-grey is already
   * this map's furniture family and a field carrying one quantity is furniture.
   * Saturation is **5.4% against `border`'s 9.8%**, so the wash is *less*
   * chromatic than a frontier and cannot compete with a category — which is the
   * whole reason `LAND_RAMP`'s first constraint exists, restated one layer up.
   *
   * Two things keep it off the land ramp, and the first is not a colour.
   *
   * 1. **Structural.** `story-density` is inserted *under* `borders`, so the
   *    wash is the only thing on this map with no edge. A shaded country is a
   *    polygon bounded by a frontier; a patch of field is a gradient bounded by
   *    nothing. That is a difference of kind, the same argument `nodataHatch`
   *    makes, and no choice of tone substitutes for it.
   * 2. **Numerical.** Composited over `LAND_RAMP[4]` — the brightest tone the
   *    ground can ever take — the faintest visible stop lifts it **1.26:1** and
   *    the peak **1.54:1**, against the ramp's own largest internal step of
   *    1.21:1. So the wash's *quietest* visible tone is already outside the
   *    ramp's entire vocabulary.
   *
   * And a ceiling, which is the constraint nobody writes down until the map
   * inverts: the peak stays **1.24:1 below `labelDim`**, the quietest ink ever
   * drawn over it. Every label, beacon and glyph on this map is lighter than its
   * ground — that is what the opening comment means by coloured markers needing
   * a dark ground — so a wash bright enough to pass the ink would locally invert
   * the map, and every colour on it was chosen for light-on-dark. The corridor
   * between `LAND_RAMP[4]` and `labelDim` is 1.90:1 wide and the field spends
   * 1.54:1 of it. That restraint is the point: magnitude is carried by how
   * *wide* a patch is, not how bright.
   */
  density: '#9ea2a8',
  /**
   * The ring on a story its sources disagree sharply about.
   *
   * Lived in `situation-map.ts` as a raw literal, where `colour-system.test.js`
   * cannot see it — that test reads this file and `style.css` and nothing else.
   */
  contested: '#e8e2d4',
} as const

/** Category hues, low-saturation so four of them can coexist without shouting. */
export const CATEGORY_COLOUR: Record<string, string> = {
  politics: '#d2604a',
  economy: '#d0a24a',
  science: '#4fa0a4',
  tech: '#8b96d4',
}

export const CATEGORY_ORDER = ['politics', 'economy', 'science', 'tech']

/**
 * The three overlay layers, in the colour each one draws itself.
 *
 * Here rather than inline in the layer paint because the HUD chips now carry
 * these too. A legend that names its colour separately from the layer that
 * paints it is a legend waiting to go stale — the chip would keep saying amber
 * long after the marks turned some other shade.
 *
 * `straits` is the one judgement call. Chokepoint rings are neutral at rest and
 * only take a colour when traffic moves off its baseline: gold for a blockage,
 * a cool tone for a surge. Gold is what the layer looks like when it is saying
 * something, so it is what the chip shows.
 */
export const OVERLAY_COLOUR = {
  gdacs: '#b8763f',
  /**
   * A thermal anomaly — infrared heat a satellite pass measured, beside a story
   * we published.
   *
   * **Deliberately `gdacs`'s hue**, at a lighter step: 27° on both, lightness
   * .57 against .48. Sharing it is the argument, not an accident — this is the
   * same subject as the disaster layer, the way `genocide` is the far end of
   * `conflict`, and `glyphs.ts` earns the reuse by putting identity in the
   * silhouette: "once the silhouette identifies the layer, two layers sharing a
   * hue stops being a defect".
   *
   * The lightness step is not decoration either. A GDACS wildfire alert and its
   * thermal footprint are *the same coordinate*, so these two marks are drawn on
   * top of each other routinely; in one tone that pair reads as a single object
   * with a strange outline, and asking a reader to separate a hazard triangle
   * from a radiant burst at six pixels is asking too much of shape alone.
   *
   * Saturation is .65, and the ceiling is not a matter of taste: the genocide
   * test requires every other overlay to sit 20 saturation points below it, so
   * .71 is the hard limit. The hotter, more obvious oranges — `#e8632f` at .80,
   * `#e0713a` at .73 — both fail it. That is the test doing its job, keeping the
   * one unmuted tone on this map unspent.
   */
  thermal: '#d98a4a',
  /** = `--map-straits` in style.css, which the chokepoint sparkline is drawn
   *  in. Shares a hex with the site's `--brand` and means something else. */
  straits: '#c9a84c',
  /** Surge — traffic above baseline, the opposite story from the same number.
   *  = `--map-straits-surge`. */
  straitsSurge: '#5f9ea0',
  conflict: '#c05252',
  /** Conflict marks are filled discs; this is the fill under the stroke. */
  conflictFill: '#8c2f2f',
  /**
   * Genocide.
   *
   * Every other mark on this map is muted — ochre, gold, a dulled red, a land
   * tint that never reaches full value — because a situational display that
   * shouts everywhere says nothing anywhere. That restraint is what makes one
   * unmuted tone available, and this is the only thing spending it.
   *
   * The same hue as conflict, at the saturation conflict deliberately does not
   * have. Sharing the hue is the point: this is not a different subject from
   * the red already on the map, it is the far end of it, and a reader who has
   * learned that red means people being killed should not have to learn a
   * second vocabulary to read the gravest case. `#c05252` is that red held
   * back — 44% saturation, so a few hundred of them can sit on one map without
   * setting it on fire. This is the same red let go, and only two marks are
   * ever allowed to spend it.
   */
  genocide: '#f5372b',
  /** The dark core the ring encloses, so the mark reads over any land tone. */
  genocideCore: '#0b0d11',
  /**
   * An area the IPC has classified at Emergency or worse.
   *
   * **Violet, and the hue is the argument.** Every other overlay on this map is
   * warm — gdacs and thermal at 27°, straits 44°, marketDown 24°, conflict and
   * genocide at 0–4° — with one teal for a surging strait and one sage for a
   * rising index. So a warm tone would have landed inside the family that already
   * means *violence or a hazard*, and famine is neither: it is a determination
   * about people's food, made by a technical body, and a reader who has learned
   * that red on this map means people being killed must not have to unlearn it
   * here. At 269° this sits **87° from its nearest neighbour**, which is the
   * largest separation the wheel still had, and clear of the 216° blue-grey the
   * furniture occupies.
   *
   * It is deliberately **not the IPC's own five-phase palette** (pale green →
   * yellow → orange → red → dark red). That palette is internationally
   * recognised, which is a real argument for it, and it loses to two others: its
   * top two stops are the red family this map has already spent on conflict and
   * genocide — Phase 5's dark red would sit a few points from `conflict` and
   * inside the 20-saturation-point corridor `map-geo.test.js` reserves for the
   * genocide mark — and five saturated hues for one layer is most of the map's
   * remaining colour budget. `glyphs.ts` already says how to avoid paying it:
   * once the silhouette identifies the layer, the phase can ride on shape. So
   * the famine glyph is a filled level and this is one tone.
   *
   * Muted like every mark that is not genocide: s = 0.37 against that mark's
   * 0.91. And measured where it matters — **6.94:1 against `labelHalo`**, which
   * `MAP_COLOURS.neutral` explains is the real invariant for a haloed overlay
   * mark, plus 6.82:1 on the ocean and 5.68:1 on the brightest tone the land ramp
   * can take. A ramp-stop bar is not the standard here; the halo is.
   */
  famine: '#a98bc9',
  /**
   * A market's direction on the day.
   *
   * These are `--map-pos` and `--map-neg` from style.css, not new colours: the
   * site already has a pair that means "a signed change", they already clear AA
   * on every map surface, and a rising index is the same kind of fact as a
   * rising indicator on an entity page. Introducing a second green would be
   * asking the reader to learn a second vocabulary for one idea.
   *
   * Muted on purpose, like everything else here. Thirty of these sit on the map
   * at once, and the one unmuted tone on this display is spent on genocide.
   */
  marketUp: '#9aab86',
  marketDown: '#c08a6a',
} as const

/**
 * The land ramp — how a country's value for the chosen metric becomes a tone.
 *
 * Two constraints fix this palette, and both are load-bearing:
 *
 * 1. **Neutral, never chromatic.** Category hue is the only colour on this map
 *    that means anything, which is precisely what was won back by deleting the
 *    cluster heat ramp. A choropleth in gold or teal would take it straight
 *    back. Every stop here is the same blue-grey as the base land, varying only
 *    in lightness. Saturation *tapers* as lightness rises, because a fixed HSL
 *    saturation widens the channel spread as it lightens — the top of the ramp
 *    would drift chromatic while every stop still claimed the same S.
 * 2. **Clear of `border`.** `borders` is the only line layer, drawn over the
 *    fill and doubling as the coastline, so land tinted to the border's own
 *    lightness erases both the frontier and the shore.
 *
 * ── Why this ramp is not the old one ───────────────────────────────────────
 *
 * The previous stops ran `#191d24` → `#272d36`, and constraint 2 was read as
 * "stay under `#2b313b`", the border's old value. That capped the entire scale
 * inside 14 points of one channel, and the arithmetic was brutal: **adjacent
 * stops measured 1.04–1.06:1, and the whole range from worst to best measured
 * 1.22:1** — less contrast across the complete encoding than a single step
 * needs to be perceptible. The land was not subtly shaded, it was flat. Picking
 * press freedom and picking urbanisation produced the same picture, which is
 * why the picker felt like it did nothing.
 *
 * The cap was also not buying what it claimed. The border measured 1.06:1
 * against the land it was drawn on — it had already vanished. So the constraint
 * that cost the ramp its range was protecting something that did not survive
 * anyway.
 *
 * The fix is to move the border up rather than hold the ramp down: `border` is
 * now `#5c6470`, comfortably above the ceiling here and 3.3:1 against the
 * ocean. That frees the ramp to span 2.01:1 floor to ceiling, with every step
 * at 1.15:1 or better. Still dark, still neutral, still quiet — but now a
 * reader can actually tell the quartiles apart, which is the entire point of
 * shading the land at all.
 *
 * `scripts/lib/map-geo.test.js` pins the step contrast, because the old ramp
 * passed every test there was: monotonic, neutral, under the border. Nothing
 * asked whether the steps could be seen.
 */
export const LAND_RAMP = ['#192029', '#242b37', '#303843', '#3c4450', '#48505c'] as const

/**
 * The tone the land layer paints at a given ramp position, in CSS.
 *
 * The country card shows this beside the figure, which is the one gesture on
 * this map that can teach the ramp: a reader who clicks a country because of
 * the colour it is gets the colour it is, the number behind it, and the rank,
 * in one row. A legend explains the scale in the abstract; this attaches it to
 * a country they were already looking at.
 *
 * Reimplements the `['interpolate', ['linear'], …]` in `addDataLayers` rather
 * than asking MapLibre, because the paint expression is evaluated inside the
 * renderer against feature state and there is no public way to ask it what
 * colour a feature came out. Straight component-wise interpolation over evenly
 * spaced stops, which is what MapLibre's own `interpolate` does for colours —
 * it is not `interpolate-lab` or `interpolate-hcl`, which have to be asked for
 * by name. `map-geo.test.js` pins the two ends against `LAND_RAMP` so the two
 * implementations cannot drift apart silently.
 */
export const rampColour = (p: number): string => {
  const t = Math.max(0, Math.min(1, p)) * (LAND_RAMP.length - 1)
  const i = Math.min(LAND_RAMP.length - 2, Math.floor(t))
  const f = t - i
  const parse = (hex: string) => [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ]
  const a = parse(LAND_RAMP[i])
  const b = parse(LAND_RAMP[i + 1])
  const mix = a.map((v, k) => Math.round(v + (b[k] - v) * f))
  return `#${mix.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/**
 * A country the current metric has no figure for.
 *
 * Deliberately *below* the ramp's floor rather than at it. `country-augmented`
 * covers 144 countries against `country-data`'s 176, so on metrics like press
 * freedom or HDI roughly 30 countries have nothing — and painting them the
 * ramp's lowest tone would state a value we do not have. The gap to the floor
 * is wider than the gap between any two adjacent stops, so "off the scale"
 * cannot be misread as "bottom of the scale". Same principle as a story with
 * no coverage figure getting a fixed neutral radius instead of the smallest.
 *
 * It sits close to the ocean, and that is safe now in a way it was not before:
 * `border` outlines every country at 3.3:1 against the sea, so an unshaded
 * country reads as an empty outline rather than dissolving into water. The
 * legend says the same thing in words — "the rest left dark".
 *
 * A tone alone is still not enough, which is what `nodataHatch` is for: on a
 * ramp where lighter means more, *any* dark tone reads as "least", and being
 * merely darker than the floor is a difference of degree where the truth is a
 * difference of kind.
 */
export const LAND_NO_DATA = '#0d1015'

/**
 * The hatch drawn over countries the metric has no figure for.
 *
 * Position on a sequential ramp is a claim, and a country painted below the
 * floor is making the claim "lowest". For roughly thirty countries that claim
 * is simply false — Saudi Arabia is absent from `country-augmented` entirely,
 * so on urbanisation the map drew one of the most urbanised countries on earth
 * as the least, and on every other augmented metric too. `literacyPct` covers
 * half the world, so on that one the map was asserting a bottom-of-scale value
 * for 84 countries at once.
 *
 * Hatching is the cartographic convention for this and it works because it is
 * not on the scale at all: no tone, however chosen, can say "not measured" to
 * a reader who has just been taught that dark means little. Diagonal, 1px, at
 * the border's own colour so it reads as furniture rather than data, and
 * sparse enough that the beacons over it stay legible.
 *
 * Returned as raw RGBA rather than drawn on a canvas so it can be handed
 * straight to `map.addImage` — no 2D context, no `data:` URL, nothing the CSP
 * has an opinion about.
 */
export const NODATA_HATCH = {
  /** Tile size, in pixels. One diagonal per tile. */
  tile: 8,
  /**
   * The border's colour, so an unmeasured country reads as drawn rather than
   * as shaded. Kept faint; the hatch has to be findable, not loud.
   *
   * Read from `MAP_COLOURS.border` rather than written out again — this was a
   * second copy of `#5c6470` three hundred lines from the first.
   */
  ink: MAP_COLOURS.border,
  alpha: 90 / 255,
} as const

export const nodataHatch = (): { width: number; height: number; data: Uint8Array } => {
  const N = NODATA_HATCH.tile
  const data = new Uint8Array(N * N * 4)
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(NODATA_HATCH.ink.slice(i, i + 2), 16))
  const a = Math.round(NODATA_HATCH.alpha * 255)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      // One diagonal per tile. `(x + y) % N` gives a 45° line that tiles
      // seamlessly in both axes, which a slope-based test does not.
      if ((x + y) % N === 0) {
        const i = (y * N + x) * 4
        data[i] = r
        data[i + 1] = g
        data[i + 2] = b
        data[i + 3] = a
      }
    }
  }
  return { width: N, height: N, data }
}

/**
 * How story density becomes a wash: `[density, alpha]`.
 *
 * Alpha only, over the one tone, for two reasons. A wash laid over a *variable*
 * ground — the land carries whatever metric the reader picked — has to track
 * that ground rather than become its own object; and a multi-hue ramp would
 * spend colour on a quantity, which on this map is reserved for category.
 *
 * **The toe is the design.** Below 0.10 the ramp is fully transparent, and
 * `DENSITY_INTENSITY` is chosen so a one-story place accumulates exactly 0.085 —
 * just under it. A lone story raises no field at all, which is right: a heat
 * kernel's skirt is an artefact of the kernel rather than a fact about the world,
 * and one story is already completely expressed by its own beacon.
 *
 * What the field turns on for is **crowding**, and it gets there two ways,
 * because kernels sum. One busy place climbs the ramp by itself — 10 stories
 * reach 0.269, Washington's 62 reach 0.669 — and so does a *neighbourhood* of
 * ordinary ones: three five-story cities inside the radius reach 0.57 between
 * them, more than any of them alone. That second path is the one the layer exists
 * for, since it is the only thing on this map that can say a region is busy.
 *
 * **The top stop is where the busiest *region* lands, not the busiest place.**
 * 1.20, measured: Washington alone reaches 0.669 and sits mid-scale, which is
 * right — one busy capital is not the loudest thing a fortnight of world news
 * produces. The US northeast (Washington 62 + New York 22 + Atlanta 4, kernels
 * overlapping at world zoom) reaches 1.238 and tops the scale; London + Paris +
 * Brussels reach 1.018. Anchoring the top on a single place instead would have
 * flattened every one of those regions into the same saturated plate.
 *
 * So a place with 10 stories lands at alpha 0.110, Washington at 0.244, London's
 * neighbourhood at 0.307 and the US northeast at the 0.340 ceiling — a real
 * gradient from "barely crowding" to "the busiest region on the planet".
 *
 * The first visible stop is deliberately **under** the land ramp's own largest
 * internal step. That is the onset of the scale — a place that has only just
 * begun to crowd — and it is not tone that keeps it from reading as a shaded
 * country, it is the absence of an edge. From the second visible stop up, tone
 * alone is enough. See `MAP_COLOURS.density`.
 *
 * **The peak came down from 0.34 to 0.30 on 2026-07-30, and it was the labels
 * that paid for it.** The original ceiling argument only required the wash to
 * stay *darker* than the quietest ink — which is the condition for text to be
 * invisible on it, not the condition for text to be readable. At 0.34 a country
 * name measured **1.24:1** where the wash was strongest. The fix is shared: the
 * label tones went up (see `MAP_COLOURS.labelDim`) and this came down, so a
 * country name now clears 3:1 even at the peak. 0.30 against 0.34 is a change
 * the wash can afford — it is four points of alpha against a legible map.
 *
 * **Stop 0 must be transparent.** MapLibre evaluates `heatmap-color` at every
 * pixel of the layer's extent, so any alpha at density 0 paints the whole world
 * — and being a fill with no features under it, it fails silently.
 */
export const DENSITY_STOPS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.1, 0],
  [0.3, 0.12],
  [0.65, 0.21],
  [1.2, 0.3],
] as const

/**
 * `DENSITY_STOPS` as the tail of a `heatmap-color` interpolate expression, and
 * as CSS stops for the legend swatch.
 *
 * Both from one table, so the swatch in the panel cannot disagree with the wash
 * on the canvas — the same reason the HUD chips take their glyph and their hue
 * from the layer that draws them. The space/slash alpha form, not `rgba()`,
 * which `colour-system.test.js` bans outright.
 */
const densityStop = (alpha: number): string => {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(MAP_COLOURS.density.slice(i, i + 2), 16))
  return `rgb(${r} ${g} ${b} / ${alpha})`
}

export const densityRamp = (): Array<number | string> =>
  DENSITY_STOPS.flatMap(([d, a]) => [d, densityStop(a)])

/**
 * The same ramp as CSS stops for the legend swatch — composited over `ocean`.
 *
 * Not the alpha form. The swatch sits on `--map-inset`, and a 0.18 alpha over a
 * panel is a different colour from a 0.18 alpha over the map: the strip would be
 * a faint smudge that does not resemble the thing it names, and at the same time
 * the faintest key item in a row of siblings set in `--map-ink-dim`. Composited
 * against the ground the wash actually lies on, the swatch is a 16px piece of
 * this map's water with the field running across it — which is the one rendering
 * that cannot mislead.
 *
 * The toe is included as bare `ocean`, because "nothing here" is the first thing
 * the scale says and a gradient that opens mid-range hides it.
 */
export const densityCssRamp = (): string => {
  const bg = [1, 3, 5].map((i) => Number.parseInt(MAP_COLOURS.ocean.slice(i, i + 2), 16))
  const fg = [1, 3, 5].map((i) => Number.parseInt(MAP_COLOURS.density.slice(i, i + 2), 16))
  const visible = DENSITY_STOPS.filter(([, a]) => a > 0)
  return [0, ...visible.map(([, a]) => a)]
    .map((a, i, arr) => {
      const rgb = fg.map((v, k) => Math.round(v * a + bg[k] * (1 - a)))
      return `rgb(${rgb.join(' ')}) ${Math.round((i / (arr.length - 1)) * 100)}%`
    })
    .join(', ')
}

/**
 * `v` is a hash of what went into the basemap, from `data-basemap` on the mount
 * element. The files are served with a day-long max-age because Natural Earth
 * geometry does not change between deploys — but our treatment of it does, and
 * without a versioned URL a reader keeps yesterday's copy for a full day. That
 * is how the map went on printing "Tel Aviv" and "Jerusalem" after the build
 * had started emitting "Yafa" and "Al-Quds": a reload re-requests a URL the
 * browser is entitled to answer from disk.
 */
export const basemapUrl = (file: string, v?: string) =>
  v ? `/basemap/${file}?v=${encodeURIComponent(v)}` : `/basemap/${file}`

/** A source declared in the style but filled later. */
const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] }

export function buildStyle(v?: string): StyleSpecification {
  return {
    version: 8,
    // Glyphs are genuinely immutable — the same Noto ranges every build — so
    // they keep their unversioned, year-long cached URL.
    glyphs: '/basemap/fonts/{fontstack}/{range}.pbf',
    sources: {
      // `promoteId` lifts each feature's `iso2` into the feature id, which is
      // what `setFeatureState` keys on — the same mechanism the story layer
      // uses for hover, and the reason the land tint costs no GeoJSON rewrite
      // when the reader changes metric.
      countries: { type: 'geojson', data: basemapUrl('countries.geojson', v), promoteId: 'iso2' },
      countryLabels: { type: 'geojson', data: basemapUrl('country-labels.geojson', v) },
      places: { type: 'geojson', data: basemapUrl('places.geojson', v) },
      // Lakes and rivers start empty and are filled after first paint — see
      // `loadWater` in `situation-map.ts`. GeoJSON expands TopoJSON's shared
      // arcs, so the two together are 205 KB gzipped against the coastline's
      // 546 KB: a 37% heavier first paint, spent on detail that is not what
      // anyone opens this map to see. Simplification will not recover it
      // (rivers barely respond — their vertices are already sparse), so the
      // fix is when, not how much. The seas are 1 KB and are needed at world
      // zoom, so they load with the style.
      lakes: { type: 'geojson', data: EMPTY_FC },
      rivers: { type: 'geojson', data: EMPTY_FC },
      seas: { type: 'geojson', data: basemapUrl('seas.geojson', v) },
    },
    layers: [
      {
        id: 'ocean',
        type: 'background',
        paint: { 'background-color': MAP_COLOURS.ocean },
      },
      {
        id: 'land',
        type: 'fill',
        source: 'countries',
        paint: {
          // The metric percentile arrives per-country as feature state. A
          // country the metric doesn't cover has no state at all, so `coalesce`
          // falls through to the off-scale tone rather than to `p = 0`.
          'fill-color': [
            'case',
            ['==', ['coalesce', ['feature-state', 'p'], -1], -1],
            LAND_NO_DATA,
            [
              'interpolate',
              ['linear'],
              ['coalesce', ['feature-state', 'p'], 0],
              0, LAND_RAMP[0],
              0.25, LAND_RAMP[1],
              0.5, LAND_RAMP[2],
              0.75, LAND_RAMP[3],
              1, LAND_RAMP[4],
            ],
          ],
        },
      },
      /**
       * Lakes, above `land` and below `borders`.
       *
       * Above the land because a lake is water *carved out of* it — filled in
       * `ocean`, the same tone as the sea, because it is the same substance and
       * this map's single strongest ground rule is that the darkest thing is
       * water. Below the borders because a frontier that runs down the middle
       * of a lake — as they do on the Great Lakes, Victoria, Chad and the
       * Caspian — is a fact about the lake and has to stay drawn.
       *
       * The fill alone is not enough: `ocean` against `LAND_NO_DATA` is
       * 1.04:1, so on a hatched country a lake would be an invisible hole. The
       * rim in `water` is what guarantees it reads, and it is the same thread
       * the rivers are drawn in — a river running into a lake continues as its
       * edge rather than stopping at an unrelated colour.
       *
       * Note this sits *after* `day-shade`, which is inserted before `land` so
       * it only reaches the sea. A lake therefore takes the night wash but not
       * the day lift. That is deliberate: the alternative is a terminator
       * visibly crossing Lake Victoria while the country around it is unshaded.
       */
      {
        id: 'lakes',
        type: 'fill',
        source: 'lakes',
        /**
         * The same idea as `country-labels`: 412 lakes at 1:50m is mostly
         * specks, and the world view wants the ones that are geography.
         *
         * The first step is 0.0002 sr because that is where the distribution
         * has its break — 21 lakes, Superior down to Turkana, which is the set
         * a reader would name. The first guess was 0.00004 and it admitted
         * **110**, speckling Canada and Fennoscandia with reservoirs and
         * IJsselmeer at world scale, where each is well under a pixel.
         */
        filter: ['>=', ['get', 'area'], ['step', ['zoom'], 0.0002, 3, 0.00004, 5, 0.000008, 7, 0]],
        paint: {
          'fill-color': MAP_COLOURS.ocean,
          'fill-outline-color': MAP_COLOURS.water,
        },
      },
      /**
       * Rivers.
       *
       * `r` is Natural Earth's `scalerank`, and it is the entire density
       * control — 27 rank-1 rivers against 69 at rank 5. Ungated, the world
       * view is a net of hairlines over every continent, which is the cluster
       * glow again: ink spent on something no layer here references and no
       * reader asked for. So the world sees the Nile, the Amazon, the
       * Mississippi, the Chang Jiang and the Lena, and the rest arrive with the
       * camera.
       *
       * Width is constant per zoom rather than per rank: a river is not a
       * quantity, and varying weight would imply one. They are the only
       * meandering line on this map, which is most of what tells them from the
       * frontiers they cross.
       */
      {
        id: 'rivers',
        type: 'line',
        source: 'rivers',
        minzoom: 1.6,
        filter: ['<=', ['get', 'r'], ['step', ['zoom'], 1, 3, 2, 4.5, 3, 6, 5]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': MAP_COLOURS.water,
          'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.4, 5, 0.8, 8, 1.4],
          // Quieter than a frontier at world scale, where a river is orientation
          // and nothing more; full strength once the camera is close enough for
          // it to be the thing being looked at.
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.55, 5, 0.85],
        },
      },
      {
        id: 'borders',
        type: 'line',
        source: 'countries',
        paint: {
          'line-color': MAP_COLOURS.border,
          // Borders stay hairline at world zoom and firm up as you go in.
          'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.4, 4, 0.8, 8, 1.2],
        },
      },
      {
        id: 'country-labels',
        type: 'symbol',
        source: 'countryLabels',
        /**
         * No `minzoom`, for the reason `sea-labels` has none — and this layer had
         * the very bug that note was written about, unnoticed for longer.
         *
         * It was `minzoom: 1.1`, which is fine on a desktop: `worldFitZoom` is
         * `log2(max(w, h) / 512)` and a 1104px canvas opens at 1.11, just above
         * it. A portrait phone opens at about **−0.39**, so **the map had no
         * country names at all** at the one view every phone reader starts from.
         * Not hard to read — absent. Density is the area gate's job below, never a
         * zoom floor's.
         */
        /**
         * A label has to earn its place by the size of the thing it names.
         *
         * The basemap moved from Natural Earth 1:110m to 1:50m, which is 240
         * countries against 176 — and the 64 newcomers are almost all specks.
         * Unfiltered, the world view acquired PITCAIRN IS., NORFOLK ISLAND,
         * NAURU, BERMUDA and S. GEO. AND THE IS. scattered across an otherwise
         * empty Pacific, each one shouting as loudly as BRAZIL. Collision
         * resolution does not help: there is nothing out there to collide with.
         *
         * `area` is on every label feature already (steradians of the country's
         * largest polygon). The first step is set at 0.00008, which is where the
         * old 176-country set ended — so the world view keeps exactly the label
         * density it had, and the smaller states arrive as the camera earns
         * them rather than never appearing at all.
         */
        /**
         * The first step is new, and it is what makes dropping the zoom floor
         * safe. Below 1.1 the canvas is a phone's — a 390px-wide world, an eighth
         * of a desktop's area — so the same 176-country set would be a solid mat
         * of type. 0.006 sr admits 75 candidates, of which collision places
         * around twenty; `symbol-sort-key` sorts on area, so the ones that
         * survive are Russia, China, Brazil, Canada, the United States,
         * Australia, India and their peers rather than whichever the index
         * reached first. From 1.1 up nothing changes: the desktop world view
         * keeps exactly the density it had.
         */
        filter: [
          '>=',
          ['get', 'area'],
          ['step', ['zoom'], 0.006, 1.1, 0.00008, 3, 0.00001, 4.5, 0.000002, 6, 0],
        ],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Bold'],
          // 8.5px was too small for the most prominent text on the map, and small
          // type is the other half of why it was hard to read — contrast and size
          // trade against each other, and this was short on both.
          'text-size': ['interpolate', ['linear'], ['zoom'], 1.2, 10, 6, 14],
          'text-letter-spacing': 0.14,
          'text-transform': 'uppercase',
          'text-max-width': 7,
          'text-padding': 6,
          // Without this, collision resolution is arbitrary and India loses to
          // Timor-Leste. Larger countries sort first and therefore survive.
          'symbol-sort-key': ['-', 1, ['get', 'area']],
        },
        paint: {
          'text-color': MAP_COLOURS.labelDim,
          'text-halo-color': MAP_COLOURS.labelHalo,
          // Thicker, because the halo is now the second line of defence rather
          // than the only one: the ink carries the letterform and this keeps the
          // edge crisp where the ground comes up under it.
          'text-halo-width': 1.6,
        },
      },
      {
        id: 'place-dots',
        type: 'circle',
        source: 'places',
        minzoom: 2.4,
        filter: ['<=', ['get', 'r'], 4],
        paint: {
          // A national capital reads a touch heavier than a city that merely
          // happens to be large. Where a thing is decided is worth knowing on a
          // map of decisions, and the difference is one of weight, not colour.
          'circle-radius': ['case', ['==', ['get', 'ncap'], 1], 2, 1.4],
          'circle-color': MAP_COLOURS.labelDim,
          'circle-opacity': ['case', ['==', ['get', 'ncap'], 1], 0.9, 0.7],
        },
      },
      {
        id: 'place-labels',
        type: 'symbol',
        source: 'places',
        minzoom: 2.4,
        // Rank gates density: only the most important places survive low zoom.
        filter: ['<=', ['get', 'r'], ['+', 1, ['*', 1.6, ['zoom']]]],
        layout: {
          'text-field': ['get', 'n'],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 8, 13],
          'text-offset': [0, 0.75],
          'text-anchor': 'top',
          'text-padding': 4,
          'text-max-width': 8,
          // `r` decides which labels are eligible at this zoom; among those, the
          // bigger city wins the collision. Without a sort key MapLibre resolves
          // ties in source order, so a town could silently displace a city of
          // ten million sitting beside it. Same idiom as the country labels,
          // which sort on area for the same reason.
          'symbol-sort-key': ['-', 0, ['get', 'p']],
        },
        paint: {
          'text-color': MAP_COLOURS.label,
          'text-halo-color': MAP_COLOURS.labelHalo,
          'text-halo-width': 1.5,
        },
      },
      /**
       * Marine labels.
       *
       * **Last of the base style**, which is load-bearing: MapLibre walks
       * symbol layers top-down and the *later* layer claims its collision
       * boxes first, so this was the lowest-priority symbol layer on the whole
       * map when it sat under `country-labels`. The result was that it drew
       * only where nothing else wanted the space — LABRADOR SEA, SEA OF
       * OKHOTSK, PHILIPPINE SEA, all of them in empty ocean — while the
       * Mediterranean, the Red Sea, the Arabian Sea and the Caribbean went
       * unnamed. Those are precisely the waters this layer was added for: they
       * are where the eleven chokepoints are, and they are crowded exactly
       * because that is where the news is.
       *
       * Sitting last it claims before the country and city names. That is the
       * right way round rather than merely the effective one — a sea label is
       * placed at the centroid of open water, so where it competes with a land
       * label at all, it is the land label that has drifted out over the sea.
       *
       * It still loses to everything `addDataLayers` adds, which is correct:
       * the stories are the subject and the basemap is the ground.
       *
       * Set in `water`, the same tone as the rivers and lake rims, so
       * everything on this map that is about water is one family a reader can
       * learn once. 4.66:1 on the ocean, so it clears AA on the surface it will
       * always be drawn against. Regular rather than the country labels' Bold,
       * and wider tracking: cartography sets water names in italic, which is
       * not available here — the basemap ships two Noto stacks and neither is
       * oblique — so weight and tracking carry the distinction instead.
       */
      {
        id: 'sea-labels',
        type: 'symbol',
        source: 'seas',
        /**
         * No `minzoom`, and that is the whole point of the layer.
         *
         * `worldFitZoom` is `log2(width / 512)` and is also the map's floor, so
         * the *default* view sits at 1.11 on a 1104px canvas and **−0.39 on a
         * phone**. A `minzoom` of 1.4 — which this had — hid the marine labels
         * at the one view every reader starts from, which is the view they were
         * added for. Density is the rank filter's job, not a zoom floor's.
         */
        filter: ['<=', ['get', 'rank'], ['step', ['zoom'], 1, 3.2, 2]],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 1.5, 8, 6, 12],
          'text-letter-spacing': 0.22,
          'text-transform': 'uppercase',
          'text-max-width': 8,
          'text-padding': 2,
          // Among the seas themselves, the major bodies place first.
          'symbol-sort-key': ['get', 'rank'],
        },
        paint: {
          // Its own tone, not the rivers'. See `MAP_COLOURS.waterLabel`.
          'text-color': MAP_COLOURS.waterLabel,
          'text-halo-color': MAP_COLOURS.labelHalo,
          'text-halo-width': 1.4,
        },
      },
    ],
  }
}
