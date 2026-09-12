import { Skia, type SkPath } from '@shopify/react-native-skia';
import { GLYPH_HALF } from './disaster-glyphs';

/**
 * The famine and thermal glyphs, ported from the web map's alphabet
 * (`public/islands/_map/glyphs.ts`) — which is where the argument for each
 * silhouette lives. The web authors on a 16-unit box; the app's glyph family
 * is 22 (`disaster-glyphs.ts`), so every coordinate is scaled by `K` and the
 * shapes stay exactly the web's.
 *
 * Genocide is not here: it is three concentric circles in two colours, which
 * the globe draws directly, and there are two of them.
 */

type Builder = ReturnType<typeof Skia.PathBuilder.Make>;

const K = (GLYPH_HALF * 2) / 16;

/** The web's outline width for the famine frame, scaled. */
export const FAMINE_FRAME_STROKE = 1.3 * K;
/** The web's ray width for the thermal burst, scaled. */
export const THERMAL_RAY_STROKE = 1.6 * K;

function quad(b: Builder, x0: number, y0: number, x1: number, y1: number): Builder {
  return b
    .moveTo(x0 * K, y0 * K)
    .lineTo(x1 * K, y0 * K)
    .lineTo(x1 * K, y1 * K)
    .lineTo(x0 * K, y1 * K)
    .close();
}

/**
 * An IPC phase: a column filled from the bottom. The frame is what makes it a
 * level rather than a size — one-of-three, two-of-three, three-of-three.
 */
export const FAMINE_FRAME_PATH: SkPath = quad(Skia.PathBuilder.Make(), 3, 1, 13, 15).detach();

const IPC_BLOCKS = 3;

function famineBlocksPath(filled: number): SkPath {
  const b = Skia.PathBuilder.Make();
  for (let level = 0; level < filled; level++) {
    const bottom = 14.3 - level * 4.4;
    quad(b, 4.6, bottom - 3.2, 11.4, bottom);
  }
  return b.detach();
}

const FAMINE_BLOCKS: readonly SkPath[] = Array.from({ length: IPC_BLOCKS + 1 }, (_, n) =>
  famineBlocksPath(n),
);

/** The filled blocks for a column — see `famineBlocks` in `lib/overlays.ts`. */
export function getFamineBlocksPath(blocks: number): SkPath {
  return FAMINE_BLOCKS[Math.max(0, Math.min(IPC_BLOCKS, blocks))] as SkPath;
}

/** A thermal anomaly's core. */
export const THERMAL_CORE_PATH: SkPath = Skia.PathBuilder.Make()
  .addCircle(8 * K, 8 * K, 2.6 * K)
  .detach();

/**
 * Heat coming off it: four diagonal rays that stop short of the box edge.
 * Diagonal, because on the axes a burst reads as a plus sign.
 */
export const THERMAL_RAYS_PATH: SkPath = (() => {
  const b = Skia.PathBuilder.Make();
  const k = Math.SQRT1_2;
  for (const [sx, sy] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const) {
    b.moveTo((8 + sx * 5.0 * k) * K, (8 + sy * 5.0 * k) * K);
    b.lineTo((8 + sx * 7.4 * k) * K, (8 + sy * 7.4 * k) * K);
  }
  return b.detach();
})();
