import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';

// Higher-resolution Natural Earth detail used by the globe. Loaded lazily so
// cold start does not pay the JSON.parse + topojson→GeoJSON cost.

interface TopoWithObjects extends Topology {
  objects: Record<string, GeometryCollection>;
}

export interface Sea {
  name: string;
  lat: number;
  lng: number;
  rank: number;
  kind: 'sea' | 'bay' | 'gulf' | 'ocean';
}

// Lakes + reservoirs (Natural Earth 1:50m). Rendered as bg-colored "holes"
// punched through the land silhouette — no extra color, just the absence of
// land. Matters for country zooms: a map of East Africa without Lake Victoria
// or of Canada without the Great Lakes reads as wrong. Named lakes (~320 of
// 412) carry a `name` property that LocationsBlock labels when large enough.
let _lakes: GeoJSON.FeatureCollection | null = null;
export function getLakesHiRes(): GeoJSON.FeatureCollection {
  if (_lakes) return _lakes;
  const data = require('@shared/data/lakes-50m.json') as TopoWithObjects;
  const obj = data.objects.lakes;
  if (!obj) throw new Error('missing lakes topojson object');
  _lakes = feature(data, obj) as unknown as GeoJSON.FeatureCollection;
  return _lakes;
}

// Rivers + lake centerlines (Natural Earth 1:50m). `scalerank` runs 1 (major)
// to 12 (tiny tributary); we render ranks ≤ 5 and label ranks ≤ 3 to avoid
// visual clutter.
type RiversFC = GeoJSON.FeatureCollection<GeoJSON.LineString | GeoJSON.MultiLineString>;
let _rivers: RiversFC | null = null;
export function getRiversHiRes(): RiversFC {
  if (_rivers) return _rivers;
  const data = require('@shared/data/rivers-50m.json') as TopoWithObjects;
  const obj = data.objects.rivers;
  if (!obj) throw new Error('missing rivers topojson object');
  _rivers = feature(data, obj) as unknown as RiversFC;
  return _rivers;
}

// Seas, bays, gulfs — point labels at the inner-visual-center of each
// NE 50m marine polygon (scalerank ≤ 2, oceans filtered out). Oceans are
// too zoomed-out to be useful labels in a country-focused view; named
// regional seas like the Arabian Sea, Black Sea, Persian Gulf are the
// sweet spot.
let _seas: Sea[] | null = null;
export function getSeas(): Sea[] {
  if (_seas) return _seas;
  _seas = require('@shared/data/seas-50m.json') as Sea[];
  return _seas;
}
