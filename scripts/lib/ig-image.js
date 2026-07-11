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
 * Compose the Instagram card SVG: kicker, headline, a story dek (summary text
 * rendered ON the card), a delicate full-bleed globe, and location + wordmark.
 * @param {Object} article — { headline, summary, category, date, location, lat, lng }
 *   headline is the article title; summary is the lead/first sentences of the story.
 * @param {Object} [size=IG_FEED] — { width, height }
 * @param {'light'|'dark'} [variant='light']
 */
export const buildIgSvg = (article, size = IG_FEED, variant = 'dark') => {
  const { width: W, height: H } = size
  const theme = themeFor(variant)
  const inner = W - PAD * 2

  // The globe sits low and oversized so it bleeds off the sides and bottom,
  // reading as an atmospheric backdrop under the type rather than a bounded
  // inset. Faint (soft ocean, light land, no rim) with the gold anchor
  // crosshair marking the story's location — the one deliberate accent.
  const globe = buildGlobe(article.lat, article.lng, theme, {
    cx: W / 2,
    cy: H * 0.8,
    r: W * 0.6,
    scaleMul: 2.0,
    clipId: 'ig-globe-clip',
    // A touch more presence than the flat theme greys so the globe reads on
    // the dark card without competing with the type.
    ocean: variant === 'dark' ? '#1e1e1e' : theme.soft,
    land: variant === 'dark' ? '#383838' : theme.land,
    landStroke: null, // no outline — keeps the backdrop soft
    rim: null, // bleed, no bounding ring
    showCross: true,
  })
  const globeLayer = globe ? `<g opacity="0.95">${globe}</g>` : ''

  const kicker = `${(article.category || 'news').toUpperCase()}  ·  ${formatLongDate(article.date)}`
  const location = article.location ? String(article.location).toUpperCase() : null

  // Headline (article title), bold. resvg renders Source Sans 3 with wide,
  // near-uniform advances (~0.62em) — size the wrap to that so it never clips.
  const headline = article.headline || article.title || 'Breaking News'
  const titleFontSize = headline.length > 38 ? 72 : 84
  const titleLineHeight = Math.round(titleFontSize * 1.12)
  const titleLines = wrapTitle(headline, Math.floor(inner / (titleFontSize * 0.62)), 3)
  const titleStartY = Math.round(H * 0.13) + titleFontSize

  // Dek: the story lead/summary rendered on the card in regular weight. Regular
  // Source Sans advances are narrower (~0.53em). Sits just under the headline.
  const summary = String(article.summary || '').trim()
  const dekFontSize = 45
  const dekLineHeight = Math.round(dekFontSize * 1.46)
  // Brighter than the dim label grey so the dek stays legible over the globe on
  // the dark card; weight (400 vs the 700 headline) still carries the hierarchy.
  const dekColor = variant === 'dark' ? '#cfcfcf' : theme.dim
  const dekLines = summary ? wrapTitle(summary, Math.floor(inner / (dekFontSize * 0.53)), 7) : []
  const dekStartY = titleStartY + (titleLines.length - 1) * titleLineHeight + titleLineHeight + dekFontSize

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

  ${dekLines
    .map(
      (line, i) =>
        `<text x="${PAD}" y="${dekStartY + i * dekLineHeight}" font-family="Source Sans 3" font-size="${dekFontSize}" font-weight="400" fill="${dekColor}">${escXml(line)}</text>`,
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
export const rasterizeIgJpeg = (svgString, size = IG_FEED, variant = 'dark', quality = 92) => {
  const resvg = new Resvg(svgString, {
    font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: 'Source Sans 3' },
    fitTo: { mode: 'width', value: size.width },
    background: themeFor(variant).bg, // opaque — JPEG has no alpha channel
  })
  const rendered = resvg.render()
  const { data } = jpeg.encode({ data: rendered.pixels, width: rendered.width, height: rendered.height }, quality)
  return data
}

/** Convenience: build + rasterize in one call. Returns a JPEG Buffer. */
export const buildIgJpeg = (article, size = IG_FEED, variant = 'dark') =>
  rasterizeIgJpeg(buildIgSvg(article, size, variant), size, variant)
