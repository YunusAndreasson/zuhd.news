import type { ConflictEventFamily, GdacsEventType as EventType } from '@shared/types';
import { Skia, type SkPath } from '@shopify/react-native-skia';

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
  // Sun with rays — heat / aridity. Center disc + 8 short rays.
  const cx = GLYPH_HALF;
  const cy = GLYPH_HALF;
  const b = Skia.PathBuilder.Make().addCircle(cx, cy, 2.5);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const inner = 4.5;
    const outer = 8;
    b.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner).lineTo(
      cx + Math.cos(a) * outer,
      cy + Math.sin(a) * outer,
    );
  }
  return b.detach();
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

function chokepointPath(): SkPath {
  // Two opposing arcs with a center mark — the geographic signature of a
  // strait/chokepoint: two coastlines pinching toward a narrow water
  // passage. Arcs face each other (`)(` orientation) so the gap between
  // them is the navigable channel; the center dot pins the chokepoint's
  // exact location. Vertical orientation chosen because most named
  // chokepoints (Hormuz, Bab-el-Mandeb, Malacca, Gibraltar, Dover) read
  // as east/west land masses with north/south through-traffic.
  const cx = GLYPH_HALF;
  const cy = GLYPH_HALF;
  return (
    Skia.PathBuilder.Make()
      // Left coastline arc — concave facing right (bulges left)
      .moveTo(cx - 3, cy - 7)
      .cubicTo(cx - 9, cy - 4, cx - 9, cy + 4, cx - 3, cy + 7)
      // Right coastline arc — concave facing left (bulges right)
      .moveTo(cx + 3, cy - 7)
      .cubicTo(cx + 9, cy - 4, cx + 9, cy + 4, cx + 3, cy + 7)
      // Center mark — the chokepoint itself
      .addCircle(cx, cy, 1.4)
      .detach()
  );
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
  // Crosshair / targeting reticle — outer ring with horizontal and
  // vertical hairs extending past the rim. The universal "targeted
  // location / site of incident" mark in military and crisis-mapping
  // vocabularies (OCHA situation maps, Reuters Graphics, NATO joint
  // operations). Reads as a SITE, not a finality — quieter editorial
  // tone than the X-as-death pictogram, while staying geometrically
  // distinct from every other glyph in the family.
  const cx = GLYPH_HALF;
  const cy = GLYPH_HALF;
  return (
    Skia.PathBuilder.Make()
      // Outer ring — same family of stroked rings used by the earthquake
      // glyph, sized so cross-hairs protrude ~3 units past the rim.
      .addCircle(cx, cy, 6.5)
      // Horizontal cross-hair — runs the full glyph box width
      .moveTo(1.5, cy)
      .lineTo(20.5, cy)
      // Vertical cross-hair
      .moveTo(cx, 1.5)
      .lineTo(cx, 20.5)
      .detach()
  );
}

function unrestPath(): SkPath {
  // Three head-and-body abstractions clustered in a row — reads as "small
  // crowd" without resorting to a literal protest pictogram. Heads are
  // small rings (addCircle under stroke style); bodies are short verticals
  // beneath. The triadic arrangement is the universal "people" shorthand
  // used in icon vocabularies (think pedestrian-crossing signs scaled out
  // to multiple figures), and it stays legible at 22px.
  const cx = GLYPH_HALF;
  const cy = GLYPH_HALF;
  const b = Skia.PathBuilder.Make();
  for (const xOff of [-5, 0, 5]) {
    const fx = cx + xOff;
    b.addCircle(fx, cy - 3, 1.6)
      .moveTo(fx, cy - 1)
      .lineTo(fx, cy + 5);
  }
  return b.detach();
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
