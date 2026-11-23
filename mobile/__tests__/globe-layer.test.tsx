import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { GlobeLayer } from '../components/map/GlobeLayer';
import type { GpuReading } from '../lib/skia-gpu';

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: ({ children }: { children?: ReactNode }) => <div>{children}</div> },
}));
const mockGpuReading = jest.fn<GpuReading, []>();
jest.mock('react-native-skia', () => ({
  Skia: {
    get gpu() {
      return mockGpuReading();
    },
  },
}));

it('mounts the story without starting a globe or installing its hit targets when Dawn found no adapter', () => {
  mockGpuReading.mockReturnValue({ isAvailable: false, backend: '' });
  const Scene = jest.fn(() => null);
  const { getByRole } = render(
    <>
      <GlobeLayer>
        <Scene />
      </GlobeLayer>
      <article aria-label="Story" />
    </>,
  );
  expect(getByRole('article', { name: 'Story' })).toBeTruthy();
  expect(Scene).not.toHaveBeenCalled();
});

it.each([
  { isAvailable: true, backend: 'Vulkan' },
  { isAvailable: false, backend: 'Vulkan' },
])('keeps the globe mounted for a device with a backend (%j)', (gpu) => {
  mockGpuReading.mockReturnValue(gpu);
  const { getByTestId } = render(
    <GlobeLayer>
      <div data-testid="globe" />
    </GlobeLayer>,
  );
  expect(getByTestId('globe')).toBeTruthy();
});
