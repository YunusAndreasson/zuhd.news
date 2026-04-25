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
const getAssets = () => {
  if (_assets) return _assets
  const fontRegular = readFileSync(join(ROOT, 'public', 'fonts', 'source-sans-3-var.woff2'))
  const topo = JSON.parse(readFileSync(join(ROOT, 'shared', 'data', 'countries-110m.json'), 'utf8'))
  const countries = feature(topo, topo.objects.countries).features
  _assets = { fontRegular, countries }
  return _assets
}

const W = 1200
const H = 630
const PAD_X = 72
const PAD_Y = 80

// Map inset: circular, right side of card.
const MAP_R = 210
const MAP_CX = W - PAD_X - MAP_R
const MAP_CY = H / 2

const escXml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const clipText = (text, max) => {
  const t = String(text ?? '').trim()
  if (t.length <= max) return t
  return t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…'
}

const wrapTitle = (text, maxCharsPerLine, maxLines) => {
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

const formatLongDate = (iso) => {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase()
}

// Build the map inset SVG fragment. Returns '' if lat/lng missing.
const buildMapInset = (lat, lng, theme) => {
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return ''
  const { countries } = getAssets()
  const projection = geoOrthographic()
    .rotate([-lng, -lat])
    .scale(MAP_R * 2.2)
    .translate([MAP_CX, MAP_CY])
    .clipAngle(90)
  const path = geoPath(projection)

  // Visible-hemisphere disc (water) and land paths rendered within a
  // clipPath so continents that cross the horizon don't bleed past the
  // circular mask.
  const clipId = `og-map-clip`
  const landPaths = countries
    .map((c) => path(c))
    .filter(Boolean)
    .map((d) => `<path d="${d}" fill="${theme.land}" stroke="${theme.rule}" stroke-width="0.6"/>`)
    .join('')

  // Center crosshair — marks the article's anchor.
  const cross = `
    <circle cx="${MAP_CX}" cy="${MAP_CY}" r="4" fill="${theme.dot}"/>
    <circle cx="${MAP_CX}" cy="${MAP_CY}" r="12" fill="none" stroke="${theme.dot}" stroke-width="1.2"/>`

  return `
  <defs>
    <clipPath id="${clipId}">
      <circle cx="${MAP_CX}" cy="${MAP_CY}" r="${MAP_R}"/>
    </clipPath>
  </defs>
  <circle cx="${MAP_CX}" cy="${MAP_CY}" r="${MAP_R}" fill="${theme.soft}"/>
  <g clip-path="url(#${clipId})">${landPaths}</g>
  <circle cx="${MAP_CX}" cy="${MAP_CY}" r="${MAP_R}" fill="none" stroke="${theme.rule}" stroke-width="1"/>
  ${cross}`
}

/**
 * Build an SVG string for an article's OG card.
 * @param {Object} article — requires title, category, date; optional location, lat, lng
 * @param {'light'|'dark'} variant
 */
export const buildOgSvg = (article, variant = 'light') => {
  const theme = variant === 'dark'
    ? { bg: '#141414', fg: '#d4d4d4', soft: '#1a1a1a', rule: '#2a2a2a', dim: '#a3a3a3', dot: '#e8b84c', land: '#2a2a2a' }
    : { bg: '#ffffff', fg: '#1a1a1a', soft: '#f6f6f6', rule: '#e2e2e2', dim: '#555555', dot: '#c9a84c', land: '#ececec' }

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
