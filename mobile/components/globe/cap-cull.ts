/**
 * Spherical-cap culling for the geometry the globe reprojects every frame.
 *
 * d3-geo's circle clip does its work per vertex and per polygon, whether or
 * not any of it ends up on screen: every point is rotated and tested against
 * the clip cone, and every polygon's `polygonEnd` runs `polygonContains` —
 * trigonometry plus an Adder over each vertex of each ring — to decide
 * whether the polygon encloses the view. On the emulator that winding test
 * alone was the single largest self-time in a globe drag. Most of it is
 * spent on the far side of the planet, on islands and borders that cannot
 * possibly be drawn.
 *
 * So each polygon and line gets a bounding cap once, at build time: its
 * vertices' mean direction and the widest angle from that to any vertex. A
 * part whose cap lies wholly outside the view cone is dropped before d3 sees
 * it, and the result is exactly what d3 would have drawn — not an
 * approximation of it:
 *
 * - A cap no wider than a hemisphere is convex, so the great-circle edges
 *   between its vertices stay inside it too.
 * - A ring inside such a cap bounds its interior inside the cap as well (the
 *   other side would be the rest of the sphere, which d3 would fill across
 *   the whole globe — visibly wrong, and not what this data does).
 * - So a part further from the camera than `radius + clip` has no visible
 *   segment, and does not contain the clip circle's start point either:
 *   d3 emits nothing for it. `__tests__/cap-cull.test.ts` checks that the
 *   path commands match byte for byte.
 *
 * Parts wider than a hemisphere are never culled by their cap. None of the
 * Natural Earth 110m land polygons are (Eurasia is the widest, at 89.6°), but
 * a graticule meridian is exactly one: pole to pole, 90° either side of its
 * midpoint. A line that runs along a single meridian gets a second, exact
 * test instead — its distance from the camera is the distance to a half
 * great circle, which has a closed form.
 */

const DEG = Math.PI / 180;
const HALF_PI = Math.PI / 2;
/** Slack past `radius + clip`, in radians. Far below a pixel at any zoom; it
 *  only keeps floating-point rounding from culling a part that grazes the
 *  cone's edge. */
const MARGIN = 1e-6;

interface Part<T> {
  coords: T;
  x: number;
  y: number;
  z: number;
  /** Angular radius of the part's bounding cap, radians. `Math.PI` = never cull. */
  radius: number;
  /** Set when every vertex shares one longitude: that longitude, radians. */
  meridian?: number;
}

export interface CapCuller {
  /**
   * The geometry minus every part wholly outside the view cone. The returned
   * object is reused by the next call, so stream it before calling again.
   */
  visible(camLng: number, camLat: number, clipAngleDeg: number): GeoJSON.Geometry;
  /** Polygons plus lines the culler holds. */
  readonly partCount: number;
}

type Input = GeoJSON.GeoJSON | GeoJSON.Geometry;

function capOf<T>(coords: T, points: GeoJSON.Position[]): Part<T> {
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const p of points) {
    const lat = (p[1] ?? 0) * DEG;
    const lng = (p[0] ?? 0) * DEG;
    const c = Math.cos(lat);
    sx += c * Math.cos(lng);
    sy += c * Math.sin(lng);
    sz += Math.sin(lat);
  }
  const n = Math.hypot(sx, sy, sz);
  if (n < 1e-9) return { coords, x: 0, y: 0, z: 1, radius: Math.PI };
  sx /= n;
  sy /= n;
  sz /= n;
  let minDot = 1;
  for (const p of points) {
    const lat = (p[1] ?? 0) * DEG;
    const lng = (p[0] ?? 0) * DEG;
    const c = Math.cos(lat);
    const d = c * Math.cos(lng) * sx + c * Math.sin(lng) * sy + Math.sin(lat) * sz;
    if (d < minDot) minDot = d;
  }
  const radius = Math.acos(Math.max(-1, Math.min(1, minDot)));
  return { coords, x: sx, y: sy, z: sz, radius: radius >= HALF_PI ? Math.PI : radius };
}

function lineOf(coords: GeoJSON.Position[]): Part<GeoJSON.Position[]> {
  const part = capOf(coords, coords);
  const lng = coords[0]?.[0];
  if (lng !== undefined && coords.length > 1 && coords.every((p) => p[0] === lng)) {
    part.meridian = lng * DEG;
  }
  return part;
}

export function createCapCuller(input: Input): CapCuller {
  const polygons: Part<GeoJSON.Position[][]>[] = [];
  const lines: Part<GeoJSON.Position[]>[] = [];

  const collect = (g: Input | null): void => {
    if (!g) return;
    switch (g.type) {
      case 'FeatureCollection':
        for (const f of g.features) collect(f.geometry);
        return;
      case 'Feature':
        collect(g.geometry);
        return;
      case 'GeometryCollection':
        for (const child of g.geometries) collect(child);
        return;
      case 'Polygon':
        polygons.push(capOf(g.coordinates, g.coordinates.flat()));
        return;
      case 'MultiPolygon':
        for (const poly of g.coordinates) polygons.push(capOf(poly, poly.flat()));
        return;
      case 'LineString':
        lines.push(lineOf(g.coordinates));
        return;
      case 'MultiLineString':
        for (const line of g.coordinates) lines.push(lineOf(line));
        return;
      default:
        // Points stream as points, not paths; nothing here draws them.
        return;
    }
  };
  collect(input);

  const polygonOut: GeoJSON.Position[][][] = [];
  const lineOut: GeoJSON.Position[][] = [];
  const multiPolygon: GeoJSON.MultiPolygon = { type: 'MultiPolygon', coordinates: polygonOut };
  const multiLine: GeoJSON.MultiLineString = { type: 'MultiLineString', coordinates: lineOut };
  // Mixed input would reorder polygons ahead of lines; none of the globe's
  // layers mix, and the order only matters to a byte-for-byte comparison.
  const result: GeoJSON.Geometry =
    polygons.length > 0 && lines.length > 0
      ? { type: 'GeometryCollection', geometries: [multiPolygon, multiLine] }
      : lines.length > 0
        ? multiLine
        : multiPolygon;

  return {
    partCount: polygons.length + lines.length,
    visible(camLng, camLat, clipAngleDeg) {
      const lat = camLat * DEG;
      const lng = camLng * DEG;
      const cosLat = Math.cos(lat);
      const sinLat = Math.sin(lat);
      const cx = cosLat * Math.cos(lng);
      const cy = cosLat * Math.sin(lng);
      const cz = sinLat;
      const clip = clipAngleDeg * DEG + MARGIN;

      polygonOut.length = 0;
      for (const p of polygons) {
        const reach = p.radius + clip;
        if (reach >= Math.PI || p.x * cx + p.y * cy + p.z * cz >= Math.cos(reach)) {
          polygonOut.push(p.coords);
        }
      }
      lineOut.length = 0;
      for (const p of lines) {
        const reach = p.radius + clip;
        if (reach < Math.PI && p.x * cx + p.y * cy + p.z * cz < Math.cos(reach)) continue;
        if (p.meridian !== undefined && clip < HALF_PI) {
          // The half great circle through both poles at this longitude. Where
          // the camera's foot on that circle's plane lands on this half, the
          // nearest point is that foot, at asin(|off-plane component|);
          // otherwise it is a pole, at 90° − |lat|.
          const d = lng - p.meridian;
          const along = cosLat * Math.cos(d);
          const outside =
            along >= 0
              ? Math.abs(cosLat * Math.sin(d)) > Math.sin(clip)
              : Math.abs(sinLat) < Math.cos(clip);
          if (outside) continue;
        }
        lineOut.push(p.coords);
      }
      return result;
    },
  };
}
