import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DARK_COLORS,
  emboldened,
  FONT_SOURCE,
  FONT_SOURCE_BOLD,
  FONT_SYSTEM,
  makeTextVariants,
  makeTypography,
} from '../constants/theme';

// iOS's Bold Text makes the system face heavier by itself; Source Sans, drawn
// from its own files, has to be handed the next file up.

/** A Source Sans face's weight, by its file: what "heavier" means here. */
const WEIGHT: Record<string, number> = {
  'SourceSans3-Regular': 400,
  'SourceSans3-Italic': 400,
  'SourceSans3-SemiBold': 600,
  'SourceSans3SC-SemiBold': 600,
  'SourceSans3-Bold': 700,
  'SourceSans3-BoldItalic': 700,
};

it('steps each Source Sans face to the next file up', () => {
  expect(FONT_SOURCE_BOLD.regular.fontFamily).toBe('SourceSans3-SemiBold');
  expect(FONT_SOURCE_BOLD.semiBold.fontFamily).toBe('SourceSans3-Bold');
  expect(FONT_SOURCE_BOLD.italic.fontFamily).toBe('SourceSans3-BoldItalic');
  // Nothing heavier is shipped for these.
  expect(FONT_SOURCE_BOLD.bold).toEqual(FONT_SOURCE.bold);
  expect(FONT_SOURCE_BOLD.boldItalic).toEqual(FONT_SOURCE.boldItalic);
  expect(FONT_SOURCE_BOLD.smallCaps).toEqual(FONT_SOURCE.smallCaps);
});

it('never makes a face lighter', () => {
  for (const key of Object.keys(FONT_SOURCE) as (keyof typeof FONT_SOURCE)[]) {
    const plain = WEIGHT[FONT_SOURCE[key].fontFamily ?? ''] ?? 0;
    const bold = WEIGHT[FONT_SOURCE_BOLD[key].fontFamily ?? ''] ?? 0;
    expect(bold).toBeGreaterThanOrEqual(plain);
  }
});

it('leaves the system face to the system, as the same set', () => {
  expect(emboldened(FONT_SYSTEM)).toBe(FONT_SYSTEM);
});

it('names only faces the app ships and registers', () => {
  const ios = readFileSync(join(__dirname, '../constants/fonts.ios.ts'), 'utf8');
  for (const face of Object.values(FONT_SOURCE_BOLD)) {
    const family = face.fontFamily ?? '';
    expect(existsSync(join(__dirname, `../assets/fonts/${family}.ttf`))).toBe(true);
    expect(ios).toContain(`'${family}':`);
  }
});

it('sets body text semibold and a title bold under the setting', () => {
  const variants = makeTextVariants(DARK_COLORS, FONT_SOURCE_BOLD, makeTypography(1));
  expect(variants.body.fontFamily).toBe('SourceSans3-SemiBold');
  expect(variants.title.fontFamily).toBe('SourceSans3-Bold');
});
