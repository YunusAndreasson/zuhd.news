import type { Transform } from 'topojson-specification';

/** Lossless signed-delta packing. Keeping coordinates in strings avoids
 * thousands of numeric-array literals inflating the Hermes bytecode bundle. */
export function decodeGeographyArc(encoded: string): number[][] {
  return decodeArc(encoded);
}

/** Decode directly to shareable longitude/latitude pairs, without first
 * allocating integer pairs and then replacing their numeric storage. */
export function decodeGeographyCoordinates(encoded: string, transform?: Transform): number[][] {
  return decodeArc(encoded, transform);
}

function decodeArc(encoded: string, transform?: Transform): number[][] {
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
  let x = 0;
  let y = 0;
  while (offset < encoded.length) {
    const dx = number();
    const dy = number();
    x += dx;
    y += dy;
    points.push(
      transform
        ? [
            x * transform.scale[0] + transform.translate[0],
            y * transform.scale[1] + transform.translate[1],
          ]
        : [dx, dy],
    );
  }
  return points;
}
