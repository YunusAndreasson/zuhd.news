#!/usr/bin/env node
// Generate the app's icon set from a single glyph of SourceSans3-Regular.
// The "logo" is the letter Z rendered directly from the typography — no
// second asset, no drift. Re-run whenever the theme colors or weight change.
//
// Outputs (overwritten):
//   assets/icon.png                     — iOS launcher + briefing lock screen
//   assets/splash-icon.png              — splash screen
//   assets/android-icon-foreground.png  — adaptive icon foreground (transparent bg)
//   assets/android-icon-background.png  — adaptive icon background (solid)
//   assets/android-icon-monochrome.png  — themed icon (white on transparent)
//   assets/favicon.png                  — web favicon

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FONT = resolve(root, 'assets/fonts/SourceSans3-Regular.ttf');
const ASSETS = resolve(root, 'assets');

// Keep the icon palette in lock-step with DARK_COLORS in constants/theme.ts.
const BG = '#141414';
const FG = '#e8e8e8';

// Fill ratios — fraction of canvas height occupied by the Z glyph's cap box.
// The adaptive foreground uses a smaller ratio because Android crops ~1/3 of
// each edge when shaping into circles / squircles / rounded squares.
const SQUARE_FILL = 0.6;
const ADAPTIVE_FILL = 0.4;

// opentype loads a Buffer; older APIs used loadSync but it's deprecated.
const font = opentype.parse(readFileSync(FONT).buffer);

/**
 * Build an SVG of the letter Z centered on a canvas, sized to a target height
 * ratio. Returns the SVG string (sharp consumes this directly).
 *
 * We render the glyph at a probe size, measure its actual bounding box, then
 * scale — this produces precise optical sizing regardless of font metrics.
 */
function renderZSvg({ size, fillRatio, bg, fg }) {
  const PROBE = 1000;
  const probe = font.getPath('Z', 0, 0, PROBE);
  const pbb = probe.getBoundingBox();
  const probeH = pbb.y2 - pbb.y1;

  const fontSize = PROBE * ((size * fillRatio) / probeH);
  const path = font.getPath('Z', 0, 0, fontSize);
  const bb = path.getBoundingBox();
  const glyphW = bb.x2 - bb.x1;
  const glyphH = bb.y2 - bb.y1;

  const tx = size / 2 - glyphW / 2 - bb.x1;
  const ty = size / 2 - glyphH / 2 - bb.y1;

  const bgRect = bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${bgRect}
    <g transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)})">
      <path d="${path.toPathData(3)}" fill="${fg}"/>
    </g>
  </svg>`;
}

async function write(svg, filename) {
  const out = resolve(ASSETS, filename);
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(out);
  console.log(`  ${filename}`);
}

console.log('generating icons from SourceSans3-Regular.ttf → Z glyph');

// iOS launcher + splash + briefing lock screen
const square = renderZSvg({ size: 1024, fillRatio: SQUARE_FILL, bg: BG, fg: FG });
await write(square, 'icon.png');
await write(square, 'splash-icon.png');

// Android adaptive — foreground (transparent bg), background (solid), monochrome (white)
const adaptiveFg = renderZSvg({ size: 1024, fillRatio: ADAPTIVE_FILL, fg: FG });
await write(adaptiveFg, 'android-icon-foreground.png');

const adaptiveBg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${BG}"/></svg>`;
await write(adaptiveBg, 'android-icon-background.png');

const monochrome = renderZSvg({ size: 1024, fillRatio: ADAPTIVE_FILL, fg: '#ffffff' });
await write(monochrome, 'android-icon-monochrome.png');

// Web favicon
const favicon = renderZSvg({ size: 64, fillRatio: SQUARE_FILL, bg: BG, fg: FG });
await write(favicon, 'favicon.png');

console.log('done.');
