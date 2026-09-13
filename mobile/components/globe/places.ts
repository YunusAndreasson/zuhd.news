/**
 * Country capitals, labelled on the globe at every zoom.
 *
 * At the resting framing (30°–40°) the globe named only the giant "anchor"
 * countries, and a reader looking at Mali or Australia saw a coastline and a
 * country name with nothing inside it. The web map sets city dots and names
 * from its detail zoom. The app puts in the one tier that reads at a planet's
 * scale: each country's capital, so Bamako sits in Mali and Canberra in
 * Australia. The label packer drops whatever collides, so crowded Europe
 * thins itself.
 *
 * Sourced from `shared/data/capitals-50m.json`, the set the night-side city
 * lights already use (one capital per country, so every lit country is also a
 * named one). `places-50m.geojson` is not used: its `cap` flag marks regional
 * capitals too (Sydney, Hamburg), which would crowd the national ones out.
 *
 * Precomputed at module load: a `[lng, lat]` tuple for `proj` and a unit
 * vector for the per-frame hemisphere cull, so a frame does two dot products
 * and a projection per visible capital and allocates nothing else.
 */

import capitals from '@shared/data/capitals-50m.json';

export interface CapitalLabel {
  name: string;
  coords: [number, number];
  unit: [number, number, number];
}

const DEG2RAD = Math.PI / 180;

export const CAPITALS: readonly CapitalLabel[] = Object.values(
  capitals as Record<string, { name: string; lat: number; lng: number }>,
)
  .filter((c) => c.name && Number.isFinite(c.lat) && Number.isFinite(c.lng))
  .map((c) => {
    const latR = c.lat * DEG2RAD;
    const lngR = c.lng * DEG2RAD;
    const cosLat = Math.cos(latR);
    return {
      name: c.name,
      coords: [c.lng, c.lat] as [number, number],
      unit: [cosLat * Math.cos(lngR), cosLat * Math.sin(lngR), Math.sin(latR)] as [
        number,
        number,
        number,
      ],
    };
  });
