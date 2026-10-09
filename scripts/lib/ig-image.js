// Instagram share card: the breaking-alert headline over a delicate,
// full-bleed orthographic globe — the OG card's visual language recomposed
// for a vertical feed post (1080×1350, 4:5) and a Story (1080×1920, 9:16).
// X is posted the feed card too. The card is dark, and only dark.
//
// Stack mirrors og-image.js: hand-built SVG string → @resvg/resvg-js (WOFF2
// font buffer). Instagram's publish API rejects PNG, so we take resvg's RGBA
// pixel buffer and encode JPEG with jpeg-js (pure JS, no native dep). The
// globe geometry, fonts, palette and text helpers are all reused from
// og-image.js so the two cards stay a single source of truth.

import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import jpeg from 'jpeg-js'
import { stripDateline } from './article.js'
import { escXml, smartQuotes } from './html.js'
import { themeFor, buildGlobe, formatLongDate } from './og-image.js'

// The dark card's globe ocean — a touch more presence than the flat theme
// greys so the globe reads on the dark card without competing with the type.
// Was '#1e1e1e' on the landscape/X card and '#1c1c1c' on the portrait/feed
// card for the same semantic role; one value.
const IG_DARK_OCEAN = '#1e1e1e'
import { fitText, loadFont } from './font-metrics.js'

/**
 * The card's dek: the article's opening, trimmed to whole sentences.
 *
 * Three copies of this — `build.js`, `post-to-instagram.js`,
 * `post-to-twitter.js` — and **they had already parted**. `build.js` was fixed
 * to never emit an ellipsis (see the note below); the two posters were not, so
 * they still cut mid-phrase on `…`. That meant the card the build renders and
 * caches and the card the pipeline actually posts to X and Instagram could
 * carry different dek text for the same story, with the posted one wearing the
 * truncation this file's header says was removed. Nothing about a rendered card
 * reveals which of the two produced it.
 *
 * Trim to whole sentences, never to an ellipsis. The card's type is fitted to
 * whatever arrives (see `font-metrics.js`), so the only job left here is
 * deciding how much of the lead to carry — and a dek that stops mid-phrase on
 * "…" reads as a truncated card rather than as a chosen excerpt.
 *
 * If no sentence boundary falls inside the budget, the first sentence is
 * carried whole however long it is. That is the one case where the old code
 * reached for the ellipsis, and the fitter absorbs the length instead.
 *
 * The dateline comes off by the article's `location` (`stripDateline`). It
 * came off by a pattern of ASCII letters, which left `Brasília — ` at the head
 * of the dek on three of the last 99 cards posted to Instagram (2026-10-02,
 * 10-04 and 10-05, the Brazilian election), over BRASÍLIA at the card's foot.
 *
 * @param {string} body
 * @param {string} [location] the article's `location`
 */
export const igLead = (body, location) => {
  let t = stripDateline(String(body || '').trim().split(/\n\n+/).slice(0, 2).join(' '), location)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // markdown links -> text
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (t.length > 260) {
    const cut = t.slice(0, 260)
    const end = cut.lastIndexOf('. ')
    if (end > 130) {
      t = cut.slice(0, end + 1)
    } else {
      const firstStop = t.indexOf('. ')
      t = firstStop > 0 ? t.slice(0, firstStop + 1) : t
    }
  }
  return t
}

/**
 * What a story's card is drawn from: the build's cards under `/api/ig/`, the
 * card the X poster renders and uploads, and the Instagram poster's preview.
 *
 * One function because the three had parted. The build curled the quotes in
 * the headline and the posters did not, so the X card and the Instagram card
 * of one story differed wherever the headline had an apostrophe.
 *
 * The keys are in the order the build wrote them, and the build hashes this
 * object for its cache key: reorder them and every card renders again.
 *
 * @param {Record<string, any>} meta the article's frontmatter
 * @param {string} body its prose
 */
export const igCardInputs = (meta, body) => ({
  // The card headline `pick-breaking-social.js` wrote before the build, when
  // there is one, over the article's own title.
  headline: smartQuotes(String(meta.socialTitle || meta.title || 'Untitled')),
  summary: igLead(body, meta.location),
  category: meta.category || null,
  date: meta.date,
  location: meta.location || null,
  lat: meta.lat != null ? Number(meta.lat) : null,
  lng: meta.lng != null ? Number(meta.lng) : null,
})

// Static Source Sans 3 weights loaded by PATH. resvg-js 2.6.2 renders fonts
// passed as `fontBuffers` with uniform (monospace-like) advances — a known
// metrics bug — but loads proper proportional advances from `fontFiles`. The
// share card's type quality depends on this, so we ship the static TTFs with
// the build tooling and hand resvg the paths.
const fontPath = (f) => fileURLToPath(new URL(`../assets/fonts/${f}`, import.meta.url))
const FONT_FILES = ['SourceSans3-Regular.ttf', 'SourceSans3-SemiBold.ttf', 'SourceSans3-Bold.ttf'].map(fontPath)

// The same files, parsed for their advance widths, so the composer can measure
// a line instead of guessing at it. See font-metrics.js for why a character
// count could never do this job: these cards used to wrap against a constant
// 0.62em, which was calibrated while resvg was rendering every glyph at the
// same width, and Source Sans Bold actually runs ~0.49em over mixed-case
// English with a 3× spread between its narrowest and widest letters.
const BOLD = () => loadFont(fontPath('SourceSans3-Bold.ttf'))
const REGULAR = () => loadFont(fontPath('SourceSans3-Regular.ttf'))

// Feed post (4:5) is the canonical size; the Story variant reuses the same
// composer with a taller canvas so it fills a 9:16 screen natively.
export const IG_FEED = { width: 1080, height: 1350 }
export const IG_STORY = { width: 1080, height: 1920 }

// Was 72. The column is a touch wider now, which buys back a word or two per
// line and lets the fitter settle on a larger size — the two changes work
// together and neither is worth much alone.
const PAD = 60

const JPEG_QUALITY = 92

/**
 * The type ramps the fitter chooses from.
 *
 * `max` is what the card uses when the text is short, and it is well above the
 * old fixed sizes because measuring instead of guessing freed the room. `min`
 * is the floor that makes "never truncated" a promise rather than a hope: the
 * fitter walks down from max and takes the first size that fits, and if even
 * the floor overflows it still renders every word rather than clipping. The
 * floors are set low enough that nothing in the corpus reaches them — a test
 * asserts that, and asserts no card lands on one.
 */
const HEAD_RAMP = { min: 58, max: 108, step: 2, lineHeightRatio: 1.1, letterSpacingEm: -0.01 }
const DEK_RAMP = { min: 32, max: 58, step: 2, lineHeightRatio: 1.42 }

/**
 * Below this the dek stops being a dek and starts being fine print. When a long
 * lead pushes it under, the headline gives size back rather than the dek taking
 * the whole loss — see `fitPair`.
 */
const DEK_COMFORT = 40

/**
 * Fit the headline and the dek together, because they are competing for one box.
 *
 * Fitting them in sequence — headline takes its maximum, dek gets the remainder
 * — is what a greedy layout does, and on the 14 longest leads in the corpus it
 * drove the dek to its 32px floor while the headline sat at 108. That trades a
 * readable second block for a headline nobody needed at full size, which is the
 * wrong way round: the headline is short, bold and already dominant at 90px.
 *
 * So the headline is stepped down while the dek is under `DEK_COMFORT` and
 * giving it room actually helps. Neither block is ever truncated at any point
 * in this loop; the only thing being traded is size.
 */
const fitPair = (headline, summary, { maxWidth, box }) => {
  let best = null
  for (let headMaxTry = HEAD_RAMP.max; headMaxTry >= HEAD_RAMP.min; headMaxTry -= HEAD_RAMP.step) {
    const head = fitText(BOLD(), headline, {
      ...HEAD_RAMP,
      max: headMaxTry,
      maxWidth,
      maxLines: 4,
      maxHeight: Math.round(box * 0.58),
    })
    const headBlock = head.lines.length * head.lineHeight
    const gap = Math.round(head.fontSize * 0.55)
    const dek = fitText(REGULAR(), summary, {
      ...DEK_RAMP,
      maxWidth,
      maxLines: 8,
      maxHeight: Math.max(DEK_RAMP.min * 2, box - headBlock - gap),
    })
    if (!best) best = { head, dek, gap }
    // Keep whichever pass reads best: the dek at comfort wins, and past that a
    // larger dek only wins if the headline has not fallen further than the dek
    // gained. Without that second clause a 300-character lead would walk the
    // headline all the way to its floor for two points of dek.
    if (dek.fontSize > best.dek.fontSize && head.fontSize >= best.head.fontSize - (dek.fontSize - best.dek.fontSize) * 2) {
      best = { head, dek, gap }
    }
    if (best.dek.fontSize >= DEK_COMFORT) break
  }
  return best
}

/**
 * Compose the Instagram card SVG: kicker, headline, a story dek (summary text
 * rendered ON the card), a delicate full-bleed globe, and location + wordmark.
 * @param {Object} article - { headline, summary, category, date, location, lat, lng }
 *   headline is the article title; summary is the lead/first sentences of the story.
 * @param {Object} [size=IG_FEED] - { width, height }
 */
export const buildIgSvg = (article, size = IG_FEED) => {
  const { width: W, height: H } = size
  const theme = themeFor('dark')

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
    ocean: IG_DARK_OCEAN,
    land: '#3d3d3d',
    // Country borders: each country is its own stroked path, so this draws the
    // dividing lines between nations. Kept delicate but with enough contrast
    // over the land fill to read clearly on the card.
    landStroke: '#6b6b6b',
    landStrokeWidth: 0.8,
    rim: null, // full-width bleed in the lower half — grounded, no bounding disc
    showCross: true,
  })
  const globeLayer = globe ? `<g opacity="0.98">${globe}</g>` : ''

  const kicker = `${(article.category || 'news').toUpperCase()}  ·  ${formatLongDate(article.date)}`
  const location = article.location ? String(article.location).toUpperCase() : null

  // The box the type gets. Its foot is where the scrim starts handing the card
  // back to the globe, so the fitter is working against the composition rather
  // than against an arbitrary line count.
  const textTop = Math.round(H * 0.135)
  const textBottom = Math.round(H * 0.62)
  const textBox = textBottom - textTop

  // Headline, measured rather than counted. It takes at most ~58% of the box
  // before the dek is fitted into what is left, so a long headline shrinks the
  // dek instead of pushing it into the globe.
  const headline = article.headline || article.title || 'Breaking News'
  const summary = String(article.summary || '').trim()
  // Brighter than the dim label grey so the dek stays legible over the globe on
  // the dark card; weight (400 vs the 700 headline) still carries the hierarchy.
  const dekColor = '#cfcfcf'
  const { head, dek, gap } = fitPair(headline, summary, { maxWidth: inner, box: textBox })

  const titleFontSize = head.fontSize
  const titleLineHeight = head.lineHeight
  const titleLines = head.lines
  const titleStartY = textTop + titleFontSize
  const dekFontSize = dek.fontSize
  const dekLineHeight = dek.lineHeight
  const dekLines = dek.lines
  const dekStartY = titleStartY + (titleLines.length - 1) * titleLineHeight + gap + dekFontSize

  // Soft shadow behind the type so it stays crisp where it crosses the globe.
  const shadowColor = '#000000'

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
const rasterizeIgJpeg = (svgString, size = IG_FEED) => {
  const resvg = new Resvg(svgString, {
    font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: 'Source Sans 3' },
    fitTo: { mode: 'width', value: size.width },
    background: themeFor('dark').bg, // opaque — JPEG has no alpha channel
  })
  const rendered = resvg.render()
  const { data } = jpeg.encode({ data: rendered.pixels, width: rendered.width, height: rendered.height }, JPEG_QUALITY)
  return data
}

/** Convenience: build + rasterize in one call. Returns a JPEG Buffer. */
/** @param {any} article @param {{width:number,height:number}} [size] */
export const buildIgJpeg = (article, size = IG_FEED) => rasterizeIgJpeg(buildIgSvg(article, size), size)
