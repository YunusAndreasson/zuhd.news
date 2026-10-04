import type { GdacsEventType as EventType } from '@shared/types';
import { Skia, type SkPath } from '@shopify/react-native-skia';
import { STRAIT_BULGE, STRAIT_END_DX, type StraitState } from '../../lib/strait-map';

/** Glyph paths for GDACS event types. Each path is centered at (0,0) inside
 *  a 22×22 unit box so MiniGlobe can translate by `(x - GLYPH_HALF, y - GLYPH_HALF)`
 *  to position. Stored as singleton SkPaths — Skia paths are immutable for
 *  drawing, so reuse is safe across frames and threads. */

const GLYPH_SIZE = 22;
export const GLYPH_HALF = GLYPH_SIZE / 2;

function earthquakePath(): SkPath {
  // Three concentric circles + epicenter dot — the seismograph signature.
  const b = Skia.PathBuilder.Make();
  for (const r of [2.5, 5, 8]) {
    b.addCircle(GLYPH_HALF, GLYPH_HALF, r);
  }
  return b.detach();
}

function cyclonePath(): SkPath {
  // Two rotationally-symmetric spiral arms + central eye. Each arm is one
  // cubic that sweeps from the outer rim toward the eye, mirrored 180°.
  // Reads cleanly as TC at 22px without trying to be a full logarithmic
  // spiral — point-symmetric layout matches the universal cyclone pictogram.
  const cx = GLYPH_HALF;
  const cy = GLYPH_HALF;
  return (
    Skia.PathBuilder.Make()
      // Outer arm — sweeps clockwise from east into the eye
      .moveTo(cx + 9, cy)
      .cubicTo(cx + 9, cy + 5, cx + 4, cy + 8, cx, cy + 6)
      .cubicTo(cx - 3, cy + 4.5, cx - 1.5, cy + 1.5, cx + 1.5, cy + 0.5)
      // Mirror arm — sweeps counter-clockwise from west
      .moveTo(cx - 9, cy)
      .cubicTo(cx - 9, cy - 5, cx - 4, cy - 8, cx, cy - 6)
      .cubicTo(cx + 3, cy - 4.5, cx + 1.5, cy - 1.5, cx - 1.5, cy - 0.5)
      // Eye
      .addCircle(cx, cy, 1.4)
      .detach()
  );
}

function floodPath(): SkPath {
  // Two stacked sine waves — the universal flood pictogram.
  const b = Skia.PathBuilder.Make();
  const cy = GLYPH_HALF;
  for (const yOff of [-3, 1.5]) {
    b.moveTo(GLYPH_HALF - 8, cy + yOff)
      .cubicTo(GLYPH_HALF - 4, cy + yOff - 3, GLYPH_HALF, cy + yOff + 3, GLYPH_HALF + 4, cy + yOff)
      .cubicTo(
        GLYPH_HALF + 6,
        cy + yOff - 1.5,
        GLYPH_HALF + 7,
        cy + yOff - 1,
        GLYPH_HALF + 8,
        cy + yOff,
      );
  }
  return b.detach();
}

function volcanoPath(): SkPath {
  // Trapezoidal cone with a small lava plume above.
  const cx = GLYPH_HALF;
  const cy = GLYPH_HALF;
  return (
    Skia.PathBuilder.Make()
      // Cone outline
      .moveTo(cx - 7, cy + 5)
      .lineTo(cx - 2, cy - 2)
      .lineTo(cx + 2, cy - 2)
      .lineTo(cx + 7, cy + 5)
      .close()
      // Plume — three short verticals above the caldera
      .moveTo(cx - 1.5, cy - 4)
      .lineTo(cx - 1.5, cy - 7)
      .moveTo(cx, cy - 3.5)
      .lineTo(cx, cy - 8)
      .moveTo(cx + 1.5, cy - 4)
      .lineTo(cx + 1.5, cy - 7)
      .detach()
  );
}

function droughtPath(): SkPath {
  // A low sun over cracked ground. It was a sun alone — a disc and eight
  // rays — which is a radial burst, and the thermal anomaly is the one
  // radial burst the web's alphabet allows: in its near-identical orange, a
  // drought alert and a fire's heat were the same mark at a glance. The
  // ground line and its cracks make this one horizontal, and anchored.
  const cx = GLYPH_HALF;
  const cy = GLYPH_HALF;
  const horizon = cy + 1.5;
  const b = Skia.PathBuilder.Make()
    // Ground
    .moveTo(cx - 8, horizon)
    .lineTo(cx + 8, horizon)
    // The sun's upper half, sitting on it
    .moveTo(cx - 3.5, horizon)
    .arcToOval(Skia.XYWHRect(cx - 3.5, horizon - 3.5, 7, 7), 180, 180, false);
  // Three short rays, up and to either side
  for (const deg of [-150, -90, -30]) {
    const a = (deg * Math.PI) / 180;
    b.moveTo(cx + Math.cos(a) * 5.5, horizon + Math.sin(a) * 5.5).lineTo(
      cx + Math.cos(a) * 8,
      horizon + Math.sin(a) * 8,
    );
  }
  // Two cracks in the ground
  return b
    .moveTo(cx - 4, horizon)
    .lineTo(cx - 2.5, horizon + 3)
    .lineTo(cx - 4, horizon + 5.5)
    .moveTo(cx + 3, horizon)
    .lineTo(cx + 4.5, horizon + 2.5)
    .lineTo(cx + 3, horizon + 5)
    .detach();
}

function wildfirePath(): SkPath {
  // Stylized flame — three curved lobes.
  const cx = GLYPH_HALF;
  const cy = GLYPH_HALF;
  return (
    Skia.PathBuilder.Make()
      // Outer flame outline
      .moveTo(cx, cy + 7)
      .cubicTo(cx - 7, cy + 4, cx - 6, cy - 2, cx - 1, cy - 6)
      .cubicTo(cx - 2, cy - 1, cx + 2, cy + 1, cx + 3, cy - 4)
      .cubicTo(cx + 7, cy - 1, cx + 7, cy + 4, cx, cy + 7)
      .close()
      // Inner glow ridge
      .moveTo(cx - 1, cy + 4)
      .cubicTo(cx - 3, cy + 2, cx - 2, cy - 1, cx, cy - 2)
      .cubicTo(cx + 2, cy - 1, cx + 3, cy + 2, cx - 1, cy + 4)
      .detach()
  );
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

function straitPath(bulge: number): SkPath {
  // Two opposing arcs with a center mark — the geographic signature of a
  // strait/chokepoint: two coastlines pinching toward a narrow water
  // passage. Arcs face each other (`)(` orientation) so the gap between
  // them is the navigable channel; the center dot pins the chokepoint's
  // exact location. Vertical orientation chosen because most named
  // chokepoints (Hormuz, Bab-el-Mandeb, Malacca, Gibraltar, Dover) read
  // as east/west land masses with north/south through-traffic.
  //
  // How far the arcs bow is the strait's state (`STRAIT_BULGE`), the web's
  // `strait(bulge)` at this box's scale — so the phone and the map draw one
  // mark, and a pinch reads as a pinch without its gold.
  const cx = GLYPH_HALF;
  const cy = GLYPH_HALF;
  const end = STRAIT_END_DX;
  return (
    Skia.PathBuilder.Make()
      // Left coastline arc — concave facing right (bulges left)
      .moveTo(cx - end, cy - 7)
      .cubicTo(cx - end - bulge, cy - 4, cx - end - bulge, cy + 4, cx - end, cy + 7)
      // Right coastline arc — concave facing left (bulges right)
      .moveTo(cx + end, cy - 7)
      .cubicTo(cx + end + bulge, cy - 4, cx + end + bulge, cy + 4, cx + end, cy + 7)
      // Center mark — the chokepoint itself
      .addCircle(cx, cy, 1.4)
      .detach()
  );
}

const STRAIT_PATHS: Readonly<Record<StraitState, SkPath>> = {
  rest: straitPath(STRAIT_BULGE.rest),
  pinch: straitPath(STRAIT_BULGE.pinch),
  surge: straitPath(STRAIT_BULGE.surge),
};

/** A strait's pictogram in its state — two facing coastline arcs around a
 *  center mark, bowed by how its traffic stands against its normal. The
 *  globe, the map key and the chooser's rows all draw from this. */
export function getStraitPath(state: StraitState): SkPath {
  return STRAIT_PATHS[state];
}

/** Direction glyphs shared by the market chooser and map key. */
export function marketDirectionPath(direction: 'up' | 'down' | 'flat'): SkPath {
  const b = Skia.PathBuilder.Make();
  if (direction === 'flat') return b.moveTo(4, 11).lineTo(18, 11).detach();
  const tip = direction === 'up' ? 3 : 19;
  const shoulder = direction === 'up' ? 9 : 13;
  return b
    .moveTo(11, 3)
    .lineTo(11, 19)
    .moveTo(5, shoulder)
    .lineTo(11, tip)
    .lineTo(17, shoulder)
    .detach();
}
