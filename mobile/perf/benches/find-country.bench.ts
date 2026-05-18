/**
 * Bench `findCountry` (projection.ts:231) — bbox pre-filter + d3-geo
 * `geoContains` polygon test, with up to 17 nudge fallbacks for
 * coastal/disputed coordinates. Called once per new article during data
 * load, not per frame; regression here lengthens cold-start, not the 32ms
 * budget. Worth tracking because it's O(features × nudges) in the worst
 * case — a small allocation or bbox change can blow it up.
 */

import { findCountry } from '../../components/globe/projection';
import { bench } from '../bench-utils';

interface Ctx {
  // [lat, lng, location] — mix of inland (single nudge) and coastal/edge
  // (multi-nudge) cases so the bench reflects realistic article geocoding.
  points: Array<readonly [number, number, string | null]>;
}

export default bench<Ctx>({
  name: 'projection.findCountry',
  iterations: 600,
  warmup: 50,
  setup: () => ({
    points: [
      [30.05, 31.25, null], // Cairo — inland-ish
      [40.71, -74.0, null], // New York harbor — coastal
      [-23.55, -46.63, null], // São Paulo
      [55.75, 37.62, null], // Moscow
      [35.69, 139.69, null], // Tokyo
      [1.35, 103.82, null], // Singapore — small island
      [-33.92, 18.42, null], // Cape Town — coastal
      [25.2, 55.27, null], // Dubai
      [-34.6, -58.38, null], // Buenos Aires
      [59.33, 18.07, null], // Stockholm
      [0, 0, null], // off-globe ocean — exercises full sweep
      [21.0, 79.0, null], // Central India
    ],
  }),
  run: ({ points }) => {
    for (const [lat, lng, loc] of points) {
      findCountry(lat, lng, loc);
    }
  },
});
