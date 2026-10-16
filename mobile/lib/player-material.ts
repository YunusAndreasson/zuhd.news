/**
 * What the briefing player is made of, DESIGN's one surface that blurs:
 * Liquid Glass on iOS 26 and later, the frosted blur before it, and a solid
 * `playerBg` on Android and wherever the reader has asked the system for less
 * transparency.
 */
export type PlayerMaterial = 'glass' | 'blur' | 'solid';

export function playerMaterial({
  os,
  glassAvailable,
  reduceTransparency,
}: {
  os: string;
  /** Liquid Glass is in this build and this iOS (`isLiquidGlassAvailable`). */
  glassAvailable: boolean;
  reduceTransparency: boolean;
}): PlayerMaterial {
  if (os !== 'ios' || reduceTransparency) return 'solid';
  return glassAvailable ? 'glass' : 'blur';
}

/**
 * How the player comes and goes. It slides and never fades: glass stops
 * rendering under an opacity below 1, and a blur draws wrong under one. Under
 * Reduce Motion the slide is not made; a solid player dissolves instead, as a
 * toast does, and glass or a blur, which cannot fade, appears in place.
 */
export type PlayerMotion = 'slide' | 'dissolve' | 'appear';

export function playerMotion(material: PlayerMaterial, reduceMotion: boolean): PlayerMotion {
  if (!reduceMotion) return 'slide';
  return material === 'solid' ? 'dissolve' : 'appear';
}
