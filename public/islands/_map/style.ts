// MapLibre style for the situational map.
//
// Everything is served from our own origin — country geometry, place labels and
// the SDF glyph ranges — so there is no tile provider, no API key and no
// third-party request. The CSP stays `default-src 'none'`.
//
// Dark by design rather than by theme: coloured markers need a dark ground to
// read against, and every operational map worth copying commits to it.

import type { ExpressionSpecification, LineLayerSpecification, StyleSpecification } from 'maplibre-gl'
import { MAKKAH_LABEL } from './format'

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
 * `space` is `--map-ground`: the HUD and scrubber gradients fade into it. A
 * drift here shows up as a seam between the canvas and the chrome on it.
 */
export const MAP_COLOURS = {
  /** = `--map-ground` in style.css: behind the planet, and what every scrim
   *  fades into. */
  space: '#080a0d',
  /** Deep water, 1.09:1 against space. The coast supplies the edge. */
  ocean: '#0a1622',
  land: '#171b22',
  landHi: '#1b1f27',
  /** Coast and frontier: 2.70:1 on the ocean, 1.32:1 on the brightest land. */
  border: '#545c68',
  /** A flat market or a strait at baseline. */
  neutral: '#8d97a6',
  /** Story numerals and selection keep the strongest ink. */
  label: '#d3d7dd',
  /** A city's name still clears 3:1 over the combined density wash and bloom. */
  placeLabel: '#bbc2ca',
  /** Country names stand one ink step above physical regions. */
  countryLabel: '#b6bdc6',
  /** Regions and quiet callout names: 4.53:1 on the brightest Population fill. */
  labelDim: '#b2bac2',
  labelHalo: '#05070a',
  /** Makkah glows in the site's gold (the dark half of `--brand`). */
  makkah: '#c9a84c',
  /** A muted gold that clears AA even over the brightest land. */
  makkahLabel: '#d6b66c',
  /** Prayer curves and their names share a neutral ink, lifted together on hover. */
  prayer: '#c0c4ca',
  /** Only drawn over water. The 1.2px graticule fades out with the sphere. */
  graticule: '#272d38',
  /** Rivers and lake rims are bluer than frontiers and clear 2:1 on every ramp stop. */
  water: '#4a7fae',
  /** A sea name can cross onto land at a strait. Keep AA on both surfaces. */
  waterLabel: '#aebacc',
  /** Edge-free regional wash under the borders, also the tone of the local story bloom. */
  density: '#9ea2a8',
  /**
   * The ring on a story its sources disagree sharply about.
   *
   * Lived in `situation-map.ts` as a raw literal, where `colour-system.test.js`
   * cannot see it — that test reads this file and `style.css` and nothing else.
   */
  contested: '#e8e2d4',
  /** Air at the sunlit limb, in the furniture's blue-grey family. */
  horizon: '#222e40',
  /** The night limb's edge clears 2:1 against space and sits below the land ceiling. */
  airglow: '#384a64',
} as const

/**
 * Category hues: one OKLCH lightness (0.70–0.72) and chroma 0.10–0.14, so the
 * hue is what changes and no category outshines another. They were 0.63 to 0.74 in
 * lightness, so an economy dot measured 8.45:1 on the sea against politics'
 * 5.20 and won the eye on a hard-news map. Hues 35, 80, 195 and 268, each
 * clear of the overlay that shares its side of the wheel; politics is the
 * deepest of the four and 35° from the rose of a falling market.
 */
export const CATEGORY_COLOUR: Record<string, string> = {
  politics: '#e77b60',
  economy: '#ca9c48',
  science: '#49b8b8',
  tech: '#8aa2e4',
}

export const CATEGORY_ORDER = ['politics', 'economy', 'science', 'tech']

/**
 * A story whose category matched none of the four above.
 *
 * A separate export rather than a fifth key in `CATEGORY_COLOUR`: that object
 * is iterated by the HUD-chip loops, and an `unknown` entry there would draw
 * a fifth chip nobody asked for. Two values did this job before —
 * `situation-map.ts` and `popup.ts` both fell back to `#8a8a8a`, `feed.ts`
 * fell back to `#888` — none of it visible to `colour-system.test.js`, which
 * reads only `style.css` and this file's own designated blocks. `#8a8a8a`
 * kept, as the majority value.
 */
export const FALLBACK_CATEGORY_COLOUR = '#8a8a8a'

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
  /**
   * A strait's traffic below its baseline, and above it (`straitsSurge`): a
   * number that fell and rose, so `marketDown` and `marketUp`, the rail's own
   * pair for the same rows. They were gold and teal, a second vocabulary
   * beside the rail's, at 1.03:1 from economy and 1.00:1 from science.
   * = `--map-straits` and `--map-straits-surge` in style.css.
   */
  straits: '#e68ba8',
  straitsSurge: '#6cbb7e',
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
   * 0.91. At full strength — **6.94:1 against `labelHalo`**, which
   * `MAP_COLOURS.neutral` explains is the real invariant for a haloed overlay
   * mark. Resting opacity carries the age of the IPC assessment.
   */
  famine: '#a98bc9',
  /**
   * A market's direction on the day.
   *
   * `--map-pos` and `--map-neg`, and the same pair as the site's dark `--pos`
   * and `--neg` and the app's: one green and one rose for "rose" and "fell"
   * everywhere a move is printed. The map's were sage and clay, and its up
   * stood 1.20:1 from a flat tick in chroma 0.055, so a rising market read as
   * flat; its down sat at the fire and disaster marks' hue.
   *
   * Green at 150° and rose at 0°, both at OKLCH 0.74–0.75 and chroma 0.12,
   * under the genocide corridor's saturation cap (0.71).
   */
  marketUp: '#6cbb7e',
  marketDown: '#e68ba8',
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
 * The scale spans 1.85:1. Even its smallest adjacent step clears 1.13:1.
 */
export const LAND_RAMP = ['#192029', '#232a33', '#2d343f', '#37404a', '#414b55'] as const

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
 * is wider than the first ramp step, so "off the scale"
 * cannot be misread as "bottom of the scale". Same principle as a story with
 * no coverage figure getting a fixed neutral radius instead of the smallest.
 *
 * It sits close to the ocean, and that is safe now in a way it was not before:
 * `border` outlines every country at 2.70:1 against the sea, so an unshaded
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
 * 1.30, measured: Washington alone reaches 0.69 and sits mid-scale, which is
 * right — one busy capital is not the loudest thing a fortnight of world news
 * produces. The US northeast (Washington 66 + New York 30 + Atlanta 5, kernels
 * overlapping at world zoom) reaches 1.35 and tops the scale; London + Paris +
 * Brussels reach 1.04. Anchoring the top on a single place instead would have
 * flattened every one of those regions into the same saturated plate.
 *
 * **Moved from 1.20 to 1.30 on 2026-08-09**, for the same reason the peak came
 * down below: the corpus this ramp is calibrated against keeps growing, and the
 * US northeast had climbed from 1.238 to 1.35 — past the 1.20 top's 10% grace
 * band, which is what `map-geo.test.js` caught. There is no way to peg this
 * exactly; it has to be re-measured against the live corpus and nudged when the
 * ratchet trips, the same as the label-contrast peak below.
 *
 * **Moved from 1.30 to 1.50 on 2026-09-26.** Washington had reached 88 stories
 * and New York 55 in the 16-day window (66 and 30 at the last calibration), so
 * the US northeast measured 1.62. Set short of that on purpose: the selector
 * capped US datelines at three a cycle on 2026-09-25, and the region should
 * come back down as the window rolls; 1.62 still sits inside the 10% band.
 * London + Brussels + Paris now reach 1.22.
 *
 * At the 1.30 calibration, a place with 10 stories lands at alpha 0.101, Washington at 0.216, London's
 * neighbourhood at 0.264 and the US northeast at the 0.300 ceiling — a real
 * gradient from "barely crowding" to "the busiest region on the planet".
 *
 * At full layer opacity the first visible stop is **under** the land ramp's own largest
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
  [1.5, 0.3],
] as const

/** World-view opacity of the regional field and its legend. */
export const DENSITY_OPACITY = 0.5

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
export const densityCssRamp = (): string =>
  [0, ...DENSITY_STOPS.filter(([, a]) => a > 0).map(([, a]) => a)]
    .map((a, i, arr) => `${overOcean(a * DENSITY_OPACITY)} ${Math.round((i / (arr.length - 1)) * 100)}%`)
    .join(', ')

/** `MAP_COLOURS.density` at `alpha` over the ocean, as an opaque CSS colour. */
const overOcean = (alpha: number): string => {
  const bg = [1, 3, 5].map((i) => Number.parseInt(MAP_COLOURS.ocean.slice(i, i + 2), 16))
  const fg = [1, 3, 5].map((i) => Number.parseInt(MAP_COLOURS.density.slice(i, i + 2), 16))
  return `rgb(${fg.map((v, k) => Math.round(v * alpha + bg[k] * (1 - alpha))).join(' ')})`
}

/**
 * How a place's heat becomes the bloom: `[heat, alpha]` of the density wash's
 * own tone. `story-bloom` is a heatmap whose centre density is the place's
 * `heat` (`BLOOM_INTENSITY`), so this table reads in the same units as
 * `placeHeat`: two fresh median stories are about 1.4, ten about 3.2,
 * Washington's busiest fortnight near 8.
 *
 * One tone with the wash, never a hue: the dots carry the category, and a gold
 * bloom made an economy dot vanish on it (1.01:1) and read as the strait and
 * fire marks' family. A heatmap and not circles, so neighbouring places sum
 * their heat and the ramp's top caps them; three blurred circles stacked their
 * alpha to 0.93 over Europe. The top is 0.20 so a city name keeps 3:1 where
 * the bloom lies on the wash's peak over the brightest land, and a dot keeps
 * its fill or its rim (`map-geo.test.js`).
 */
export const BLOOM_STOPS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.6, 0],
  [1, 0.06],
  [2, 0.11],
  [4, 0.16],
  [7, 0.2],
] as const

export const bloomRamp = (): Array<number | string> =>
  BLOOM_STOPS.flatMap(([h, a]) => [h, densityStop(a)])

/**
 * The bloom as a radial CSS gradient's stops for the key, hottest at the
 * centre, composited over the ocean as `densityCssRamp` is: the alpha form
 * would show a colour the map never draws.
 */
export const bloomCssRamp = (): string => {
  const visible = BLOOM_STOPS.filter(([, a]) => a > 0).map(([, a]) => a)
  return [...visible.reverse(), 0]
    .map((a, i, arr) => `${overOcean(a)} ${Math.round((i / (arr.length - 1)) * 100)}%`)
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

/**
 * The coastline's vector tiles (`scripts/build/basemap-tiles.js`): the deepest
 * zoom written, past which MapLibre overzooms, and the one layer in each tile.
 * `map-geo.test.js` pins both to the build's.
 */
export const COUNTRY_TILES = { maxzoom: 5, layer: 'countries', depthLayer: 'depth', coastLayer: 'coast' } as const

/**
 * The sea floor's tone from each depth (`d`, metres) down, shallowest first.
 * The abyss, 4000 m and down, is `ocean` itself, so the open sea looks as it
 * did and the shelves, ridges and shallow straits lift a step at a time in the
 * same hue; the trenches go one step under it. The shelf ends 1.03:1 against
 * the abyss and stays within the land's own lightness, so a coastline is still
 * `border`'s job (`map-geo.test.js`). The shelf is the background, not a band:
 * every band is a pass over the sea.
 */
export const DEPTH_TONES: ReadonlyArray<readonly [number, string]> = [
  [0, '#0b1926'],
  [200, '#0b1825'],
  [2000, '#0a1724'],
  [4000, MAP_COLOURS.ocean],
  [6000, '#091521'],
]

/** A band's tone by its floor. Spread from the table, so it is cast as the
 *  island casts its other built expressions. */
const depthColour = [
  'match',
  ['get', 'd'],
  ...DEPTH_TONES.flat(),
  MAP_COLOURS.ocean,
] as unknown as ExpressionSpecification

/**
 * A tile template, made absolute. MapLibre resolves a GeoJSON source's URL
 * against the page but hands a tile URL to its worker as written, and a
 * worker resolves a relative one against its own script. Joined as a string:
 * `new URL` percent-encodes the `{z}` MapLibre substitutes.
 */
const tileUrl = (file: string, v?: string) =>
  typeof location === 'undefined' ? basemapUrl(file, v) : location.origin + basemapUrl(file, v)

/** A source declared in the style but filled later. */
const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] }

/**
 * Where the globe gives way to the plane.
 *
 * Exported because `situation-map.ts` frames the opening view against it: the
 * home zoom is capped here so the map can never open part-way through the
 * flattening, which would be the one view no reader chose and neither
 * projection was tuned for.
 *
 * The two anchors are picked against thresholds this map already had, not
 * invented:
 *
 * - `flyToStory`'s minimum target is **2.5**, so committing to a story from the
 *   world view lands on the sphere. That is the point of the transition being
 *   here rather than lower — the globe is not a splash screen you leave on the
 *   first gesture.
 * - `place-dots` and `place-labels` open at **2.4**, so cities arrive on the
 *   globe too.
 * - `DENSITY_FADE_OUT` is **5**: the density wash reaches zero exactly as the
 *   plane arrives, so the one layer whose kernels are screen-sized — and which
 *   therefore compresses toward the limb — lives entirely inside globe
 *   territory and nowhere else.
 * - `ULTRA_ZOOM` is **5.5**, so the 1:10m coastline is only ever drawn flat.
 *
 * **Do not replace this with `projection: { type: 'globe' }`.** That is a preset
 * that expands to a 11 → 12 interpolation
 * (`maplibre-gl/src/geo/projection/projection_factory.ts`), and this map's
 * `maxZoom` is 9 — so `'globe'` would be a sphere at every zoom a reader can
 * reach, and the whole second half of this file's reasoning about close work
 * would silently never apply.
 */
export const GLOBE_ZOOM = { sphere: 3, plane: 5 } as const

/**
 * The floor for anything that must not appear at the view the map opens on.
 *
 * **The projection re-keyed every zoom gate on this map, and nothing said so.**
 * A globe is drawn far smaller than a flat world at the same zoom — the disc's
 * diameter is `TILE_PX · 2^z / π` against Mercator's `TILE_PX · 2^z` of width —
 * so fitting one to the canvas lands about a whole zoom level higher than
 * fitting the other. Measured, the opening view went **1.25 → 2.36** at 1600px,
 * **1.58 → 2.62** at 1920 and **2.04 → 3.00** at 2560.
 *
 * Every `minzoom` and every `['step', ['zoom'], …]` in this file was chosen by
 * looking at the flat map, so all of them now sit a level lower relative to the
 * view than they were written for. Two were crossed outright: `place-dots` and
 * `place-labels` at 2.4, and `rivers` at 1.6 — none of which the world view had
 * ever drawn. The opening frame acquired every city name and the river network
 * on the same day it became a globe, which is most of why it reads as busy.
 *
 * `globeFitZoom` caps at `GLOBE_ZOOM.sphere`, so **3 is the highest zoom the map
 * can ever open at, on any screen**. That makes it the one honest floor for
 * close-up detail: above it a reader has asked to come closer, below it they are
 * still looking at the world. A margin over the cap keeps the first gesture from
 * immediately repainting the map.
 */
export const DETAIL_ZOOM = GLOBE_ZOOM.sphere + 0.2

/** A Web Mercator tile, and the unit MapLibre's world size is counted in. */
export const TILE_PX = 512

/**
 * How much of the shorter side the globe takes.
 *
 * A sphere fitted flush to the frame has its limb cut by the frame, which is the
 * one thing the limb exists not to be — it is the mark that says the world is
 * round, and a circle tangent to four edges reads as a circle that ran out of
 * room. The margin is what makes the surrounding space deliberate rather than
 * residual.
 *
 * **This is a fudge factor and is honest about it.** `globeFitZoom` solves
 * MapLibre's own globe-radius formula exactly, but that formula gives the
 * sphere's radius in *world* units; what reaches the screen has been through a
 * perspective projection, which foreshortens it by an amount depending on the
 * disc's angular size. Measured against the built map at three viewports, the
 * rendered diameter comes out about **0.87** of what the formula asks for on a
 * desktop and **0.93** on a phone — so 1.0 here lands the globe at roughly 86%
 * of the shorter side, which is what the number is for.
 *
 * Do not read it as "the globe takes 100% of the short side". It does not, and
 * the arithmetic that would make it exact lives inside the renderer.
 *
 * **Raised from 1.0 after looking at it.** At 1.0 the globe drew ~86% of the
 * shorter side — 929px of a 1080px canvas at 1920 — against a flat world that
 * had filled the full 1536px width. So the Earth was not only showing one
 * hemisphere, it was showing it *smaller*, and every mark on this map is sized
 * in screen pixels: a 7.5px beacon on a 929px globe claims 1.65× the share of
 * the world it claimed on the flat map. Overview was lost twice over.
 *
 * 1.12 drew it at ~97% of the shorter side. What that spent was the poles: the
 * HUD scrim covered the top of the disc and the scrubber the bottom, and at a
 * centre latitude of 22°N those are the Arctic Ocean and the Southern Ocean —
 * the two regions this map has the least to say about. The alternative was to
 * leave the planet small so that empty sea could stay uncovered.
 *
 * **1.15 since 2026-08-02, and the reason is that the top of the canvas is now
 * empty.** The money readout was a bar across the head of the map — 34px of
 * strip over a 1.4rem scrim overhang — and it sat exactly on the disc's
 * northern cap. It has moved into the instrument rail, so on a desktop
 * *nothing* covers the top of the globe: `body.map-wide .map-hud::after` turns
 * the strip's own scrim off, and there is no bar left to draw one. The strip is
 * the phone's layout since 2026-08-03, where the canvas is the whole window and
 * this number is the one that decides the fit either way.
 *
 * Measured off the built map at 2361x984, canvas 1577x984: the rendered
 * diameter was **959px, 97.4% of the canvas height**, with 13px of clear space
 * above the disc and 56px of it hidden under chrome that no longer exists. So
 * the headroom this number could ever have claimed was 2.6%, and 1.15 claims
 * all of it — **984px, tangent to the canvas's top and bottom edges**. +26px at
 * 1920x1080, +25px here.
 *
 * Two things it deliberately does not do. It does not go past tangency: a disc
 * larger than its frame is a disc with its caps cut off by a rectangle, which
 * is a different claim from one whose caps are under a readout. And it changes
 * nothing at all above about 2560x1440, where `GLOBE_ZOOM.sphere` is already
 * the binding constraint and the globe stops growing whatever this says — so
 * the note above about space growing instead of the Earth still holds exactly
 * where it held before. The margin the paragraph above argues for is still
 * there and is still deliberate; it is now entirely on the long axis, which is
 * the axis that had ~310px a side to spare and no globe to give it to.
 */
export const GLOBE_FIT = 1.15

/**
 * The zoom at which the globe fills `span` pixels, centred at `lat`.
 *
 * This replaces the old `worldFitZoom`, and the arithmetic is different in kind
 * rather than tweaked. MapLibre sizes the sphere as
 *
 *     radius_px = worldSize / 2π / cos(lat)          (globe_utils.ts)
 *     worldSize = TILE_PX · 2^zoom
 *
 * so the globe's **diameter** is `TILE_PX · 2^z / (π · cos lat)`, against a
 * Mercator world **width** of `TILE_PX · 2^z` at the same zoom. Solving the
 * first for a target pixel span gives the line below.
 *
 * The two are not interchangeable and the gap is not small: the old
 * `log2(max(w, h) / TILE_PX)` fitted the *Mercator* world, and at that zoom the
 * sphere is only about **a third of the canvas width** — 379px of a 1104px
 * canvas. Shipping the projection change without this one would have opened the
 * map on a marble, and nothing would have reported a problem, because both
 * numbers are honestly describable as "the fit zoom".
 *
 * **The caller passes the shorter side, where Mercator took the longer one.**
 * That inversion is the difference in kind. With `renderWorldCopies` off,
 * MapLibre refuses any zoom at which the flat world fails to *cover* the canvas,
 * so the flat fit had to satisfy whichever axis needed more world — a world
 * narrower than its frame is not letterboxed, it is duplicated. A sphere cannot
 * duplicate. It is a disc, it is *meant* to be letterboxed by space, and the
 * constraint that forced `max()` does not exist here.
 *
 * Capped at `GLOBE_ZOOM.sphere` so a very large canvas cannot open part-way into
 * the flattening — a 4K monitor fits the globe at about 3.4, which would put the
 * opening view inside the transition, a view no reader chose and neither
 * projection was tuned for. On such a screen the globe stops growing and the
 * space around it grows instead. That is also the ceiling the flat version had
 * to abandon: 2.4 was dropped because it let the world duplicate, and on a
 * sphere that reason is gone.
 */
export const globeFitZoom = (span: number, lat: number): number => {
  const fit = Math.log2((span * GLOBE_FIT * Math.PI * Math.cos((lat * Math.PI) / 180)) / TILE_PX)
  return Math.min(fit, GLOBE_ZOOM.sphere)
}

/**
 * The span `globeFitZoom` is given: the shorter side of what the rails leave
 * in sight.
 *
 * The rails float over a canvas as wide as the window, so the canvas's own
 * width is not the frame. Fitted to it, a 1280×800 window drew a 711px disc in
 * the 656px gap between the rails, and both rails cut the limb; at 1440×900 the
 * names on the limb ran on under the instrument rail. `left` and `right` are
 * the rails' widths where they stand beside the map, and 0 where they do not.
 */
export const globeSpan = (canvasW: number, canvasH: number, left: number, right: number): number =>
  Math.min(canvasH, Math.max(1, canvasW - left - right))

/** Every frontier and coastline: `borders`, and Antarctica's `pole-coast`. */
const BORDER_PAINT: NonNullable<LineLayerSpecification['paint']> = {
  'line-color': MAP_COLOURS.border,
  // Borders stay hairline at world zoom and firm up as you go in.
  'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.4, 4, 0.8, 8, 1.2],
}

export function buildStyle(v?: string): StyleSpecification {
  return {
    version: 8,
    // Glyphs are immutable: checked-in files from `scripts/build/glyphs.mjs`,
    // the same every build, so they keep their unversioned, year-long cached
    // URL. A new font is a new fontstack name, so a new path.
    glyphs: '/basemap/fonts/{fontstack}/{range}.pbf',
    /**
     * The world is a sphere at the zoom every reader starts on, and a plane by
     * the time they are looking at one country.
     *
     * This is not the map acquiring an effect. **Mercator at world zoom is a
     * lie about area** — it draws Greenland the size of Africa — and this file
     * spends four hundred lines making sure a tone cannot overstate a value,
     * while the projection underneath overstated every high-latitude country on
     * the map by a factor the reader has no way to discount. The same objection
     * turned `renderWorldCopies` off: a situational map that misplaces or
     * misproportions the world is lying about where things are, and the fix is
     * the projection rather than a caption.
     *
     * The cost is stated plainly because it is real: a sphere hides a
     * hemisphere. Stories on the far side are not dimmed, they are *absent*
     * until the reader turns the globe — which is why `locationOccludedOpacity`
     * is set on the card in `popup.ts`, and why `topHit` must not return a
     * feature through the planet.
     */
    projection: {
      type: [
        'interpolate',
        ['linear'],
        ['zoom'],
        GLOBE_ZOOM.sphere, 'vertical-perspective',
        GLOBE_ZOOM.plane, 'mercator',
      ],
    },
    /**
     * No MapLibre atmosphere: the island's sky canvas (`sky-paint.ts`) draws
     * the crescent and the airglow outside the limb.
     *
     * MapLibre's atmosphere is a sphere drawn over every layer, lit from the
     * sun. Over the poles its lit edge read as a second, shadowed sphere inside
     * the planet, it washed the day limb's names, and it cost a full-canvas
     * pass every frame. With `atmosphere-blend` at 0 `draw_sky.ts` draws
     * nothing. It is stated: a `sky` block without it means the 0.8 default.
     *
     * `sky-color` is space's tone: the canvas clears to transparent and
     * `.map-canvas-host` paints `--map-ground` behind it.
     */
    sky: {
      'sky-color': MAP_COLOURS.space,
      'horizon-color': MAP_COLOURS.horizon,
      'atmosphere-blend': 0,
    },
    sources: {
      // `promoteId` lifts each feature's `iso2` into the feature id, which is
      // what `setFeatureState` keys on — the same mechanism the story layer
      // uses for hover, and the reason the land tint costs no GeoJSON rewrite
      // when the reader changes metric.
      //
      // Tiles cut at build time from 1:10m, so the reader fetches the tiles in
      // view rather than a whole coastline the worker then has to cut itself.
      countries: {
        type: 'vector',
        tiles: [tileUrl('tiles/{z}/{x}/{y}.pbf', v)],
        maxzoom: COUNTRY_TILES.maxzoom,
        promoteId: 'iso2',
      },
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
      // The land's physical names (`scripts/build/regions.mjs`), 37 KB of
      // points, with the style like the seas.
      regions: { type: 'geojson', data: basemapUrl('regions.geojson', v) },
    },
    layers: [
      {
        id: 'ocean',
        type: 'background',
        // The shelf's tone: what the depth bands below are drawn over.
        paint: { 'background-color': DEPTH_TONES[0][1] },
      },
      // The sea floor (`DEPTH_TONES`), under everything the sea carries. Each
      // band lies inside the one above it, so the sort key draws the deeper
      // over the shallower. No antialiasing: neighbouring tones sit close together and an edge between them is invisible either way.
      {
        id: 'depth',
        type: 'fill',
        source: 'countries',
        'source-layer': COUNTRY_TILES.depthLayer,
        layout: { 'fill-sort-key': ['get', 'd'] },
        paint: {
          'fill-color': depthColour,
          'fill-antialias': false,
        },
      },
      {
        id: 'land',
        type: 'fill',
        source: 'countries',
        'source-layer': COUNTRY_TILES.layer,
        paint: {
          // The metric percentile arrives per-country as feature state. A
          // country the metric doesn't cover has no state at all, so the
          // `coalesce` falls through to the off-scale tone rather than to
          // `p = 0`.
          //
          // Bound once with `let` rather than read twice. This used to
          // `coalesce` the feature state in the test *and* again in the ramp
          // input — two lookups and two coalesces per country per frame, for one
          // value that cannot differ between them. The sentinel is −1 because
          // the ramp's own domain starts at 0, so "absent" needs a value outside
          // it; binding makes that explicit instead of leaving the second reader
          // to default to 0 and hope the first one caught it.
          'fill-color': [
            'let',
            'p', ['coalesce', ['feature-state', 'p'], -1],
            [
              'case',
              ['==', ['var', 'p'], -1],
              LAND_NO_DATA,
              [
                'interpolate',
                ['linear'],
                ['var', 'p'],
                0, LAND_RAMP[0],
                0.25, LAND_RAMP[1],
                0.5, LAND_RAMP[2],
                0.75, LAND_RAMP[3],
                1, LAND_RAMP[4],
              ],
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
       * too close to distinguish, so on a hatched country a lake would be an invisible hole. The
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
        // Was 1.6, which the flat world view sat below and the globe's sits
        // above — so the river network arrived at the opening frame the day the
        // projection changed. See DETAIL_ZOOM.
        minzoom: DETAIL_ZOOM,
        filter: ['<=', ['get', 'r'], ['step', ['zoom'], 1, 3, 2, 4.5, 3, 6, 5]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': MAP_COLOURS.water,
          'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.4, 5, 0.8, 8, 1.4],
          /**
           * Quieter than a frontier at world scale, where a river is orientation
           * and nothing more; full strength once the camera is close enough for
           * it to be the thing being looked at.
           *
           * **`line-layer-opacity`, not `line-opacity`** (new in MapLibre 6.0),
           * and the difference is a claim this layer must not make. Natural
           * Earth ships a river system as separate features, so a tributary and
           * the stem it joins are two strokes laid over each other for the length
           * of the junction. Under `line-opacity` those alphas accumulate:
           * measured on 6.1 with two crossing lines at 0.5, each arm renders
           * rgb(128) and the crossing rgb(192) — 1 − (1 − 0.5)², textbook
           * compositing. So every confluence drew brighter than the rivers
           * feeding it, which reads as *more river*, and the note on `line-width`
           * directly above says why that is wrong: a river is not a quantity, and
           * varying weight would imply one. The map was implying it at exactly
           * the points where two rivers become one.
           *
           * (6.0's changelog does mention fixing overlapping-line artefacts for
           * `line-opacity`. Measured, that fix does not cover this case — hence
           * the test above rather than a reading of the release notes.)
           *
           * The cost is real and bounded: a layer opacity below 1 makes MapLibre
           * render the layer to a scratch framebuffer and composite it once
           * (`draw_layer_opacity.ts`), so this is one extra full-canvas pass per
           * *rendered frame* — not per idle tick, since a still map draws no
           * frames at all. One thin line layer is worth it; see `prayer-lines`,
           * which is deliberately left alone.
           */
          'line-layer-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.55, 5, 0.85],
        },
      },
      {
        id: 'borders',
        type: 'line',
        source: 'countries',
        'source-layer': COUNTRY_TILES.layer,
        // Antarctica's coast is `pole-coast`: its polygon's closure along the
        // pole drew a ring at 85°S (`coastOf`, `scripts/build/basemap.js`).
        filter: ['!', ['has', 'pole']],
        paint: BORDER_PAINT,
      },
      {
        id: 'pole-coast',
        type: 'line',
        source: 'countries',
        'source-layer': COUNTRY_TILES.coastLayer,
        paint: BORDER_PAINT,
      },
      /**
       * Ranges, deserts, plateaus, basins and plains: the Sahel, the Hindu
       * Kush, Mesopotamia. Type is the one thing this map can paint on the
       * land, whose tone is the metric's value, so the land's shape is said in
       * names rather than relief.
       *
       * Under the country names, so a country and a city claim their space
       * first and a region yields. Quieter in case, size and ink. Letterspaced, which is what tells an area from a
       * town in the same case, and a range more widely, along its own axis
       * (`rot`) once it is big enough to read that way. The tiers arrive as the
       * camera earns them.
       */
      {
        id: 'region-labels',
        type: 'symbol',
        source: 'regions',
        filter: ['<=', ['get', 'tier'], ['step', ['zoom'], 1, 2.6, 2, 3.8, 3]],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Source Sans 3 Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 1.2, 9.5, 6, 12.5],
          'text-letter-spacing': ['match', ['get', 'kind'], 'range', 0.25, 0.15],
          // Upright to the screen, like every name here: laid on the sphere, a
          // name near the limb is foreshortened to a smudge. The map never
          // turns (`dragRotate: false`), so the screen's angle is the axis's.
          'text-rotate': ['step', ['zoom'], 0, 3, ['get', 'rot']],
          'text-max-width': 6,
          'text-padding': 8,
          'symbol-sort-key': ['get', 'tier'],
        },
        paint: {
          'text-color': MAP_COLOURS.labelDim,
          'text-halo-color': MAP_COLOURS.labelHalo,
          'text-halo-width': 1,
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
          // Regular caps leave the strong ink to the news.
          'text-font': ['Source Sans 3 Regular'],
          // 8.5px was too small for the most prominent text on the map, and small
          // type is the other half of why it was hard to read — contrast and size
          // trade against each other, and this was short on both.
          //
          // Left alone when the weight came down: size is a shout channel too,
          // and spending both at once leaves no way to tell which one was doing
          // the shouting.
          'text-size': ['interpolate', ['linear'], ['zoom'], 1.2, 10, 6, 14],
          // 0.14 is display letterspacing — it was set for a bold cap line and
          // reads as tracking-out at Regular, which is a second way of saying
          // "look at this". 0.08 keeps caps from setting tight and stops there.
          'text-letter-spacing': 0.08,
          'text-transform': 'uppercase',
          'text-max-width': 7,
          /**
           * Doubled, and this is the layer's density control now.
           *
           * The obvious lever was the `area` gate above, and it is the wrong
           * one: raising it from 0.00008 to 0.0003 drops **17 of 176**
           * candidates, and the seventeen are Lebanon, Qatar, Cyprus, Kosovo,
           * the Gambia, Trinidad, Jamaica and the Bahamas — small states, which
           * on a news map is not the same thing as unimportant ones. A gate
           * deletes a country at every zoom the gate covers.
           *
           * Padding thins by *collision* instead, so what it removes is
           * crowding rather than countries: `symbol-sort-key` already sorts on
           * area, so the labels that survive a tight world view are the large
           * ones, and Lebanon arrives as the camera earns it. That is the
           * arrangement the gate's own note describes and the gate cannot
           * actually deliver.
           */
          'text-padding': 12,
          // Without this, collision resolution is arbitrary and India loses to
          // Timor-Leste. Larger countries sort first and therefore survive.
          'symbol-sort-key': ['-', 1, ['get', 'area']],
        },
        paint: {
          'text-color': MAP_COLOURS.countryLabel,
          'text-halo-color': MAP_COLOURS.labelHalo,
          'text-halo-width': 1,
        },
      },
      {
        id: 'place-dots',
        type: 'circle',
        source: 'places',
        // Was 2.4. See DETAIL_ZOOM: the globe opens at 2.36–3.00, so a floor of
        // 2.4 put city dots on the world view of every screen from 1920 up.
        minzoom: DETAIL_ZOOM,
        // Makkah is the map's own mark (`makkah-glow`, `makkah-label`), so the
        // gazetteer's dot and name for it would be a second one beside it.
        filter: ['all', ['<=', ['get', 'r'], 4], ['!=', ['get', 'n'], MAKKAH_LABEL]],
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
        // Was 2.4 — and this is the layer the change is most visible on. At the
        // globe's opening zoom the rank filter below admits r <= 1 + 1.6·3 = 5.8,
        // which is most of the gazetteer: Reykjavik, Trondheim, Murmansk, Norilsk
        // and Dikson all named on a view that used to carry country names alone.
        minzoom: DETAIL_ZOOM,
        // Rank gates density: only the most important places survive low zoom.
        // Makkah is left out for the reason `place-dots` gives.
        filter: [
          'all',
          ['<=', ['get', 'r'], ['+', 1, ['*', 1.6, ['zoom']]]],
          ['!=', ['get', 'n'], MAKKAH_LABEL],
        ],
        layout: {
          'text-field': ['get', 'n'],
          'text-font': ['Source Sans 3 Regular'],
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
          'text-color': MAP_COLOURS.placeLabel,
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
       * A cool ink and wider tracking distinguish the water names. The ink
       * also clears AA over land where a long name crosses the coast.
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
          'text-font': ['Source Sans 3 Regular'],
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
