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
export const IG_X = { width: 1600, height: 900 } // 16:9 landscape for X — fills the timeline

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

  // Landscape card (X): text column on the left, the globe large on the right.
  // X's native single-image aspect, so it fills the timeline with no crop.
  if (W > H) {
    const PADL = 90
    const colW = W * 0.6 - PADL
    const shadow = variant === 'dark' ? '#000000' : '#ffffff'
    const dek = variant === 'dark' ? '#cfcfcf' : theme.dim
    const kickerL = `${(article.category || 'news').toUpperCase()}  ·  ${formatLongDate(article.date)}`
    const locL = article.location ? String(article.location).toUpperCase() : null
    const headL = article.headline || article.title || 'Breaking News'
    const sumL = String(article.summary || '').trim()
    const gl = buildGlobe(article.lat, article.lng, theme, {
      cx: W * 0.8,
      cy: H * 0.52,
      r: H * 0.62,
      scaleMul: 2.0,
      clipId: 'ig-globe-clip',
      ocean: variant === 'dark' ? '#1e1e1e' : theme.soft,
      land: variant === 'dark' ? '#383838' : theme.land,
      // Country borders — delicate lines between nations (see feed branch).
      landStroke: variant === 'dark' ? '#6b6b6b' : '#c4c4c4',
      landStrokeWidth: 0.8,
      rim: null,
      showCross: true,
    })
    const tf = headL.length > 34 ? 64 : 72
    const tlh = Math.round(tf * 1.14)
    const tl = wrapTitle(headL, Math.floor(colW / (tf * 0.62)), 3)
    const ty = Math.round(H * 0.24) + tf
    const df = 40
    const dlh = Math.round(df * 1.45)
    const dl = sumL ? wrapTitle(sumL, Math.floor(colW / (df * 0.53)), 5) : []
    const dy = ty + (tl.length - 1) * tlh + tlh + df
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs><filter id="ig-text-shadow" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="2" stdDeviation="8" flood-color="${shadow}" flood-opacity="0.55"/></filter></defs>
  <rect width="${W}" height="${H}" fill="${theme.bg}"/>
  ${gl ? `<g opacity="0.95">${gl}</g>` : ''}
  <g filter="url(#ig-text-shadow)">
  <text x="${PADL}" y="${PADL + 40}" font-family="Source Sans 3" font-size="26" font-weight="600" fill="${theme.dim}" letter-spacing="3">${escXml(kickerL)}</text>
  ${tl.map((l, i) => `<text x="${PADL}" y="${ty + i * tlh}" font-family="Source Sans 3" font-size="${tf}" font-weight="700" fill="${theme.fg}" letter-spacing="-0.01em">${escXml(l)}</text>`).join('\n  ')}
  ${dl.map((l, i) => `<text x="${PADL}" y="${dy + i * dlh}" font-family="Source Sans 3" font-size="${df}" font-weight="400" fill="${dek}">${escXml(l)}</text>`).join('\n  ')}
  ${locL ? `<text x="${PADL}" y="${H - 120}" font-family="Source Sans 3" font-size="26" font-weight="600" fill="${theme.dim}" letter-spacing="3">${escXml(locL)}</text>` : ''}
  <text x="${PADL}" y="${H - 64}" font-family="Source Sans 3" font-size="34" font-weight="700" fill="${theme.fg}" letter-spacing="-0.01em">zuhd<tspan fill="${theme.dim}">.</tspan>news</text>
  </g>
</svg>`
  }

  const inner = W - PAD * 2

  // A large orthographic earth that bleeds full-width across the lower half of
  // the card — grounded, edge-to-edge, not a small disc floating over empty
  // space. The gold anchor (its center) marks the story's location. A scrim
  // (below) fades the earth out under the type so the upper half stays a clean
  // field for the headline + dek, and the two halves read in balance.
  const globeR = Math.round(W * 0.56)
  const globeCy = Math.round(H * 0.74)
  const globe = buildGlobe(article.lat, article.lng, theme, {
    cx: W / 2,
    cy: globeCy,
    r: globeR,
    scaleMul: 1.9,
    clipId: 'ig-globe-clip',
    // A touch more presence than the flat theme greys so the globe reads on
    // the dark card without competing with the type.
    ocean: variant === 'dark' ? '#1c1c1c' : theme.soft,
    land: variant === 'dark' ? '#3d3d3d' : theme.land,
    // Country borders: each country is its own stroked path, so this draws the
    // dividing lines between nations. Kept delicate but with enough contrast
    // over the land fill to read clearly on the card.
    landStroke: variant === 'dark' ? '#6b6b6b' : '#c4c4c4',
    landStrokeWidth: 0.8,
    rim: null, // full-width bleed in the lower half — grounded, no bounding disc
    showCross: true,
  })
  const globeLayer = globe ? `<g opacity="0.98">${globe}</g>` : ''

  const kicker = `${(article.category || 'news').toUpperCase()}  ·  ${formatLongDate(article.date)}`
  const location = article.location ? String(article.location).toUpperCase() : null

  // Headline (article title), bold. resvg renders Source Sans 3 with wide,
  // near-uniform advances (~0.62em) — size the wrap to that so it never clips.
  const headline = article.headline || article.title || 'Breaking News'
  const titleFontSize = headline.length > 38 ? 82 : 94
  const titleLineHeight = Math.round(titleFontSize * 1.1)
  const titleLines = wrapTitle(headline, Math.floor(inner / (titleFontSize * 0.62)), 3)
  const titleStartY = Math.round(H * 0.135) + titleFontSize

  // Dek: the story lead/summary rendered on the card in regular weight. Regular
  // Source Sans advances are narrower (~0.53em). Sits just under the headline.
  const summary = String(article.summary || '').trim()
  const dekFontSize = 46
  const dekLineHeight = Math.round(dekFontSize * 1.42)
  // Brighter than the dim label grey so the dek stays legible over the globe on
  // the dark card; weight (400 vs the 700 headline) still carries the hierarchy.
  const dekColor = variant === 'dark' ? '#cfcfcf' : theme.dim
  const dekLines = summary ? wrapTitle(summary, Math.floor(inner / (dekFontSize * 0.53)), 6) : []
  const dekStartY = titleStartY + (titleLines.length - 1) * titleLineHeight + titleLineHeight + dekFontSize

  // Soft shadow behind the type so it stays crisp where it crosses the globe.
  const shadowColor = variant === 'dark' ? '#000000' : '#ffffff'

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <filter id="ig-text-shadow" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="2" stdDeviation="8" flood-color="${shadowColor}" flood-opacity="0.55"/>
    </filter>
    <linearGradient id="ig-scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${theme.bg}" stop-opacity="1"/>
      <stop offset="0.50" stop-color="${theme.bg}" stop-opacity="1"/>
      <stop offset="0.60" stop-color="${theme.bg}" stop-opacity="0"/>
      <stop offset="0.88" stop-color="${theme.bg}" stop-opacity="0"/>
      <stop offset="1" stop-color="${theme.bg}" stop-opacity="0.72"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${theme.bg}"/>

  ${globeLayer}
  <rect width="${W}" height="${H}" fill="url(#ig-scrim)"/>

  <g filter="url(#ig-text-shadow)">
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
  </g>
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
