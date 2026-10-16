import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadSync } from 'opentype.js';
import { ICONS } from '../components/primitives/icons';

describe('the icons', () => {
  // Android draws an icon as a codepoint of the Material Symbols font that the
  // expo-font plugin embeds. A wrong number draws another symbol, or none.
  it('draw each Android glyph from its named symbol in the embedded font', () => {
    const app = JSON.parse(readFileSync(join(__dirname, '../app.json'), 'utf8'));
    const [, options] = app.expo.plugins.find(
      (p: unknown) => Array.isArray(p) && p[0] === 'expo-font',
    );
    const path = options.android.fonts.find((f: string) => f.includes('MaterialSymbols'));
    const font = loadSync(join(__dirname, '..', path));
    for (const [name, icon] of Object.entries(ICONS)) {
      expect([name, font.charToGlyph(String.fromCharCode(icon.glyph)).name]).toEqual([
        name,
        icon.android,
      ]);
    }
  });
});
