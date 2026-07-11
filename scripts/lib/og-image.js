// OG image generation: typography + orthographic map inset, 1200×630.
// Rendered at build time per article, emitted to dist/api/og/{slug}.png.
//
// Stack: hand-built SVG string → @resvg/resvg-js (WOFF2 font buffer
// + PNG raster). Zero runtime cost; shares the Source Sans 3 WOFF2
// already shipped to /fonts/ so the OG render matches the site's
// type exactly. Map inset uses d3-geo orthographic centered on the
// article's lat/lng, from shared/data/countries-110m.json (108 KB).

import { readFileSync } from 'fs'
import { join } from 'path'
import { Resvg } from '@resvg/resvg-js'
import { geoOrthographic, geoPath, geoCircle } from 'd3-geo'
import { feature } from 'topojson-client'

const ROOT = new URL('../..', import.meta.url).pathname

let _assets = null
/**
 * Load + memoize the shared render assets: the Source Sans 3 variable-font
 * buffer (also shipped to /fonts/, so renders match the site) and the
 * 110m country features from shared/data. Reused by ig-image.js.
 */
export const getAssets = () => {
  if (_assets) return _assets
  const fontRegular = readFileSync(join(ROOT, 'public', 'fonts', 'source-sans-3-var.woff2'))
  const topo = JSON.parse(readFileSync(join(ROOT, 'shared', 'data', 'countries-110m.json'), 'utf8'))
  const countries = feature(topo, topo.objects.countries).features
  _assets = { fontRegular, countries }
  return _assets
}

/** The two-tone palette shared by every share card. */
export const themeFor = (variant = 'light') =>
  variant === 'dark'
    ? { bg: '#141414', fg: '#d4d4d4', soft: '#1a1a1a', rule: '#2a2a2a', dim: '#a3a3a3', dot: '#e8b84c', land: '#2a2a2a' }
    : { bg: '#ffffff', fg: '#1a1a1a', soft: '#f6f6f6', rule: '#e2e2e2', dim: '#555555', dot: '#c9a84c', land: '#ececec' }

const W = 1200
const H = 630
const PAD_X = 72
const PAD_Y = 80

// Map inset: circular, right side of card.
const MAP_R = 210
const MAP_CX = W - PAD_X - MAP_R
const MAP_CY = H / 2

export const escXml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

export const clipText = (text, max) => {
  const t = String(text ?? '').trim()
  if (t.length <= max) return t
  return t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…'
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
 * @param {Object} theme — palette (see themeFor)
 * @param {Object} opts
 * @param {number} opts.cx — disc center x
 * @param {number} opts.cy — disc center y
 * @param {number} opts.r  — disc radius
 * @param {number} [opts.scaleMul=2.2] — projection.scale = r * scaleMul (zoom)
 * @param {string} [opts.clipId='globe-clip'] — must be unique within the SVG
 * @param {string} [opts.ocean=theme.soft] — disc (water) fill
 * @param {string} [opts.land=theme.land] — landmass fill
 * @param {string|null} [opts.landStroke=theme.rule] — land outline (null = none)
 * @param {number} [opts.landStrokeWidth=0.6]
 * @param {string|null} [opts.rim=theme.rule] — disc rim stroke (null = none)
 * @param {number} [opts.rimWidth=1]
 * @param {boolean} [opts.showCross=true] — gold anchor crosshair at center
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
 * @param {Object} article — requires title, category, date; optional location, lat, lng
 * @param {'light'|'dark'} variant
 */
export const buildOgSvg = (article, variant = 'light') => {
  const theme = themeFor(variant)

  const hasMap = article.lat != null && article.lng != null
  // When the map is present, title wraps narrower (left column only).
  const titleMaxChars = hasMap ? 16 : 24
  const titleLines = wrapTitle(article.title || 'Untitled', titleMaxChars, 4)
  const kicker = `${(article.category || 'politics').toUpperCase()}  ·  ${formatLongDate(article.date)}`
  const location = article.location ? String(article.location).toUpperCase() : null

  const titleStartY = 180
  const titleLineHeight = 72
  const titleFontSize = 60
  const titleFontWeight = 700

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

/** Rasterize an SVG string to PNG bytes using resvg-js with WOFF2 bundled. */
export const rasterizeSvg = (svgString) => {
  const { fontRegular } = getAssets()
  const resvg = new Resvg(svgString, {
    font: {
      fontBuffers: [fontRegular],
      loadSystemFonts: false,
      defaultFontFamily: 'Source Sans 3',
    },
    fitTo: { mode: 'width', value: W },
    background: 'transparent',
  })
  return resvg.render().asPng()
}

/** Convenience: build + rasterize in one call. Returns a Buffer. */
export const buildOgPng = (article, variant = 'light') =>
  rasterizeSvg(buildOgSvg(article, variant))
