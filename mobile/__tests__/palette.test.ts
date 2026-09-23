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
});
