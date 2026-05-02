import type { ConflictEventFamily, GdacsEventType as EventType } from '@shared/types';
import { Skia } from '@shopify/react-native-skia';

/** Glyph paths for GDACS event types. Each path is centered at (0,0) inside
 *  a 22×22 unit box so MiniGlobe can translate by `(x - GLYPH_HALF, y - GLYPH_HALF)`
 *  to position. Stored as singleton SkPaths — Skia paths are immutable for
 *  drawing, so reuse is safe across frames and threads. */

export const GLYPH_SIZE = 22;
export const GLYPH_HALF = GLYPH_SIZE / 2;

type SkPath = ReturnType<typeof Skia.Path.Make>;

function earthquakePath(): SkPath {
  // Three concentric circles + epicenter dot — the seismograph signature.
  // Adding the small filled center grounds the glyph at small render sizes
  // where bare rings can read as a generic target. Stroke-only on rings;
  // the center dot is drawn via a tiny filled circle — Skia paths can mix
  // both when the renderer uses style="stroke", since `addCircle` with a
  // very small radius produces a near-filled mark under stroke too thin
  // to matter. Kept simple here as three rings only — center accent is
  // restored by the marker's backdrop disc, not the path.
  const p = Skia.Path.Make();
  for (const r of [2.5, 5, 8]) {
    p.addCircle(GLYPH_HALF, GLYPH_HALF, r);
  }
  return p;
}

function cyclonePath(): SkPath {
  // Two rotationally-symmetric spiral arms + central eye. Each arm is one
  // cubic that sweeps from the outer rim toward the eye, mirrored 180°.
  // Reads cleanly as TC at 22px without trying to be a full logarithmic
  // spiral — point-symmetric layout matches the universal cyclone pictogram.
  const p = Skia.Path.Make();
  const cx = GLYPH_HALF;
  const cy = GLYPH_HALF;
  // Outer arm — sweeps clockwise from east into the eye
  p.moveTo(cx + 9, cy);
  p.cubicTo(cx + 9, cy + 5, cx + 4, cy + 8, cx, cy + 6);
  p.cubicTo(cx - 3, cy + 4.5, cx - 1.5, cy + 1.5, cx + 1.5, cy + 0.5);
  // Mirror arm — sweeps counter-clockwise from west
  p.moveTo(cx - 9, cy);
  p.cubicTo(cx - 9, cy - 5, cx - 4, cy - 8, cx, cy - 6);
  p.cubicTo(cx + 3, cy - 4.5, cx + 1.5, cy - 1.5, cx - 1.5, cy - 0.5);
  // Eye
  p.addCircle(cx, cy, 1.4);
  return p;
}

function floodPath(): SkPath {
  // Two stacked sine waves — the universal flood pictogram.
  const p = Skia.Path.Make();
  const cy = GLYPH_HALF;
  for (const yOff of [-3, 1.5]) {
    p.moveTo(GLYPH_HALF - 8, cy + yOff);
    p.cubicTo(GLYPH_HALF - 4, cy + yOff - 3, GLYPH_HALF, cy + yOff + 3, GLYPH_HALF + 4, cy + yOff);
    p.cubicTo(
      GLYPH_HALF + 6,
      cy + yOff - 1.5,
      GLYPH_HALF + 7,
      cy + yOff - 1,
      GLYPH_HALF + 8,
      cy + yOff,
    );
  }
  return p;
}

function volcanoPath(): SkPath {
  // Trapezoidal cone with a small lava plume above.
  const p = Skia.Path.Make();
  const cx = GLYPH_HALF;
  const cy = GLYPH_HALF;
  // Cone outline
  p.moveTo(cx - 7, cy + 5);
  p.lineTo(cx - 2, cy - 2);
  p.lineTo(cx + 2, cy - 2);
  p.lineTo(cx + 7, cy + 5);
  p.close();
  // Plume — three short verticals above the caldera
  p.moveTo(cx - 1.5, cy - 4);
  p.lineTo(cx - 1.5, cy - 7);
  p.moveTo(cx, cy - 3.5);
  p.lineTo(cx, cy - 8);
  p.moveTo(cx + 1.5, cy - 4);
  p.lineTo(cx + 1.5, cy - 7);
  return p;
}

function droughtPath(): SkPath {
  // Sun with rays — heat / aridity. Center disc + 8 short rays.
  const p = Skia.Path.Make();
  const cx = GLYPH_HALF;
  const cy = GLYPH_HALF;
  p.addCircle(cx, cy, 2.5);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const inner = 4.5;
    const outer = 8;
    p.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    p.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
  }
  return p;
}

function wildfirePath(): SkPath {
  // Stylized flame — three curved lobes.
  const p = Skia.Path.Make();
  const cx = GLYPH_HALF;
  const cy = GLYPH_HALF;
  // Outer flame outline
  p.moveTo(cx, cy + 7);
  p.cubicTo(cx - 7, cy + 4, cx - 6, cy - 2, cx - 1, cy - 6);
  p.cubicTo(cx - 2, cy - 1, cx + 2, cy + 1, cx + 3, cy - 4);
  p.cubicTo(cx + 7, cy - 1, cx + 7, cy + 4, cx, cy + 7);
  p.close();
  // Inner glow ridge
  p.moveTo(cx - 1, cy + 4);
  p.cubicTo(cx - 3, cy + 2, cx - 2, cy - 1, cx, cy - 2);
  p.cubicTo(cx + 2, cy - 1, cx + 3, cy + 2, cx - 1, cy + 4);
  return p;
}

const PATHS: Readonly<Record<EventType, SkPath>> = {
  EQ: earthquakePath(),
  TC: cyclonePath(),
  FL: floodPath(),
  VO: volcanoPath(),
  DR: droughtPath(),
  WF: wildfirePath(),
};

export function getGlyphPath(type: EventType): SkPath {
  return PATHS[type];
}

function chokepointPath(): SkPath {
  // Two opposing arcs with a center mark — the geographic signature of a
  // strait/chokepoint: two coastlines pinching toward a narrow water
  // passage. Arcs face each other (`)(` orientation) so the gap between
  // them is the navigable channel; the center dot pins the chokepoint's
  // exact location. Vertical orientation chosen because most named
  // chokepoints (Hormuz, Bab-el-Mandeb, Malacca, Gibraltar, Dover) read
  // as east/west land masses with north/south through-traffic.
  const p = Skia.Path.Make();
  const cx = GLYPH_HALF;
  const cy = GLYPH_HALF;
  // Left coastline arc — concave facing right (bulges left)
  p.moveTo(cx - 3, cy - 7);
  p.cubicTo(cx - 9, cy - 4, cx - 9, cy + 4, cx - 3, cy + 7);
  // Right coastline arc — concave facing left (bulges right)
  p.moveTo(cx + 3, cy - 7);
  p.cubicTo(cx + 9, cy - 4, cx + 9, cy + 4, cx + 3, cy + 7);
  // Center mark — the chokepoint itself
  p.addCircle(cx, cy, 1.4);
  return p;
}

/** Chokepoint pictogram — two facing coastline arcs around a center mark.
 *  Used in DisambiguationSheet rows so straits read with the same
 *  graphic confidence as GDACS event types instead of as a generic ring. */
export const CHOKEPOINT_PATH: SkPath = chokepointPath();

export const EVENT_TYPE_LABEL: Readonly<Record<EventType, string>> = {
  EQ: 'Earthquake',
  TC: 'Tropical cyclone',
  FL: 'Flood',
  VO: 'Volcano',
  DR: 'Drought',
  WF: 'Wildfire',
};

function kineticPath(): SkPath {
  // Two crossed diagonals — the universal "site of incident / casualty"
  // mark used in conflict-mapping vocabularies (ICRC, ACLED). Two strokes
  // total: minimal at globe scale, geometrically opposite to the drought
  // sun (radial → orthogonal-rotated cross), and distinct from every
  // other glyph in the family (no circles, no curves, no fill). Replaced
  // the prior 6-stroke asymmetric burst (2026-05-02) which read as noise
  // when 30-50 markers crowd the same theatre.
  const p = Skia.Path.Make();
  const cx = GLYPH_HALF;
  const cy = GLYPH_HALF;
  const r = 5.5;
  p.moveTo(cx - r, cy - r);
  p.lineTo(cx + r, cy + r);
  p.moveTo(cx + r, cy - r);
  p.lineTo(cx - r, cy + r);
  return p;
}

function unrestPath(): SkPath {
  // Three head-and-body abstractions clustered in a row — reads as "small
  // crowd" without resorting to a literal protest pictogram. Heads are
  // small rings (addCircle under stroke style); bodies are short verticals
  // beneath. The triadic arrangement is the universal "people" shorthand
  // used in icon vocabularies (think pedestrian-crossing signs scaled out
  // to multiple figures), and it stays legible at 22px.
  const p = Skia.Path.Make();
  const cx = GLYPH_HALF;
  const cy = GLYPH_HALF;
  for (const xOff of [-5, 0, 5]) {
    const fx = cx + xOff;
    p.addCircle(fx, cy - 3, 1.6);
    p.moveTo(fx, cy - 1);
    p.lineTo(fx, cy + 5);
  }
  return p;
}

const CONFLICT_PATHS: Readonly<Record<ConflictEventFamily, SkPath>> = {
  kinetic: kineticPath(),
  unrest: unrestPath(),
};

export function getConflictGlyphPath(family: ConflictEventFamily): SkPath {
  return CONFLICT_PATHS[family];
}

export const CONFLICT_FAMILY_LABEL: Readonly<Record<ConflictEventFamily, string>> = {
  kinetic: 'Kinetic event',
  unrest: 'Civil unrest',
};
