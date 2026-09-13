/** Lossless signed-delta packing. Keeping coordinates in strings avoids
 * thousands of numeric-array literals inflating the Hermes bytecode bundle. */
export function decodeGeographyArc(encoded: string): number[][] {
  const points: number[][] = [];
  let offset = 0;
  const number = () => {
    let value = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(offset++) - 63;
      value |= (byte & 31) << shift;
      shift += 5;
    } while (byte >= 32);
    return value & 1 ? ~(value >>> 1) : value >>> 1;
  };
  while (offset < encoded.length) points.push([number(), number()]);
  return points;
}
