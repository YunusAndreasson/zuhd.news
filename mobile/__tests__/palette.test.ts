import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DARK_COLORS, LIGHT_COLORS } from '../constants/theme';

// WCAG 2 relative luminance and contrast, on opaque hex only.
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const channel = (i: number) => {
    const c = Number.parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const THEMES = { dark: DARK_COLORS, light: LIGHT_COLORS } as const;

describe.each(Object.entries(THEMES))('%s palette', (_, colors) => {
  const tones = [colors.toneFavorableText, colors.toneUnfavorableText, colors.toneNeutralText];

  it('sets every text ink at AA body on the ground and on the sheet', () => {
    for (const ink of [colors.text, colors.textSecondary, colors.accent, ...tones]) {
      expect(contrast(ink, colors.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(ink, colors.sheetBg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  // A category's name is the card's kicker, 11pt caps.
  it('sets every category name at AA on the sheet', () => {
    for (const ink of [
      colors.categoryTextPolitics,
      colors.categoryTextEconomy,
      colors.categoryTextScience,
      colors.categoryTextTech,
      colors.categoryTextOther,
    ]) {
      expect(contrast(ink, colors.sheetBg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(ink, colors.bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  // Rose sat at 5.5:1 beside sage's 7.3:1 in the dark theme, so every fall
  // read as the quieter figure — on the strip, the cards and the globe.
  it('gives favorable, unfavorable and neutral one weight', () => {
    const ratios = tones.map((t) => contrast(t, colors.bg));
    expect(Math.max(...ratios) - Math.min(...ratios)).toBeLessThan(1);
  });

  // An exchange's arrow and its gauge's move are one green and one red.
  it('draws market arrows in the tone inks', () => {
    expect(colors.markMarketUp).toBe(colors.toneFavorableText);
    expect(colors.markMarketDown).toBe(colors.toneUnfavorableText);
  });

  // `accent` is the second voice between the text and the quiet line. In
  // light it sat at 6.2:1 beside secondary's 5.1, one grey on cream, while
  // the dark theme kept a clear step either side of it.
  it('keeps accent a real step from both inks it sits between', () => {
    const text = contrast(colors.text, colors.bg);
    const accent = contrast(colors.accent, colors.bg);
    const secondary = contrast(colors.textSecondary, colors.bg);
    expect(text / accent).toBeGreaterThanOrEqual(1.3);
    expect(accent / secondary).toBeGreaterThanOrEqual(1.3);
  });

  // The sheet's handle, the toggles' off track and every row rule. Light's
  // was 1.19:1 on the sheet, half the dark hairline's weight.
  it('draws a hairline the sheet can show', () => {
    expect(contrast(colors.rule, colors.sheetBg)).toBeGreaterThanOrEqual(1.3);
  });

  // A conflict stack's count is 11pt numerals on a ground-coloured halo.
  // `SegmentedControl` and `Toggle`: words in text ink on the `rule` track,
  // and the chosen one in `bg` ink on a `text` fill. The track must also show
  // on the sheet, or the control reads as loose words again.
  it('sets a segmented control’s words at AA on its track and its fill', () => {
    expect(contrast(colors.text, colors.rule)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.bg, colors.text)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.rule, colors.sheetBg)).toBeGreaterThanOrEqual(1.3);
  });

  it('sets the conflict count at AA on the ground', () => {
    expect(contrast(colors.markConflictText, colors.bg)).toBeGreaterThanOrEqual(4.5);
  });

  // The web's near-white ring on a light sheet measured 1.04:1: the map key
  // drew nothing, and the globe's ring vanished. A graphic that carries
  // meaning clears 3:1 (WCAG 2.2 SC 1.4.11).
  it('draws the contested ring where the ground can show it', () => {
    expect(contrast(colors.markContested, colors.bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(colors.markContested, colors.sheetBg)).toBeGreaterThanOrEqual(3);
  });
});

// The globe's marks are the web map's, verbatim — "a phone map that disagrees
// with the website about what a mark is reads as two different maps". Nothing
// checked that the copies agreed. Straits and market arrows are left out on
// purpose: the app draws a strait at rest in its own slate and the arrows in
// the tone inks (above), and the contested ring has a light value of its own.
describe('globe marks match the web map', () => {
  const web = readFileSync(resolve(__dirname, '../../public/islands/_map/style.ts'), 'utf8');
  const webValue = (key: string): string | undefined => {
    const found = [
      ...web.matchAll(
        new RegExp(`^\\s*(?:export const )?${key}(?: =|:) '(#[0-9a-fA-F]{3,6})'`, 'gm'),
      ),
    ];
    return found.length === 1 ? found[0]?.[1]?.toLowerCase() : undefined;
  };
  const SHARED: Record<string, string> = {
    markPolitics: 'politics',
    markEconomy: 'economy',
    markScience: 'science',
    markTech: 'tech',
    markOther: 'FALLBACK_CATEGORY_COLOUR',
    markGdacs: 'gdacs',
    markThermal: 'thermal',
    markFamine: 'famine',
    markConflict: 'conflict',
    markGenocide: 'genocide',
    markGenocideCore: 'genocideCore',
  };

  it.each(Object.entries(SHARED))('%s is the web’s %s in both themes', (token, key) => {
    const value = webValue(key);
    expect(value).toBeDefined();
    expect(DARK_COLORS[token as keyof typeof DARK_COLORS].toLowerCase()).toBe(value);
    expect(LIGHT_COLORS[token as keyof typeof LIGHT_COLORS].toLowerCase()).toBe(value);
  });

  it('markContested is the web’s contested on the dark globe', () => {
    expect(DARK_COLORS.markContested.toLowerCase()).toBe(webValue('contested'));
  });
});
