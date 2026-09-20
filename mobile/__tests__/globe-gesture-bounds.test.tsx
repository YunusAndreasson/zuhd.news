import { act, render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import type {
  PanGestureConfig,
  PinchGestureConfig,
  TapGestureConfig,
} from 'react-native-gesture-handler';
import * as Reanimated from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import type { MiniGlobeRef } from '../components/globe/MiniGlobe';
import { GlobeGestureLayer } from '../components/map/GlobeGestureLayer';
import { anchorZoom } from '../lib/globe-camera';

let mockTap: TapGestureConfig;
let mockPan: PanGestureConfig;
let mockPinch: PinchGestureConfig;
let mockSurface: ReactElement<{ style: unknown[] }>;
let mockBounds: unknown[];
Object.assign(Reanimated.default, {
  View: ({ style, children }: { style: unknown[]; children: ReactNode }) => {
    mockBounds = style;
    return children;
  },
});
jest.mock('react-native-gesture-handler', () => ({
  useTapGesture: (config: TapGestureConfig) => {
    mockTap = config;
    return config;
  },
  usePanGesture: (config: PanGestureConfig) => {
    mockPan = config;
    return config;
  },
  usePinchGesture: (config: PinchGestureConfig) => {
    mockPinch = config;
    return config;
  },
  useCompetingGestures: () => ({}),
  GestureDetector: ({ children }: { children: typeof mockSurface }) => {
    mockSurface = children;
    return null;
  },
}));
jest.mock('../lib/globe-camera', () => ({
  ...jest.requireActual('../lib/globe-camera'),
  anchorZoom: jest.fn(() => null),
}));
Object.assign(Reanimated, { cancelAnimation: jest.fn() });
const shared = (value: number) => ({ value }) as SharedValue<number>;
const event = (data: object) => data as never;

function setup(progress = 0, collapseMode = false) {
  const globe = { hitTest: jest.fn(() => ({ countryName: 'Sweden' })), showPulse: jest.fn() };
  const props = {
    globeRef: { current: globe as unknown as MiniGlobeRef },
    canvasTop: 20,
    topChromeHeight: 100,
    sheetPeekHeight: 300,
    sheetFullHeight: 600,
    sheetProgress: shared(progress),
    cameraOwner: shared(1),
    cameraLat: shared(0),
    cameraLng: shared(0),
    viewLat: shared(0),
    viewLng: shared(0),
    zoomActive: shared(0),
    zoomAngle: shared(90),
    flightT: shared(0),
    cancelFlight: jest.fn(),
    clip: shared(90),
    storyClip: shared(90),
    radius: 150,
    centerX: 200,
    centerY: 300,
    reduceMotion: false,
    onTap: jest.fn(),
    onZoomSettle: jest.fn(),
    onImpact: jest.fn(),
    enabled: !collapseMode,
    collapseMode,
    onCollapse: jest.fn(),
  };
  render(<GlobeGestureLayer {...props} />);
  return { globe, props };
}

beforeEach(() => jest.clearAllMocks());

it.each([
  [0, 300],
  [0.5, 450],
  [1, 600],
  [2, 600],
])('limits the native touch surface to the exposed globe at progress %s', (progress, bottom) => {
  setup(progress);
  expect(mockBounds).toContainEqual({ top: 100, bottom });
});

it('maps coordinates from the bounded detector parent back to the canvas', () => {
  const { globe, props } = setup();
  act(() => mockTap.onDeactivate?.(event({ x: 40, y: 50, canceled: false })));
  expect(globe.hitTest).toHaveBeenCalledWith(40, 130);
  expect(globe.showPulse).toHaveBeenCalledWith(40, 130);
  expect(props.onTap).toHaveBeenCalledTimes(1);
  act(() => mockTap.onDeactivate?.(event({ x: 40, y: 50, canceled: true })));
  expect(globe.hitTest).toHaveBeenCalledTimes(1);
});

it('keeps both pinch anchors in canvas coordinates and preserves pan deltas', () => {
  const { props } = setup();
  act(() => {
    mockPinch.onActivate?.(event({ focalX: 40, focalY: 50 }));
    if (typeof mockPinch.onUpdate === 'function') {
      mockPinch.onUpdate(event({ focalX: 45, focalY: 60, scaleChange: 1.2, numberOfPointers: 2 }));
    }
  });
  expect(anchorZoom).toHaveBeenCalledWith(
    40,
    130,
    45,
    140,
    0,
    0,
    150,
    expect.any(Number),
    200,
    300,
  );
  act(() => {
    if (typeof mockPan.onUpdate === 'function')
      mockPan.onUpdate(event({ changeX: 10, changeY: 0 }));
  });
  expect(props.cameraLng.value).not.toBe(0);
  expect(props.cameraLat.value).toBe(0);
});

it('keeps the exposed globe available to collapse an open story without hit testing', () => {
  const { globe, props } = setup(1, true);
  expect(mockPan.enabled).toBe(false);
  expect(mockPinch.enabled).toBe(false);
  expect(mockTap.enabled).toBe(true);
  act(() => mockTap.onDeactivate?.(event({ x: 40, y: 50, canceled: false })));
  expect(props.onCollapse).toHaveBeenCalledTimes(1);
  expect(globe.hitTest).not.toHaveBeenCalled();
});
