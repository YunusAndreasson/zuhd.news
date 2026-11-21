import type { ReactElement } from 'react';
import { drawAsPicture, rect, type SkImage, Skia, type SkPicture } from 'react-native-skia';

interface SpriteSize {
  width: number;
  height: number;
}

/**
 * A sprite sheet drawn into a raster surface: a CPU image, made without the GPU.
 *
 * Every canvas that draws it uploads it from its own render thread, through
 * Skia's image provider, with the mipmaps `SPRITE_SAMPLING` asks for. Nothing
 * on the JS thread or a worklet waits for the GPU: no device to probe, no lock
 * to take, no pipeline to compile. A GPU bake on the UI runtime threw where
 * Dawn found no adapter, and held the iOS main thread while Metal compiled its
 * pipelines. Null when the surface cannot be made.
 */
function rasterizeSprite(picture: SkPicture, size: SpriteSize): SkImage | null {
  const surface = Skia.Surface.MakeRaster(size.width, size.height);
  if (!surface) return null;
  surface.getCanvas().drawPicture(picture);
  const image = surface.makeImageSnapshot();
  surface.dispose();
  return image;
}

/** The element recorded as a picture (on the calling thread), then rasterized
 *  (`rasterizeSprite`). Null when either fails: a sprite that did not bake is a
 *  layer that does not draw, never a crash. */
export async function bakeSprite(element: ReactElement, size: SpriteSize): Promise<SkImage | null> {
  try {
    const picture = await drawAsPicture(element, rect(0, 0, size.width, size.height));
    return rasterizeSprite(picture, size);
  } catch {
    return null;
  }
}
