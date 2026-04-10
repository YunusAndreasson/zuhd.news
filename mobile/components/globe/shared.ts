import type { SkPath } from '@shopify/react-native-skia';
import { feature, mesh } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import countriesTopo from '../../data/countries-110m.json';
import worldTopo from '../../data/world-110m.json';

export const land = feature(worldTopo as unknown as Topology, (worldTopo as any).objects.land);
export const countries = feature(
  countriesTopo as unknown as Topology,
  (countriesTopo as any).objects.countries,
) as unknown as GeoJSON.FeatureCollection;

// Internal borders only (shared edges between countries, no coastlines — land
// already shows those). Single MultiLineString = much faster to project than
// 180 separate country polygons.
export const bordersMesh = mesh(
  countriesTopo as unknown as Topology,
  (countriesTopo as any).objects.countries,
  (a, b) => a !== b,
);

const DEG = 180 / Math.PI;

export function createSkiaPathContext() {
  let _path: SkPath | null = null;
  return {
    setPath(p: SkPath) {
      _path = p;
    },
    beginPath() {},
    moveTo(x: number, y: number) {
      _path!.moveTo(x, y);
    },
    lineTo(x: number, y: number) {
      _path!.lineTo(x, y);
    },
    arc(x: number, y: number, r: number, startAngle: number, endAngle: number) {
      _path!.addArc(
        { x: x - r, y: y - r, width: r * 2, height: r * 2 },
        startAngle * DEG,
        (endAngle - startAngle) * DEG,
      );
    },
    closePath() {
      _path!.close();
    },
  };
}
