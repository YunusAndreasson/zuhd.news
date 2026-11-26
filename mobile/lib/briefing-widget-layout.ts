export function briefingFrame(
  width: number,
  height: number,
  fontScale: number,
  hasMarket: boolean,
  hasCover: boolean,
) {
  'widget';
  const scale = Math.max(1, Math.min(2, fontScale));
  // Give the native action its own row before allocating space elsewhere.
  const footer = Math.min(height, 40 + Math.ceil(16 * (scale - 1)));
  const available = Math.max(0, height - footer - 1);
  const wide = width >= 280 && scale < 1.9 && hasMarket && available >= 96 * scale;
  const heading = 10 + Math.ceil(37 * scale);
  const duration = heading + 54 + Math.ceil(18 * (scale - 1));
  const roomForArt = available - duration;
  const artwork = !wide && hasCover && roomForArt >= 16 ? Math.min(40, roomForArt) : 0;
  const body = available - artwork;
  return {
    wide,
    footer,
    artwork,
    body,
    showHeading: body >= heading,
    showDuration: body >= duration,
  };
}
