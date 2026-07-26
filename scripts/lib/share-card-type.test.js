// The share cards' typography: nothing is ever cut, and every line fits.
//
// This is the one property of these cards that cannot be checked by looking at
// them. A card whose dek ends "…and the ministry said the" renders perfectly —
// correct type, correct colour, correct position — and is simply missing the
// end of the sentence. Before the fitter, 20.5% of cards in this corpus had
// their dek truncated that way and 1.4% had the lead pre-cut before the card
// even saw it. Nothing in the pipeline noticed, because there was nothing to
// notice with.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseFrontmatter } from './frontmatter.js'
import { fitText, loadFont, measureText, wrapToWidth } from './font-metrics.js'
import { buildIgSvg, IG_FEED, IG_STORY, IG_X } from './ig-image.js'

const fontPath = (f) => fileURLToPath(new URL(`../assets/fonts/${f}`, import.meta.url))
const BOLD = loadFont(fontPath('SourceSans3-Bold.ttf'))
const REGULAR = loadFont(fontPath('SourceSans3-Regular.ttf'))

// --- the metrics themselves ------------------------------------------------

test('advances are proportional, which is the whole reason this exists', () => {
  // The constant these cards used to wrap against — 0.62em, uniform — was
  // calibrated while resvg was rendering every glyph at the same width
  // (`fontBuffers`, a known metrics bug). Real Source Sans Bold runs ~0.49em
  // over mixed-case English, and no single constant can serve both ends of it.
  const wide = measureText(BOLD, 'WWWWWWWWWW', 100) / 100 / 10
  const narrow = measureText(BOLD, 'iiiiiiiiii', 100) / 100 / 10
  assert.ok(wide > 0.75, `W should be wide, got ${wide}`)
  assert.ok(narrow < 0.35, `i should be narrow, got ${narrow}`)
  assert.ok(wide / narrow > 2.5, 'a character count cannot stand in for this')

  // Punctuation the cards actually emit has to resolve, or a headline with an
  // em dash measures short and overflows.
  for (const ch of ['…', '—', '’', '“', '·', '&']) {
    assert.ok(measureText(BOLD, ch, 100) > 0, `${ch} has no advance`)
  }
})

test('wrapping loses no words, ever', () => {
  const text =
    'Kashmir University Drops Jinnah And Muslim Thinkers From Political Science Syllabus Entirely'
  for (const size of [40, 72, 108]) {
    const lines = wrapToWidth(BOLD, text, 600, size)
    assert.equal(lines.join(' '), text, `words lost at ${size}px`)
  }
  // A single word wider than the column is emitted whole on its own line
  // rather than broken or clipped — the fitter resolves it by choosing a
  // smaller size, and a mid-syllable break would read as a rendering fault.
  const long = wrapToWidth(BOLD, 'Antidisestablishmentarianism', 100, 80)
  assert.deepEqual(long, ['Antidisestablishmentarianism'])
})

test('fitText returns every word even when nothing fits', () => {
  const huge = 'word '.repeat(400).trim()
  const fit = fitText(REGULAR, huge, { maxWidth: 400, maxLines: 3, min: 20, max: 40 })
  assert.equal(fit.lines.join(' '), huge, 'text was dropped when it could not fit')
  assert.equal(fit.fontSize, 20, 'and it fell back to the floor rather than clipping')
})

// --- the cards -------------------------------------------------------------

/** Every string the card actually paints, from its own SVG. */
const textNodes = (svg) => [...svg.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => m[1])

/**
 * Each `<text>` element as { attrs, text }.
 *
 * Attributes are parsed into a map rather than matched in order. An ordered
 * regex silently returned no letter-spacing here — the attribute sits after
 * `fill`, and the optional group never reached it — which made every headline
 * measure ~2% wide and reported fifty overflows that do not exist. The card was
 * right and the ruler was wrong, which is the failure mode this whole file is
 * meant to catch, so the ruler does not get to be sloppy.
 */
const textElements = (svg) =>
  [...svg.matchAll(/<text\s([^>]*)>([\s\S]*?)<\/text>/g)].map((m) => {
    const attrs = Object.fromEntries(
      [...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]),
    )
    const text = m[2]
      .replace(/<[^>]+>/g, '')
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
    return { attrs, text }
  })

/**
 * The corpus's hardest cases, which is where a fit fails if it fails at all.
 * The full sweep is 13,970 cards and takes ~40s; this is the tail that matters,
 * and it runs in about a second.
 */
const hardCases = () => {
  const dir = 'content/articles/'
  const rows = readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const { meta, body } = parseFrontmatter(readFileSync(dir + f, 'utf8'))
      const summary = String(body || '')
        .trim()
        .split(/\n\n+/)
        .slice(0, 2)
        .join(' ')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim()
      const headline = meta.socialTitle || meta.title || ''
      return { headline, summary, category: meta.category, date: meta.date, location: meta.location }
    })
  const byLead = [...rows].sort((a, b) => b.summary.length - a.summary.length).slice(0, 80)
  const byHead = [...rows].sort((a, b) => b.headline.length - a.headline.length).slice(0, 80)
  return [...new Set([...byLead, ...byHead])]
}

test('no share card ever renders an ellipsis in its type', () => {
  // The requirement, stated directly. An ellipsis reaching the card means
  // something was cut — either by the wrap or by the lead extractor upstream.
  const offenders = []
  for (const article of hardCases()) {
    for (const [name, size] of [['feed', IG_FEED], ['story', IG_STORY], ['x', IG_X]]) {
      // lat/lng omitted: the globe is geometry, not type, and building it for
      // every case would make this suite take minutes.
      const svg = buildIgSvg({ ...article, lat: null, lng: null }, size)
      for (const t of textNodes(svg)) {
        if (t.includes('…')) offenders.push(`${name}: ${article.headline.slice(0, 40)} — ${t.slice(0, 60)}`)
      }
    }
  }
  assert.deepEqual(offenders, [], `truncated cards:\n  ${offenders.slice(0, 10).join('\n  ')}`)
})

test('every headline and dek line fits inside its column', () => {
  // The other half of the promise. Never truncating is worthless if the fix is
  // text running off the edge of the card instead — that is the failure the old
  // conservative constant was buying protection against, and measuring has to
  // buy it back. Widths are checked against what resvg will actually draw,
  // including the headline's negative letter-spacing.
  const inner = IG_FEED.width - 60 * 2
  const overflows = []
  let checked = 0
  for (const article of hardCases()) {
    const svg = buildIgSvg({ ...article, lat: null, lng: null }, IG_FEED)
    for (const { attrs, text } of textElements(svg)) {
      const size = Number(attrs['font-size'])
      const weight = Number(attrs['font-weight'])
      // Headline and dek only; the kicker, location and wordmark are fixed
      // strings at fixed sizes and are not what the fitter is responsible for.
      if (attrs.x !== '60' || (weight !== 700 && weight !== 400) || size < 32) continue
      const ls = /^(-?[\d.]+)em$/.exec(attrs['letter-spacing'] || '')
      const spacing = ls ? Number(ls[1]) * size : 0
      const w = measureText(weight === 700 ? BOLD : REGULAR, text, size, spacing)
      checked++
      if (w > inner) overflows.push(`${Math.round(w)}px > ${inner}px @${size}px: ${text.slice(0, 50)}`)
    }
  }
  assert.ok(checked > 200, `only ${checked} lines measured — the selector stopped matching`)
  assert.deepEqual(overflows, [], `lines running past the column:\n  ${overflows.slice(0, 10).join('\n  ')}`)
})

test('the type is larger than the fixed sizes it replaced', () => {
  // The cards used a fixed 82/94px headline and a fixed 46px dek. Measuring
  // instead of guessing freed enough room that a typical card now sets the
  // headline at the top of its ramp — which was the point of widening the
  // column and raising the ceiling together.
  const svg = buildIgSvg(
    {
      headline: 'Iran Confirms IRGC Navy Commander Death',
      summary: 'The strike killed the commander and two aides, state media said.',
      category: 'politics',
      date: '2026-07-26T05:00:00Z',
      location: 'Tehran',
      lat: null,
      lng: null,
    },
    IG_FEED,
  )
  const head = Number(/font-size="(\d+)" font-weight="700" fill/.exec(svg)[1])
  const dek = Number(/font-size="(\d+)" font-weight="400"/.exec(svg)[1])
  assert.ok(head >= 94, `headline should clear the old 94px ceiling, got ${head}`)
  assert.ok(dek >= 46, `dek should clear the old fixed 46px, got ${dek}`)
})
