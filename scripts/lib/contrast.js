// WCAG contrast, written once.
//
// Two test files assert this site's whole colour argument and between them they
// carried **six** copies of the arithmetic: `colour-system.test.js` had
// `channels`/`luminance`/`contrast` at module scope, and `map-geo.test.js` had
// `srgbLuminance` at module scope plus `contrast` re-declared inside three
// separate tests and `rgb`/`lum`/`contrast`/`over` re-declared inside two more.
//
// They had already drifted, in the one place it matters:
//
//   · the module-level `srgbLuminance` linearised at **0.04045**
//   · every other copy linearised at **0.03928**
//
// Both numbers are real. 0.04045 is the sRGB specification's own breakpoint;
// 0.03928 is the number WCAG 2.x actually prints in its definition of relative
// luminance, and it is kept there deliberately. Since everything measured with
// this claims a WCAG ratio — "AA for body text", "the 3:1 of SC 1.4.11" — the
// number it must use is WCAG's. The difference is under 0.0002 in luminance and
// changed no assertion in either suite; the point is not the value, it is that
// a repo cannot hold two definitions of the constant its accessibility claims
// rest on and know which one it means.
//
// Not a `.test.js` file, so `node --test scripts/lib/*.test.js` does not run it.

/** WCAG 2.1 AA for body text. */
export const AA = 4.5

/** WCAG 2.2 SC 1.4.11, non-text contrast — what a focus ring or a mark owes. */
export const NON_TEXT = 3

/**
 * `#rgb` or `#rrggbb` → `[r, g, b]`, 0–255.
 *
 * The shorthand matters: one of the copies this replaces sliced at fixed
 * offsets 1/3/5, which is right for six digits and silently returns `NaN`s for
 * three, and `NaN` propagates to a ratio of 1 — a contrast assertion that fails
 * for the wrong reason, or passes because it was comparing a colour with itself.
 */
export const channels = (hex) => {
  let h = String(hex).replace('#', '')
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16))
}

const linear = (v) => {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/**
 * Relative luminance of an `[r, g, b]` triple, 0–255 per channel.
 *
 * @param {number[]} c
 */
export const luminanceOf = (c) => 0.2126 * linear(c[0]) + 0.7152 * linear(c[1]) + 0.0722 * linear(c[2])

/** Relative luminance of a hex colour. */
export const luminance = (hex) => luminanceOf(channels(hex))

/**
 * The contrast ratio between two colours, 1:1 to 21:1.
 *
 * Takes hex strings or `[r, g, b]` triples in either position, because half the
 * assertions here are about published tokens and the other half are about
 * composites — a translucent wash over a variable ground has no hex of its own.
 */
export const contrast = (a, b) => {
  const lum = (c) => (Array.isArray(c) ? luminanceOf(c) : luminance(c))
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * `fg` at `alpha` composited over `bg`, both `[r, g, b]` triples.
 *
 * This is what the reader sees where the density wash lies over the land ramp,
 * and it is the reason `contrast` has to accept triples: there is no token for
 * the result.
 */
export const composite = (fg, alpha, bg) => fg.map((v, i) => v * alpha + bg[i] * (1 - alpha))

/**
 * A hex colour as `{ h, s, l }` — hue in degrees, saturation and lightness 0–1.
 *
 * Not part of any contrast ratio, and here anyway because this is the module
 * that owns colour arithmetic for the tests. `map-geo.test.js` carried two
 * copies of it, one written as if/else and one as a nested ternary, both
 * asserting the map's hue-separation rules: that the genocide mark is red and
 * at least 20 saturation points clear of every other overlay, and that the
 * thermal tone shares the disaster hue while stepping away in lightness. Two
 * transcriptions of one formula, certifying the palette.
 */
export const hsl = (hex) => {
  const [r, g, b] = channels(hex).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (!d) return { h: 0, s: 0, l }
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h =
    max === r
      ? ((g - b) / d + (g < b ? 6 : 0)) * 60
      : max === g
        ? ((b - r) / d + 2) * 60
        : ((r - g) / d + 4) * 60
  return { h, s, l }
}
