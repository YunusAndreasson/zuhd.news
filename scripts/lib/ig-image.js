// Instagram share card: the breaking-alert headline over a delicate,
// full-bleed orthographic globe — the OG card's visual language recomposed
// for a vertical feed post (1080×1350, 4:5) and a Story (1080×1920, 9:16).
//
// Stack mirrors og-image.js: hand-built SVG string → @resvg/resvg-js (WOFF2
// font buffer). Instagram's publish API rejects PNG, so we take resvg's RGBA
// pixel buffer and encode JPEG with jpeg-js (pure JS, no native dep). The
// globe geometry, fonts, palette and text helpers are all reused from
// og-image.js so the two cards stay a single source of truth.

import { fileURLToPath } from 'url'
import { Resvg } from '@resvg/resvg-js'
import jpeg from 'jpeg-js'
import { themeFor, buildGlobe, escXml, wrapTitle, formatLongDate } from './og-image.js'

// Static Source Sans 3 weights loaded by PATH. resvg-js 2.6.2 renders fonts
// passed as `fontBuffers` with uniform (monospace-like) advances — a known
// metrics bug — but loads proper proportional advances from `fontFiles`. The
// share card's type quality depends on this, so we ship the static TTFs with
// the build tooling and hand resvg the paths.
const FONT_FILES = ['SourceSans3-Regular.ttf', 'SourceSans3-SemiBold.ttf', 'SourceSans3-Bold.ttf'].map((f) =>
  fileURLToPath(new URL(`../assets/fonts/${f}`, import.meta.url)),
)

// Feed post (4:5) is the canonical size; the Story variant reuses the same
// composer with a taller canvas so it fills a 9:16 screen natively.
export const IG_FEED = { width: 1080, height: 1350 }
export const IG_STORY = { width: 1080, height: 1920 }

const PAD = 72

/**
 * Compose the Instagram card SVG.
 * @param {Object} article — { headline, category, date, location, lat, lng }
 *   headline is the wire alert we push (falls back to the article title).
 * @param {Object} [size=IG_FEED] — { width, height }
 * @param {'light'|'dark'} [variant='light']
 */
export const buildIgSvg = (article, size = IG_FEED, variant = 'light') => {
  const { width: W, height: H } = size
  const theme = themeFor(variant)

  // The globe sits low and oversized so it bleeds off the sides and bottom,
  // reading as an atmospheric backdrop rather than a bounded inset. Rendered
  // faint (soft ocean, light land, no hard rim) with the gold anchor crosshair
  // marking the story's location — the one deliberate accent.
  const globe = buildGlobe(article.lat, article.lng, theme, {
    cx: W / 2,
    cy: H * 0.72,
    r: W * 0.62,
    scaleMul: 2.0,
    clipId: 'ig-globe-clip',
    landStroke: null, // no outline — keeps the backdrop soft
    rim: null, // bleed, no bounding ring
    showCross: true,
  })
  // Drop the whole globe layer to a low opacity so headline type stays crisp.
  const globeLayer = globe ? `<g opacity="0.85">${globe}</g>` : ''

  const kicker = `${(article.category || 'news').toUpperCase()}  ·  ${formatLongDate(article.date)}`
  const location = article.location ? String(article.location).toUpperCase() : null

  // Headline = the wire alert. Size steps down as the alert gets longer so it
  // always fits the upper band above the globe's midline.
  const headline = article.headline || article.title || 'Breaking News'
  const len = headline.length
  const titleFontSize = len > 64 ? 66 : len > 40 ? 76 : 88
  const titleLineHeight = Math.round(titleFontSize * 1.15)
  // Source Sans 3 renders through resvg with wide, near-uniform advances
  // (~0.62em) — size the wrap to that so long alerts never clip the edge.
  const maxCharsPerLine = Math.floor((W - PAD * 2) / (titleFontSize * 0.62))
  const titleLines = wrapTitle(headline, maxCharsPerLine, 6)
  const titleStartY = Math.round(H * 0.2) + titleFontSize

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${theme.bg}"/>

  ${globeLayer}

  <text x="${PAD}" y="${PAD + 48}" font-family="Source Sans 3" font-size="26" font-weight="600" fill="${theme.dim}" letter-spacing="3">${escXml(kicker)}</text>

  ${titleLines
    .map(
      (line, i) =>
        `<text x="${PAD}" y="${titleStartY + i * titleLineHeight}" font-family="Source Sans 3" font-size="${titleFontSize}" font-weight="700" fill="${theme.fg}" letter-spacing="-0.01em">${escXml(line)}</text>`,
    )
    .join('\n  ')}

  ${location ? `<text x="${PAD}" y="${H - 112}" font-family="Source Sans 3" font-size="26" font-weight="600" fill="${theme.dim}" letter-spacing="3">${escXml(location)}</text>` : ''}

  <text x="${PAD}" y="${H - 60}" font-family="Source Sans 3" font-size="34" font-weight="700" fill="${theme.fg}" letter-spacing="-0.01em">zuhd<tspan fill="${theme.dim}">.</tspan>news</text>
</svg>`
}

/**
 * Rasterize an Instagram card SVG to a JPEG Buffer (Instagram rejects PNG).
 * resvg gives us the RGBA pixel buffer; jpeg-js encodes it to JPEG.
 */
export const rasterizeIgJpeg = (svgString, size = IG_FEED, quality = 92) => {
  const theme = themeFor('light')
  const resvg = new Resvg(svgString, {
    font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: 'Source Sans 3' },
    fitTo: { mode: 'width', value: size.width },
    background: theme.bg, // opaque — JPEG has no alpha channel
  })
  const rendered = resvg.render()
  const { data } = jpeg.encode({ data: rendered.pixels, width: rendered.width, height: rendered.height }, quality)
  return data
}

/** Convenience: build + rasterize in one call. Returns a JPEG Buffer. */
export const buildIgJpeg = (article, size = IG_FEED, variant = 'light') =>
  rasterizeIgJpeg(buildIgSvg(article, size, variant), size)
