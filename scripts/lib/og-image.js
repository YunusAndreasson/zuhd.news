// OG image generation: typography + orthographic map inset, 1200×630.
// Rendered at build time per article, emitted to dist/api/og/{slug}.png.
//
// Stack: hand-built SVG string → @resvg/resvg-js (WOFF2 font buffer
// + PNG raster). Zero runtime cost; shares the Source Sans 3 WOFF2
// already shipped to /fonts/ so the OG render matches the site's
// type exactly. Map inset uses d3-geo orthographic centered on the
// article's lat/lng, from shared/data/countries-110m.json (108 KB).

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import { geoOrthographic, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import { escXml } from './html.js'
import { SHARE_PALETTE } from './share-palette.js'

const ROOT = new URL('../..', import.meta.url).pathname

let _assets = null
/**
 * Load + memoize the 110m country features from shared/data, for the globe.
 * Reused by ig-image.js.
 *
 * The variable WOFF2 this also used to load was the font resvg rendered with,
 * and it is why every card came out monospace-looking — see `rasterizeSvg`.
 * The renderer now takes the static TTFs by path and this loads geometry only.
 */
export const getAssets = () => {
  if (_assets) return _assets
  const topo = JSON.parse(readFileSync(join(ROOT, 'shared', 'data', 'countries-110m.json'), 'utf8'))
  const countries = /** @type {import('geojson').FeatureCollection} */ (/** @type {unknown} */ (feature(topo, topo.objects.countries))).features
  _assets = { countries }
  return _assets
}

/**
 * The two-tone palette shared by every share card.
 *
 * `soft` and `land` are the globe and nothing else — the disc and the
 * landmasses, here and in `ig-image.js`. They were `#f6f6f6` and `#ececec` on a
 * white card: **1.02:1 between the disc and the page, 1.03:1 between land and
 * sea.** So the one picture on an article card was a ghost, and what little of
 * it read at timeline size was the country outlines rather than the continents.
 * The dark IG variant had already overridden both with a real step (`#1e1e1e` /
 * `#383838`, 1.6:1) and left the light values as they were, which is the tell.
 * 1.14:1 now for the disc against the page and **1.45:1 for land against sea**,
 * which is a globe you can recognise at the 250px a timeline actually renders.
 * Nothing else moves: `rule` still draws the hairlines and the country outlines,
 * so the only thing this changes is the picture.
 */
// `fg`/`rule`/`dim` are drawn from `SHARE_PALETTE` (the site's `--text` /
// `--rule` / `--text-secondary`) rather than hand-picked near-misses — this
// file's own `rule` used to be `#e2e2e2`/`#2a2a2a` against the site's
// `#e8e8e8`/`#181818`, a materially lighter grey for the "same" hairline on
// share cards as on the live page. `bg`/`soft`/`land`/`dot` stay as they are:
// `bg` is card chrome (the dark card is deliberately `#141414`, not the
// site's `#080808`, and untouched by the ghost-globe fix above), `soft` and
// `land` are the globe-specific palette that fix already corrected, and
// `dot` matches the live site's `--brand` exactly in both variants.
export const themeFor = (variant = 'light') => {
  const p = SHARE_PALETTE[variant === 'dark' ? 'dark' : 'light']
  return variant === 'dark'
    ? { bg: '#141414', fg: p.text, soft: '#1a1a1a', rule: p.rule, dim: p.textSecondary, dot: '#c9a84c', land: '#2a2a2a' }
    : { bg: p.bg, fg: p.text, soft: '#f0f0f0', rule: p.rule, dim: p.textSecondary, dot: '#c9a84c', land: '#c9c9c9' }
}

const W = 1200
const H = 630
const PAD_X = 72
const PAD_Y = 80

// Map inset: circular, right side of card.
const MAP_R = 210
const MAP_CX = W - PAD_X - MAP_R
const MAP_CY = H / 2


export const clipText = (text, max) => {
  const t = String(text ?? '').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`
}

export const wrapTitle = (text, maxCharsPerLine, maxLines) => {
  const words = String(text ?? '').trim().split(/\s+/)
  const lines = []
  let current = ''
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current)
      current = w
      if (lines.length === maxLines - 1) {
        const remaining = [current, ...words.slice(words.indexOf(w) + 1)].join(' ')
        lines.push(clipText(remaining, maxCharsPerLine + 4))
        return lines
      }
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}

export const formatLongDate = (iso) => {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase()
}

/**
 * Build a circular orthographic globe SVG fragment centered on lat/lng.
 * Returns '' if lat/lng missing. Generalized from the OG map inset so the
 * Instagram card can reuse the exact projection + land geometry with a
 * different size/position/palette (e.g. a faint full-bleed backdrop).
 *
 * @param {number} lat
 * @param {number} lng
 * @param {Object} theme - palette (see themeFor)
 * @param {Object} [opts]
 * @param {number} [opts.cx] - disc center x
 * @param {number} [opts.cy] - disc center y
 * @param {number} [opts.r]  - disc radius
 * @param {string} [opts.crossColor] - crosshair colour; defaults to theme.dot
 * @param {number} [opts.scaleMul=2.2] - projection.scale = r * scaleMul (zoom)
 * @param {string} [opts.clipId='globe-clip'] - must be unique within the SVG
 * @param {string} [opts.ocean=theme.soft] - disc (water) fill
 * @param {string} [opts.land=theme.land] - landmass fill
 * @param {string|null} [opts.landStroke=theme.rule] - land outline (null = none)
 * @param {number} [opts.landStrokeWidth=0.6]
 * @param {string|null} [opts.rim=theme.rule] - disc rim stroke (null = none)
 * @param {number} [opts.rimWidth=1]
 * @param {boolean} [opts.showCross=true] - gold anchor crosshair at center
 */
export const buildGlobe = (lat, lng, theme, opts = {}) => {
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return ''
  const {
    cx,
    cy,
    r,
    scaleMul = 2.2,
    clipId = 'globe-clip',
    ocean = theme.soft,
    land = theme.land,
    landStroke = theme.rule,
    landStrokeWidth = 0.6,
    rim = theme.rule,
    rimWidth = 1,
    showCross = true,
    crossColor = theme.dot,
  } = opts
  const { countries } = getAssets()
  const projection = geoOrthographic()
    .rotate([-lng, -lat])
    .scale(r * scaleMul)
    .translate([cx, cy])
    .clipAngle(90)
  const path = geoPath(projection)

  // Land paths rendered within a clipPath so continents that cross the
  // horizon don't bleed past the circular mask.
  const landPaths = countries
    .map((c) => path(c))
    .filter(Boolean)
    .map(
      (d) =>
        `<path d="${d}" fill="${land}"${landStroke ? ` stroke="${landStroke}" stroke-width="${landStrokeWidth}"` : ''}/>`,
    )
    .join('')

  // Center crosshair — marks the article's anchor.
  const cross = showCross
    ? `
    <circle cx="${cx}" cy="${cy}" r="4" fill="${crossColor}"/>
    <circle cx="${cx}" cy="${cy}" r="12" fill="none" stroke="${crossColor}" stroke-width="1.2"/>`
    : ''

  return `
  <defs>
    <clipPath id="${clipId}">
      <circle cx="${cx}" cy="${cy}" r="${r}"/>
    </clipPath>
  </defs>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${ocean}"/>
  <g clip-path="url(#${clipId})">${landPaths}</g>
  ${rim ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${rim}" stroke-width="${rimWidth}"/>` : ''}
  ${cross}`
}

// OG map inset: circular globe on the right of the 1200×630 card. Thin
// wrapper over buildGlobe preserving the original geometry + palette.
const buildMapInset = (lat, lng, theme) =>
  buildGlobe(lat, lng, theme, { cx: MAP_CX, cy: MAP_CY, r: MAP_R, clipId: 'og-map-clip' })

/**
 * Build an SVG string for an article's OG card.
 * @param {Object} article - requires title, category, date; optional location, lat, lng
 * @param {'light'|'dark'} variant
 */
export const buildOgSvg = (article, variant = 'light') => {
  const theme = themeFor(variant)

  const hasMap = article.lat != null && article.lng != null
  // When the map is present, the title wraps narrower — left column only.
  //
  // These were 16/24, tuned by eye against the monospace-metric render
  // `rasterizeSvg` used to produce, where every glyph took the width of the
  // widest one. With real advances the same character count occupies roughly
  // two-thirds the width, so a headline broke after three words and left the
  // column half empty. 20 fills the 636px column at 60px without touching the
  // globe.
  const titleMaxChars = hasMap ? 20 : 30
  const titleLines = wrapTitle(article.title || 'Untitled', titleMaxChars, 4)
  const kicker = `${(article.category || 'politics').toUpperCase()}  ·  ${formatLongDate(article.date)}`
  const location = article.location ? String(article.location).toUpperCase() : null

  const titleLineHeight = 72
  const titleFontSize = 60
  const titleFontWeight = 700
  // The headline grows upward from a fixed last baseline rather than downward
  // from a fixed first one. Top-anchored, a four-line title filled the card and
  // a two-line title left a third of it empty above the dateline — same layout,
  // wildly different composition, decided by how long the headline happened to
  // be. 396 is where the fourth line already sat, so the longest titles are
  // unchanged and only the short ones stop floating.
  const titleStartY = 396 - (titleLines.length - 1) * titleLineHeight

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${theme.bg}"/>

  ${buildMapInset(article.lat, article.lng, theme)}

  <text x="${PAD_X}" y="${PAD_Y + 32}" font-family="Source Sans 3" font-size="22" font-weight="600" fill="${theme.dim}" letter-spacing="2">${escXml(kicker)}</text>

  ${titleLines.map((line, i) => `<text x="${PAD_X}" y="${titleStartY + i * titleLineHeight}" font-family="Source Sans 3" font-size="${titleFontSize}" font-weight="${titleFontWeight}" fill="${theme.fg}" letter-spacing="-0.01em">${escXml(line)}</text>`).join('\n  ')}

  ${location ? `<text x="${PAD_X}" y="${H - 110}" font-family="Source Sans 3" font-size="22" font-weight="600" fill="${theme.dim}" letter-spacing="2">${escXml(location)}</text>` : ''}

  <text x="${PAD_X}" y="${H - 64}" font-family="Source Sans 3" font-size="28" font-weight="700" fill="${theme.fg}" letter-spacing="-0.01em">zuhd<tspan fill="${theme.dim}">.</tspan>news</text>
</svg>`
}

// ── Cards for the pages that are not articles ──────────────────────────────
//
// Country, category and entity pages all shared one static `/og-image.png` —
// the wordmark on a dark field. Which is fine as a brand mark and useless as a
// share: someone passing on Palestine's profile, or the economy desk, got a
// card that said nothing about what they were passing on, so the thing that
// actually travels on X and WhatsApp carried none of the page's substance.
//
// These reuse the article card's grid exactly — same padding, same globe
// geometry, same wordmark on the same baseline — so the generated cards read as
// one family rather than three designs that happen to share a typeface.

/** The masthead, bottom-left, on every generated card. */
const wordmark = (theme) =>
  `<text x="${PAD_X}" y="${H - 64}" font-family="Source Sans 3" font-size="28" font-weight="700" fill="${theme.fg}" letter-spacing="-0.01em">zuhd<tspan fill="${theme.dim}">.</tspan>news</text>`

const kickerText = (parts, theme) =>
  `<text x="${PAD_X}" y="${PAD_Y + 32}" font-family="Source Sans 3" font-size="22" font-weight="600" fill="${theme.dim}" letter-spacing="2">${escXml(parts.filter(Boolean).join('  ·  ').toUpperCase())}</text>`

/** Right edge of the left-hand text column — where a globe is, it stops short. */
const COL_RIGHT = MAP_CX - MAP_R - 44

/**
 * A country profile card.
 *
 * The globe is centred on the country itself, which is the one thing a country
 * card can say that a headline card cannot — you recognise the place before you
 * read the name. Three ranked metrics follow, because a rank is what makes a
 * number worth sharing: "82 years" is a fact, "82 years · 6 of 145" is an
 * argument.
 *
 * No flag. The card is rasterised with the Source Sans buffer and nothing else,
 * so a regional-indicator pair has no glyph to resolve to and renders as two
 * empty boxes — the emoji reads perfectly in the terminal and ships as tofu.
 *
 * @param {Object} c - { name, region, metaLine, metrics: [{label,value,rank,total}], lat, lng }
 */
export const buildCountryOgSvg = (c, variant = 'light') => {
  const theme = themeFor(variant)
  const hasMap = c.lat != null && c.lng != null
  // Same column, same measure as the article card's headline (see there for
  // why these are not the numbers the monospace render wanted).
  const nameLines = wrapTitle(c.name || 'Country', hasMap ? 20 : 30, 2)
  const metaLines = (c.metaLine ? wrapTitle(c.metaLine, hasMap ? 46 : 68, 2) : [])
    // The meta line is middot-separated, and a greedy wrap happily ends a line
    // on the separator — "Washington, D.C. · pop. 340M · English ·" over
    // "United States dollar". The break is already doing the separating.
    .map((line) => line.replace(/\s*·\s*$/, ''))
  const metrics = (c.metrics || []).slice(0, 3)

  const nameStartY = 190
  const nameLineHeight = 68
  const metaStartY = nameStartY + nameLines.length * nameLineHeight - 4
  const metricsStartY = metaStartY + metaLines.length * 30 + 40

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${theme.bg}"/>

  ${buildGlobe(c.lat, c.lng, theme, { cx: MAP_CX, cy: MAP_CY, r: MAP_R, clipId: 'country-og-clip', scaleMul: 1.6 })}

  ${kickerText(['country profile', c.region], theme)}

  ${nameLines.map((line, i) => `<text x="${PAD_X}" y="${nameStartY + i * nameLineHeight}" font-family="Source Sans 3" font-size="60" font-weight="700" fill="${theme.fg}" letter-spacing="-0.01em">${escXml(line)}</text>`).join('\n  ')}

  ${metaLines.map((line, i) => `<text x="${PAD_X}" y="${metaStartY + i * 30}" font-family="Source Sans 3" font-size="21" font-weight="400" fill="${theme.dim}">${escXml(line)}</text>`).join('\n  ')}

  ${metrics
    .map((m, i) => {
      const y = metricsStartY + i * 40
      const rank = m.rank && m.total ? `  ·  ${m.rank} of ${m.total}` : ''
      return `<line x1="${PAD_X}" y1="${y - 26}" x2="${COL_RIGHT}" y2="${y - 26}" stroke="${theme.rule}" stroke-width="1"/>
  <text x="${PAD_X}" y="${y}" font-family="Source Sans 3" font-size="20" font-weight="400" fill="${theme.dim}">${escXml(clipText(m.label, 26))}</text>
  <text x="${COL_RIGHT}" y="${y}" text-anchor="end" font-family="Source Sans 3" font-size="20" font-weight="600" fill="${theme.fg}">${escXml(clipText(`${m.value}${rank}`, 30))}</text>`
    })
    .join('\n  ')}

  ${wordmark(theme)}
</svg>`
}

/**
 * A category card.
 *
 * No globe: a desk is not a place, and putting Earth behind the word "tech"
 * would be decoration pretending to be information. What is left is the one
 * thing the page is — a name and how much of it there is — set large enough
 * that the card works at the size a timeline actually renders it.
 *
 * @param {Object} c - { category, count, days }
 */
export const buildCategoryOgSvg = (c, variant = 'light') => {
  const theme = themeFor(variant)
  const name = String(c.category || 'news')
  const line = [
    c.count ? `${c.count} ${c.count === 1 ? 'story' : 'stories'}` : null,
    c.days ? `last ${c.days} days` : null,
  ]
    .filter(Boolean)
    .join('  ·  ')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${theme.bg}"/>

  ${kickerText(['zuhd.news', 'category'], theme)}

  <text x="${PAD_X}" y="${H / 2 + 26}" font-family="Source Sans 3" font-size="128" font-weight="700" fill="${theme.fg}" letter-spacing="-0.03em">${escXml(name)}</text>
  <line x1="${PAD_X}" y1="${H / 2 + 66}" x2="${W - PAD_X}" y2="${H / 2 + 66}" stroke="${theme.rule}" stroke-width="1"/>
  ${line ? `<text x="${PAD_X}" y="${H / 2 + 106}" font-family="Source Sans 3" font-size="24" font-weight="400" fill="${theme.dim}" letter-spacing="1">${escXml(line)}</text>` : ''}

  ${wordmark(theme)}
</svg>`
}

/**
 * The card for the site itself — `/og-image.png`, which is what a bare
 * `zuhd.news` link renders as, plus every static page, `/e/{id}` and
 * `/get`.
 *
 * The note at the head of this section fixed country and category cards and
 * left this one, so the front door kept shipping a **grey capital Z on
 * near-black, last written 2026-04-12** — a mark the site does not use anywhere
 * any more (`favicon.svg`, `logo.svg` and the app icon are the three-piece
 * angular Z), in a palette no other generated card uses, saying nothing about
 * what is behind the link. The same argument `shareUrl` makes about `/s/{slug}`
 * applies to the picture as well as the destination: this site's front door is
 * a live map of the world, and a share that shows a letterform shows a stranger
 * the one thing it is not.
 *
 * **Evergreen, and that is a constraint rather than a preference.** The URL is
 * permanent and hardcoded in four templates, and social scrapers cache a card
 * by URL — so a story count or a date would be frozen at whatever the first
 * scrape happened to see and could never be corrected. Everything here is a
 * standing fact about the site.
 *
 * **The globe is centred on Makkah**, which is the frame this site already
 * keeps: the clock, the Hijri date, the currency basket and the first-class
 * exchanges are all read from there. It is also simply the better projection
 * for the coverage — Africa, Europe, the Middle East and South Asia all land on
 * the disc, where a `[0, 0]` default spends half of it on the Atlantic. No
 * crosshair: on an article card it marks the story, here there is no single
 * story, and the map itself does not mark Makkah either.
 *
 * The masthead is the headline, so there is no second wordmark on the baseline
 * — it would be the same word twice on one card.
 */
const MAKKAH = { lat: 21.4225, lng: 39.8262 }

export const buildSiteOgSvg = (variant = 'light') => {
  const theme = themeFor(variant)
  // The homepage's own `og:description`, minus the clause the picture makes
  // redundant — a card that draws a globe does not need to say "a live map".
  const lines = ['The last 14 days of world news,', 'from 40 sources, curated by AI.']
  const titleY = 300

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${theme.bg}"/>

  ${buildGlobe(MAKKAH.lat, MAKKAH.lng, theme, {
    cx: MAP_CX,
    cy: MAP_CY,
    r: MAP_R,
    clipId: 'site-og-clip',
    scaleMul: 1.0,
    showCross: false,
  })}

  ${kickerText(['global news', 'no noise'], theme)}

  <text x="${PAD_X}" y="${titleY}" font-family="Source Sans 3" font-size="104" font-weight="700" fill="${theme.fg}" letter-spacing="-0.03em">zuhd<tspan fill="${theme.dot}">.</tspan>news</text>
  <line x1="${PAD_X}" y1="${titleY + 44}" x2="${COL_RIGHT}" y2="${titleY + 44}" stroke="${theme.rule}" stroke-width="1"/>
  ${lines
    .map(
      (line, i) =>
        `<text x="${PAD_X}" y="${titleY + 88 + i * 34}" font-family="Source Sans 3" font-size="26" font-weight="400" fill="${theme.dim}">${escXml(line)}</text>`,
    )
    .join('\n  ')}
</svg>`
}

/**
 * Rasterize an SVG string to PNG bytes.
 *
 * By PATH, not by buffer. resvg-js renders a font handed to it as
 * `fontBuffers` with uniform advances — every glyph gets the same width — so
 * proportional type comes out looking like a monospace face, and the variable
 * WOFF2 this used to pass had exactly that effect on every share card the site
 * has ever produced. `fontFiles` loads the real metrics. `ig-image.js` found
 * this and fixed it on its own side; the OG cards were left on the buffer path
 * and kept shipping wide, evenly-spaced headlines to every timeline they
 * landed in.
 *
 * The static weights ship with the build tooling for this reason — they are
 * not the ones the site serves (`/fonts/*.woff2` is one variable file), so
 * bumping one does not necessarily bump the other.
 */
const FONT_FILES = [
  'SourceSans3-Regular.ttf',
  'SourceSans3-SemiBold.ttf',
  'SourceSans3-Bold.ttf',
].map((f) => fileURLToPath(new URL(`../assets/fonts/${f}`, import.meta.url)))

export const rasterizeSvg = (svgString) => {
  const resvg = new Resvg(svgString, {
    font: {
      fontFiles: FONT_FILES,
      loadSystemFonts: false,
      defaultFontFamily: 'Source Sans 3',
    },
    fitTo: { mode: 'width', value: W },
    background: 'transparent',
  })
  return resvg.render().asPng()
}

/** Convenience: build + rasterize in one call. Returns a Buffer. */
/** @param {any} article @param {'light'|'dark'} [variant] */
export const buildOgPng = (article, variant = 'light') =>
  rasterizeSvg(buildOgSvg(article, variant))

export const buildCountryOgPng = (country, variant = 'light') =>
  rasterizeSvg(buildCountryOgSvg(country, variant))

export const buildCategoryOgPng = (category, variant = 'light') =>
  rasterizeSvg(buildCategoryOgSvg(category, variant))

export const buildSiteOgPng = (variant = 'light') => rasterizeSvg(buildSiteOgSvg(variant))
