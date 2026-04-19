import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import capitalsJson from '../../data/capitals-50m.json';
import countriesHiResTopo from '../../data/countries-50m.json';
import lakesHiResTopo from '../../data/lakes-50m.json';
import riversHiResTopo from '../../data/rivers-50m.json';
import seasJson from '../../data/seas-50m.json';

// Higher-resolution (Natural Earth 1:50m) world used by LocationsBlock. The
// block projects paths once and zooms via a Skia Group transform, so it never
// hits the Globe's 32ms per-frame reprojection budget — the extra vertex
// detail is free at render time and just buys smoother borders and coastlines
// when focused on a country.

interface TopoWithObjects extends Topology {
  objects: Record<string, GeometryCollection>;
}

const data = countriesHiResTopo as unknown as TopoWithObjects;
const landObj = data.objects.land;
const countriesObj = data.objects.countries;
if (!landObj || !countriesObj) throw new Error('missing 50m topojson objects');

export const landHiRes = feature(data, landObj);
export const countriesHiRes = feature(data, countriesObj) as unknown as GeoJSON.FeatureCollection;
export const bordersMeshHiRes = mesh(data, countriesObj, (a, b) => a !== b);

// Lakes + reservoirs (Natural Earth 1:50m). Rendered as bg-colored "holes"
// punched through the land silhouette — no extra color, just the absence of
// land. Matters for country zooms: a map of East Africa without Lake Victoria
// or of Canada without the Great Lakes reads as wrong. Named lakes (~320 of
// 412) carry a `name` property that LocationsBlock labels when large enough.
const lakesData = lakesHiResTopo as unknown as TopoWithObjects;
const lakesObj = lakesData.objects.lakes;
if (!lakesObj) throw new Error('missing lakes topojson object');
export const lakesHiRes = feature(lakesData, lakesObj) as unknown as GeoJSON.FeatureCollection;

// Rivers + lake centerlines (Natural Earth 1:50m). `scalerank` runs 1 (major)
// to 12 (tiny tributary); we render ranks ≤ 5 and label ranks ≤ 3 to avoid
// visual clutter.
const riversData = riversHiResTopo as unknown as TopoWithObjects;
const riversObj = riversData.objects.rivers;
if (!riversObj) throw new Error('missing rivers topojson object');
export const riversHiRes = feature(riversData, riversObj) as unknown as GeoJSON.FeatureCollection<
  GeoJSON.LineString | GeoJSON.MultiLineString
>;

// Capitals keyed by ISO-2. Filtered to admin-0 capitals from NE 50m populated
// places; one lookup per highlighted country.
export interface Capital {
  name: string;
  lat: number;
  lng: number;
}
export const CAPITALS_BY_ISO2 = capitalsJson as unknown as Record<string, Capital>;

// Seas, bays, gulfs — point labels at the inner-visual-center of each
// NE 50m marine polygon (scalerank ≤ 2, oceans filtered out). Oceans are
// too zoomed-out to be useful labels in a country-focused view; named
// regional seas like the Arabian Sea, Black Sea, Persian Gulf are the
// sweet spot.
export interface Sea {
  name: string;
  lat: number;
  lng: number;
  rank: number;
  kind: 'sea' | 'bay' | 'gulf' | 'ocean';
}
export const SEAS: Sea[] = seasJson as unknown as Sea[];
