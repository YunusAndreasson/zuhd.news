// The mark alphabet.
//
// Every mark on this map used to be a circle. Stories, clusters, disasters,
// chokepoints, conflict and markets — one silhouette, seven meanings, and the
// only thing separating them was hue. That does not survive contact with the
// palette: `economy` (#d0a24a) and `straits` (#c9a84c) are three points apart,
// and `politics` / `conflict` / `gdacs` are one red family. So colour could not
// say *what a mark is*, and having spent itself on identity it had nothing left
// to say *which way* or *how much*. `market-marks` and `chokepoint-marks` had
// become byte-identical paint expressions — the same radius domain, the same
// stroke domain, the same neutral — which is what that dead end looks like when
// you write it down.
//
// The reversal: **shape says what, colour says which way, size says how much.**
// Once the silhouette identifies the layer, two layers sharing a hue stops being
// a defect and colour is free to carry a value again. Shape is also the quieter
// channel, which is the right way round for a display that is meant to be read
// rather than noticed.
//
// ── Why signed distance fields, and not a font ─────────────────────────────
//
// The obvious route is `text-field` with a geometric character — ▲ ■ ◆. It does
// not work here: `public/basemap/fonts/{Noto Sans Bold,Noto Sans Regular}/` ship
// exactly four ranges (`0-255`, `256-511`, `512-767`, `8192-8447`), Geometric
// Shapes lives in `9472-9727`, and there is no font-generation step anywhere in
// `scripts/` — those `.pbf` files are checked-in binaries. It would cost new
// binary assets and a build step, and buy glyphs whose metrics we do not control.
//
// So the marks are drawn here and handed to `map.addImage(..., {sdf: true})`.
// That is the same road `nodataHatch` already takes — raw RGBA, no 2D context,
// no `data:` URL, nothing the CSP has an opinion about — with one difference
// that matters: the hatch is a repeating pattern, so a binary alpha mask is
// fine, whereas a mark gets scaled and a mask would alias. These carry a real
// distance field.
//
// `sdf: true` is also what makes `icon-color` data-driven. Without it every tone
// would have to be baked: three chokepoint states × three shapes, three market
// states × three shapes, and a recolour would become a change to a pixel
// generator. With it, one glyph serves every tone and the existing `['case', …]`
// colour expressions transfer verbatim.
//
// ── The encoding is not a matter of taste ──────────────────────────────────
//
// MapLibre's `symbolSDF` fragment shader reads the alpha channel as a distance
// on TinySDF's convention and cuts at a fixed edge:
//
//     lowp float inner_edge = (256.0 - 64.0) / 256.0;   // 0.75
//     alpha = smoothstep(inner_edge - gamma, inner_edge + gamma, dist);
//     highp float halo_edge = (6.0 - halo_width / fontScale) / SDF_PX;  // SDF_PX 8
//
// which fixes `alpha(d) = 255 * (1 - (d/SDF_SPREAD + SDF_CUTOFF))`, positive `d`
// outside. `d = 0` lands on 191, which is `0.75 × 255`, which is `inner_edge`.
// Get this wrong and the mark still renders — convincingly enough to ship — and
// then aliases under scale and silently ignores `icon-halo-width`.

/** Texture side, in texture pixels. */
export const GLYPH_TEX = 56
/**
 * Room around the shape for the field to fall off in.
 *
 * Not 8. The halo reads outward `halo_width / icon-size` *texture* pixels, so
 * the layer with the smallest `icon-size` sets the requirement: at 0.31 (the
 * conflict floor) a halo of 1.5 needs 4.8px, and a field that stops at 8px gets
 * clipped on whichever side runs out first — which looks like a rendering bug
 * rather than a missing constant.
 */
export const GLYPH_PAD = 12
/** The shape's own box, in texture pixels. `GLYPH_TEX - 2 * GLYPH_PAD`. */
export const GLYPH_BOX_TEX = GLYPH_TEX - 2 * GLYPH_PAD
/**
 * The box the vertex tables below are authored in, and — because the images are
 * registered at `pixelRatio: 2` — the mark's width in CSS pixels at
 * `icon-size: 1`. So every sizing expression is `wantedCssPx / GLYPH_BOX`, which
 * is the whole translation rule from the old `circle-radius` domains.
 */
export const GLYPH_BOX = GLYPH_BOX_TEX / 2

/** Distance, in texture pixels, over which the field falls from solid to clear. */
const SDF_SPREAD = 8
/** MapLibre's own cutoff. `1 - SDF_CUTOFF` is the shader's `inner_edge`. */
const SDF_CUTOFF = 0.25

type Pt = readonly [number, number]

type Part =
  /** A filled polygon. */
  | { readonly kind: 'fill'; readonly poly: readonly Pt[] }
  /** A polygon's edge only — mitred corners, unlike a closed stroke. */
  | { readonly kind: 'outline'; readonly poly: readonly Pt[]; readonly width: number }
  /** An open path with round caps and joins. */
  | { readonly kind: 'stroke'; readonly path: readonly Pt[]; readonly width: number }
  | { readonly kind: 'disc'; readonly c: Pt; readonly r: number }

export interface Glyph {
  readonly parts: readonly Part[]
}

// --- Distance functions ----------------------------------------------------

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t)

/** Unsigned distance from `p` to the segment `a`–`b`. */
const sdSegment = (px: number, py: number, a: Pt, b: Pt): number => {
  const ex = b[0] - a[0]
  const ey = b[1] - a[1]
  const wx = px - a[0]
  const wy = py - a[1]
  const ee = ex * ex + ey * ey
  const t = ee === 0 ? 0 : clamp01((wx * ex + wy * ey) / ee)
  const dx = wx - ex * t
  const dy = wy - ey * t
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Exact signed distance to a simple polygon; negative inside.
 *
 * Iñigo Quílez's formulation: the nearest edge gives the magnitude, and a
 * crossing count against the horizontal ray gives the sign. Correct for concave
 * outlines as well as convex, which a half-plane test is not — and the strait
 * arcs are the reason that matters.
 */
const sdPolygon = (px: number, py: number, poly: readonly Pt[]): number => {
  let d = Infinity
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    d = Math.min(d, sdSegment(px, py, a, b))
    const crosses = a[1] > py !== b[1] > py
    if (crosses && px < ((b[0] - a[0]) * (py - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside ? -d : d
}

/** Unsigned distance to an open polyline. */
const sdPolyline = (px: number, py: number, path: readonly Pt[]): number => {
  let d = Infinity
  for (let i = 1; i < path.length; i++) d = Math.min(d, sdSegment(px, py, path[i - 1], path[i]))
  return d
}

const partDistance = (px: number, py: number, part: Part): number => {
  switch (part.kind) {
    case 'fill':
      return sdPolygon(px, py, part.poly)
    case 'outline':
      return Math.abs(sdPolygon(px, py, part.poly)) - part.width / 2
    case 'stroke':
      return sdPolyline(px, py, part.path) - part.width / 2
    case 'disc':
      return Math.hypot(px - part.c[0], py - part.c[1]) - part.r
  }
}

// --- Geometry helpers ------------------------------------------------------

/** A cubic Bézier as a polyline. Sampling is uniform in `t`, which is close
 *  enough to uniform in arc length for arcs this shallow. */
const bezier = (p0: Pt, c0: Pt, c1: Pt, p1: Pt, steps = 10): Pt[] => {
  const pts: Pt[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    const a = u * u * u
    const b = 3 * u * u * t
    const c = 3 * u * t * t
    const d = t * t * t
    pts.push([
      a * p0[0] + b * c0[0] + c * c1[0] + d * p1[0],
      a * p0[1] + b * c0[1] + c * c1[1] + d * p1[1],
    ])
  }
  return pts
}

/** Mirror a path about the box's vertical centreline. */
const mirrorX = (path: readonly Pt[]): Pt[] =>
  path.map(([x, y]) => [GLYPH_BOX - x, y] as Pt)

/**
 * One coastline of a strait, bulging `bulge` units past its endpoints.
 *
 * Scaled from `mobile/components/globe/disaster-glyphs.ts`, whose 22-unit box
 * put the arc endpoints 3 units off centre and its control points 9 — the same
 * curve, so the app and the map draw one mark rather than two.
 */
const coastArc = (bulge: number): Pt[] =>
  bezier([5.8, 2.9], [5.8 - bulge, 5.1], [5.8 - bulge, 10.9], [5.8, 13.1])

// --- The alphabet ----------------------------------------------------------

const HAZARD: Glyph = {
  // Apex up, closed, flat-based — the ISO W001 hazard silhouette, and the only
  // closed triangle on the map. Inscribed in the box so it uses the full width;
  // outlined rather than solid because a GDACS alert has always been drawn
  // hollow here, and because that is what keeps it clear of the market ticks.
  parts: [{ kind: 'outline', poly: [[8, 0.9], [1.4, 12.3], [14.6, 12.3]], width: 1.7 }],
}

/**
 * A chokepoint: two facing coastlines with a channel between them.
 *
 * The arcs' bulge is the data. At rest they sit where the app draws them; a
 * *pinch* pulls them inward so the channel narrows, a *surge* pushes them out so
 * it opens. Direction therefore survives greyscale, which gold-versus-teal never
 * did. The centre dot pins the actual coordinate and guarantees ink at the
 * anchor, which is also what keeps the mark hoverable at its smallest size — a
 * two-part mark with nothing in the middle has no target.
 */
const strait = (bulge: number): Glyph => ({
  parts: [
    { kind: 'stroke', path: coastArc(bulge), width: 1.6 },
    { kind: 'stroke', path: mirrorX(coastArc(bulge)), width: 1.6 },
    { kind: 'disc', c: [8, 8], r: 1.0 },
  ],
})

const CONFLICT: Glyph = {
  // A solid square. Sharp corners are the whole point — this is the one mark
  // that has to stay itself at 5px, where anything rounded is a dot again.
  //
  // Diverges from the app's crosshair on purpose: the globe draws a handful of
  // these large, this layer draws thousands between 5 and 14px, and an open
  // reticle has no silhouette left at the bottom of that range.
  parts: [{ kind: 'fill', poly: [[0.9, 0.9], [15.1, 0.9], [15.1, 15.1], [0.9, 15.1]] }],
}

/**
 * A market's direction, as a caret.
 *
 * Wide and shallow rather than a solid triangle, for one reason: the hazard mark
 * is already a triangle, and at 7px orientation is a weaker separator than
 * closure and aspect. A caret is open where the hazard is closed and 14:5 where
 * the hazard is 14:12.
 *
 * The flat bar is the part that earns its place. A market that has not moved
 * used to be a *ring* — the same silhouette as one that had, distinguished only
 * by a neutral tone nobody could see. "No move" now has a form of its own, and
 * it is deliberately the lightest mark on the map, because on most days most
 * exchanges have not moved.
 */
const TICK_UP: Glyph = {
  parts: [{ kind: 'stroke', path: [[1, 10.5], [8, 5.5], [15, 10.5]], width: 2.2 }],
}
const TICK_DOWN: Glyph = {
  parts: [{ kind: 'stroke', path: [[1, 5.5], [8, 10.5], [15, 5.5]], width: 2.2 }],
}
const TICK_FLAT: Glyph = {
  parts: [{ kind: 'stroke', path: [[1, 8], [15, 8]], width: 2.2 }],
}

/** A story. Not registered as an image — `story-points` stays a circle layer,
 *  because feature-state drives its hover and `icon-size` cannot read it. This
 *  entry exists so the category chips can draw from the same table as everything
 *  else rather than keeping a CSS disc of their own. */
const DOT: Glyph = { parts: [{ kind: 'disc', c: [8, 8], r: 4.4 }] }

/**
 * A prayer line. Also not an image: `prayer-lines` is a `line` layer, which
 * MapLibre dashes natively, so there is nothing here for `addImage` to
 * rasterise. Same reason as `dot` — the chip is the legend, and the legend
 * draws from this table or it drifts. The three bars are the dash pattern.
 *
 * Bars rather than strokes because `glyphSvg` gives every stroke a round cap,
 * and a cap adds half the stroke width at each end: at the chip's 13px the
 * gaps closed up and the one glyph whose whole job is to say "dashed" drew a
 * solid line.
 */
const dash = (x0: number, x1: number): Part => ({
  kind: 'fill',
  poly: [[x0, 7.1], [x1, 7.1], [x1, 8.9], [x0, 8.9]],
})
const PRAYER_DASH: Glyph = { parts: [dash(1, 4), dash(6.5, 9.5), dash(12, 15)] }

export const GLYPHS = {
  dot: DOT,
  'prayer-line': PRAYER_DASH,
  hazard: HAZARD,
  'strait-rest': strait(4.0),
  'strait-pinch': strait(1.4),
  'strait-surge': strait(6.4),
  'conflict-mark': CONFLICT,
  'tick-up': TICK_UP,
  'tick-down': TICK_DOWN,
  'tick-flat': TICK_FLAT,
} as const satisfies Record<string, Glyph>

export type GlyphId = keyof typeof GLYPHS

export const GLYPH_IDS = Object.keys(GLYPHS) as GlyphId[]

// --- Rasterising -----------------------------------------------------------

export interface GlyphImage {
  width: number
  height: number
  data: Uint8Array
}

/**
 * A glyph as an SDF image, ready for `map.addImage(id, img, { sdf: true,
 * pixelRatio: 2 })`.
 *
 * RGB is left white throughout: `icon-color` replaces it, and the shader reads
 * nothing but alpha.
 */
export const sdfImage = (glyph: Glyph): GlyphImage => {
  const n = GLYPH_TEX
  const data = new Uint8Array(n * n * 4)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      // Texel centres, mapped back into the authoring box. `/ 2` because the
      // box is `GLYPH_BOX` units wide across `GLYPH_BOX_TEX` texture pixels.
      const u = (x + 0.5 - GLYPH_PAD) / 2
      const v = (y + 0.5 - GLYPH_PAD) / 2
      let d = Infinity
      for (const part of glyph.parts) d = Math.min(d, partDistance(u, v, part))
      // Back into texture pixels before encoding: the spread is a texture-space
      // quantity and the authoring box is half scale.
      const a = Math.round(255 * (1 - ((d * 2) / SDF_SPREAD + SDF_CUTOFF)))
      const i = (y * n + x) * 4
      data[i] = 255
      data[i + 1] = 255
      data[i + 2] = 255
      data[i + 3] = a < 0 ? 0 : a > 255 ? 255 : a
    }
  }
  return { width: n, height: n, data }
}

/**
 * Every glyph the map registers as an image, rasterised. Called once per mount.
 *
 * Two are excluded, both because MapLibre draws their layer natively and there
 * is nothing for `addImage` to serve: `story-points` is a circle layer (its
 * hover reads feature-state, which `icon-size` cannot) and `prayer-lines` is a
 * line layer. Their entries exist so the chips that name them draw from this
 * table rather than keeping their own idea of the mark.
 */
const CHIP_ONLY: ReadonlySet<GlyphId> = new Set<GlyphId>(['dot', 'prayer-line'])

export const glyphImages = (): Array<[GlyphId, GlyphImage]> =>
  GLYPH_IDS.filter((id) => !CHIP_ONLY.has(id)).map((id) => [id, sdfImage(GLYPHS[id])])

// --- The same shapes, as chrome --------------------------------------------

/**
 * A glyph as SVG markup on a `0 0 16 16` viewBox, for the HUD.
 *
 * The point of this living beside the rasteriser rather than in the stylesheet:
 * the filter chips *are* the map's legend, and a legend that draws its own idea
 * of a mark is a legend waiting to go stale. Before this, `disasters` and
 * `straits` were both a 6px CSS ring and `markets` was a grey ring while the
 * layer drew olive and terracotta ticks — three chips that between them taught
 * one wrong thing and two nothings. Both renderings now read the same vertex
 * tables, so a chip cannot disagree with the mark it names.
 *
 * Colour comes from `currentColor` throughout, which is what keeps every hue in
 * `_map/style.ts` and out of `style.css` — the rule `colour-system.test.js`
 * enforces.
 */
export const glyphSvg = (id: GlyphId): string => {
  const n = (v: number) => Math.round(v * 100) / 100
  const body = GLYPHS[id].parts
    .map((part) => {
      switch (part.kind) {
        case 'fill':
          return `<polygon points="${part.poly.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')}" fill="currentColor"/>`
        case 'outline':
          return `<polygon points="${part.poly.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')}" fill="none" stroke="currentColor" stroke-width="${part.width}" stroke-linejoin="round"/>`
        case 'stroke':
          return `<polyline points="${part.path.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')}" fill="none" stroke="currentColor" stroke-width="${part.width}" stroke-linecap="round" stroke-linejoin="round"/>`
        case 'disc':
          return `<circle cx="${n(part.c[0])}" cy="${n(part.c[1])}" r="${n(part.r)}" fill="currentColor"/>`
      }
    })
    .join('')
  return `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">${body}</svg>`
}
