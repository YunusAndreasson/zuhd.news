import { geoContains } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { decodeGeographyArc } from './geography-codec';
import { createOrthoLayer, type OrthoLayer } from './ortho-stream';

export type GeographyTier = 'motion' | 'overview' | 'regional' | 'detail';
type CountryTopology = Topology<{ countries: GeometryCollection; land: GeometryCollection }>;
/** `[west, south, east, north]` in degrees; west > east crosses the antimeridian. */
type CountryBounds = readonly [number, number, number, number] | null;
type PackedTopology = Omit<CountryTopology, 'arcs'> & {
  arcs: string[];
  /** One per country, in the order of `objects.countries.geometries`. */
  bounds: CountryBounds[];
};

/** At rest, keep source simplification below half a logical pixel (up to scale 8000).
 * Motion uses a light shared-arc tier; the final frame always restores detail. */
export function geographyTier(scale: number, moving = false): GeographyTier {
  if (moving) return 'motion';
  if (scale <= 500) return 'overview';
  if (scale <= 2000) return 'regional';
  return 'detail';
}

export interface GlobeGeography {
  land: OrthoLayer;
  borders: OrthoLayer;
  ice: OrthoLayer;
  country: (name: string) => OrthoLayer | undefined;
  countryNamed: (name: string) => GeoJSON.Feature | undefined;
  countryAt: (lng: number, lat: number) => GeoJSON.Feature | undefined;
}

interface TierEntry {
  geography: GlobeGeography;
  /** What is left of the tier's decode, in the order a frame would ask for it. */
  stages: (() => void)[];
}

const cache = new Map<GeographyTier, TierEntry>();

function load(tier: GeographyTier): PackedTopology {
  return tier === 'motion'
    ? require('../../assets/geo/countries-motion.json')
    : tier === 'overview'
      ? require('../../assets/geo/countries-overview.json')
      : tier === 'regional'
        ? require('../../assets/geo/countries-regional.json')
        : require('../../assets/geo/countries-detail.json');
}

/** `make`, run the first time its value is asked for. */
function once<T>(make: () => T): () => T {
  let made = false;
  let value: T;
  return () => {
    if (!made) {
      value = make();
      made = true;
    }
    return value;
  };
}

/**
 * A tier, every part of it decoded the first time it is asked for.
 *
 * It was decoded whole on the first call, and a tier is first asked for at a
 * bad moment: story framings sit either side of the `overview`/`regional`
 * boundary, so the second tier arrived with the first small country a swipe
 * away — 2.2 s of one synchronous call on the emulator (2026-10-02), in the
 * idle slot after the first landing, with the next swipes' cards and globe
 * frames queued behind it. Most of it was two questions d3 was asked per
 * vertex that neither needed asking on the device: each country's bounds
 * (now a table in the asset, `scripts/generate-globe-geography.mjs`) and each
 * polygon's winding (`ortho-stream.ts` `woundOutward`). The rest is split
 * here, so a lookup does not build layers, a frame does not convert 255
 * countries to find one, and `warmGlobeGeography` can spread what remains
 * over idle slots.
 */
function createTier(tier: GeographyTier): TierEntry {
  const packed = once(() => load(tier));
  const topology = once((): CountryTopology => {
    const source = packed();
    return { ...source, arcs: source.arcs.map(decodeGeographyArc) };
  });
  const geometries = () => topology().objects.countries.geometries;
  const nameOf = (i: number): string | undefined =>
    (geometries()[i]?.properties as { name?: string } | null | undefined)?.name;
  // A country is converted when it is first named or first passes the bounds
  // test, and is the same object from then on.
  const features: (GeoJSON.Feature | undefined)[] = [];
  const featureAt = (i: number): GeoJSON.Feature | undefined => {
    const geometry = geometries()[i];
    if (!geometry) return undefined;
    let made = features[i];
    if (!made) {
      made = feature(topology(), geometry) as GeoJSON.Feature;
      features[i] = made;
    }
    return made;
  };
  // The last country of a name wins, as a `Map` built from the features had it.
  const indexByName = once(() => new Map(geometries().map((_, i) => [nameOf(i), i])));
  const countryNamed = (name: string) => {
    const i = indexByName().get(name);
    return i === undefined ? undefined : featureAt(i);
  };

  const land = once(() => createOrthoLayer(feature(topology(), topology().objects.land)));
  const borders = once(() =>
    createOrthoLayer(mesh(topology(), topology().objects.countries, (a, b) => a !== b)),
  );
  const ice = once(() =>
    createOrthoLayer({
      type: 'FeatureCollection',
      features: geometries().flatMap((_, i) => {
        if (nameOf(i) !== 'Antarctica' && nameOf(i) !== 'Greenland') return [];
        const made = featureAt(i);
        return made ? [made] : [];
      }),
    }),
  );
  const countryLayers = new Map<string, OrthoLayer>();

  return {
    geography: {
      get land() {
        return land();
      },
      get borders() {
        return borders();
      },
      get ice() {
        return ice();
      },
      countryNamed,
      countryAt(lng, lat) {
        const bounds = packed().bounds;
        for (let i = 0; i < bounds.length; i++) {
          const bbox = bounds[i];
          if (!bbox) continue;
          const [west, south, east, north] = bbox;
          const withinLng = west <= east ? lng >= west && lng <= east : lng >= west || lng <= east;
          if (!withinLng || lat < south || lat > north) continue;
          const country = featureAt(i);
          if (country && geoContains(country, [lng, lat])) return country;
        }
        return undefined;
      },
      country(name) {
        const cachedCountry = countryLayers.get(name);
        if (cachedCountry) return cachedCountry;
        const country = countryNamed(name);
        if (!country) return undefined;
        const layer = createOrthoLayer(country);
        countryLayers.set(name, layer);
        return layer;
      },
    },
    stages: [packed, topology, land, borders, ice],
  };
}

function entryOf(tier: GeographyTier): TierEntry {
  let entry = cache.get(tier);
  if (!entry) {
    entry = createTier(tier);
    cache.set(tier, entry);
  }
  return entry;
}

/** Each tier is decoded once, only if the camera needs it, and each part of
 * it only when that part is first read (`createTier`). All four layers use one
 * topology; mixing a detailed coast with a coarse highlight leaves visible
 * wedges at the shore. Generated by scripts/generate-globe-geography.mjs.
 * Every layer is an `OrthoLayer`: its vertices' unit vectors, computed once
 * when the layer is first drawn, are what a frame rotates and clips
 * (`ortho-stream.ts`). */
export function getGlobeGeography(tier: GeographyTier): GlobeGeography {
  return entryOf(tier).geography;
}

/**
 * One stage of a tier's decode — the asset, its arcs, the land, the borders,
 * the ice — for a caller with idle time and a frame it expects to draw later.
 * True when there was nothing left to do; false when this call did a stage,
 * so the caller comes back in another idle slot. A frame that cannot wait
 * reads `getGlobeGeography` and pays for whatever is left at once.
 */
export function warmGlobeGeography(tier: GeographyTier): boolean {
  const next = entryOf(tier).stages.shift();
  if (!next) return true;
  next();
  return false;
}
