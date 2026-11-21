/**
 * The globe's sprite sheets bake on the CPU. The GPU bake (`useTexture`: an
 * offscreen surface, flushed, on the UI runtime) threw where Dawn found no
 * adapter, which took the app down (Sentry ZUHD-2), and held the iOS main
 * thread for 10–24 s while Metal compiled its pipelines (ZUHD-3, ZUHD-4).
 */

const mockCalls: string[] = [];
const mockSnapshot = { kind: 'raster image' };

jest.mock('react-native-skia', () => ({
  rect: (x: number, y: number, width: number, height: number) => ({ x, y, width, height }),
  drawAsPicture: jest.fn(async (_element: unknown, bounds: unknown) => {
    mockCalls.push(`picture ${JSON.stringify(bounds)}`);
    return { kind: 'picture' };
  }),
  Skia: {
    Surface: {
      MakeOffscreen: jest.fn(() => {
        throw new Error('no GPU adapter');
      }),
      MakeRaster: jest.fn((width: number, height: number) => {
        mockCalls.push(`raster ${width}x${height}`);
        return {
          getCanvas: () => ({
            drawPicture: (picture: { kind: string }) => mockCalls.push(`draw ${picture.kind}`),
          }),
          flush: () => mockCalls.push('flush'),
          makeImageSnapshot: () => {
            mockCalls.push('snapshot');
            return {
              ...mockSnapshot,
              makeTextureImage: () => mockCalls.push('makeTextureImage'),
            };
          },
          dispose: () => mockCalls.push('dispose'),
        };
      }),
    },
  },
}));

import { drawAsPicture, Skia } from 'react-native-skia';
import { bakeSprite } from '../components/globe/sprite-bake';

beforeEach(() => {
  mockCalls.length = 0;
  jest.clearAllMocks();
});

it('records the element, rasterizes it at its size and never asks the GPU', async () => {
  const image = await bakeSprite({} as never, { width: 56, height: 56 });
  expect(image).toMatchObject(mockSnapshot);
  expect(mockCalls).toEqual([
    'picture {"x":0,"y":0,"width":56,"height":56}',
    'raster 56x56',
    'draw picture',
    'snapshot',
    'dispose',
  ]);
  expect(Skia.Surface.MakeOffscreen).not.toHaveBeenCalled();
});

it('is a missing sprite, not a throw, when the surface cannot be made', async () => {
  (Skia.Surface.MakeRaster as jest.Mock).mockReturnValueOnce(null);
  await expect(bakeSprite({} as never, { width: 32, height: 32 })).resolves.toBeNull();
});

it('is a missing sprite, not a rejection, when the picture fails', async () => {
  (drawAsPicture as jest.Mock).mockRejectedValueOnce(new Error('reconciler'));
  await expect(bakeSprite({} as never, { width: 32, height: 32 })).resolves.toBeNull();
});
