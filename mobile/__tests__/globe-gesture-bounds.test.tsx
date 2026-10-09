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

let mockRNQueue: (() => void)[] | null = null;
jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => {
    if (mockRNQueue) mockRNQueue.push(() => fn(...args));
    else fn(...args);
  },
  scheduleOnUI: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args),
}));
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
Object.assign(Reanimated, { cancelAnimation: jest.fn(), withTiming: (value: number) => value });
const shared = (value: number) => ({ value }) as SharedValue<number>;
const event = (data: object) => data as never;

function setup(progress = 0, collapseMode = false, reduceMotion = false) {
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
    cancelFlight: jest.fn(),
    requestEpoch: shared(0),
    tapFrame: { value: { revision: 1, x: 0, y: 0, scale: 1 } } as SharedValue<{
      revision: number;
      x: number;
      y: number;
      scale: number;
    }>,
    clip: shared(90),
    storyClip: shared(90),
    radius: 150,
    centerX: 200,
    centerY: 300,
    reduceMotion,
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

it('captures the displayed frame at touch-up even if a new picture arrives before JS handles it', () => {
  const { globe, props } = setup();
  const queue: (() => void)[] = [];
  mockRNQueue = queue;
  const tapped = { revision: 7, x: -20, y: 10, scale: 1.5 };
  props.tapFrame.value = tapped;
  try {
    act(() => mockTap.onDeactivate?.(event({ absoluteX: 40, absoluteY: 150, canceled: false })));
    props.tapFrame.value = { revision: 8, x: 0, y: 0, scale: 1 };
    act(() => {
      for (const callback of queue) callback();
    });
    expect(globe.hitTest).toHaveBeenCalledWith(40, 130, tapped);
    expect(globe.showPulse).toHaveBeenCalledWith(40, 130);
  } finally {
    mockRNQueue = null;
  }
});

it('captures the pinch generation before delivering its settle request to JS', () => {
  const { props } = setup();
  const queue: (() => void)[] = [];
  mockRNQueue = queue;
  props.requestEpoch.value = 3;
  try {
    act(() => mockPinch.onDeactivate?.(event({ canceled: false })));
    props.requestEpoch.value = 4;
    act(() => {
      for (const callback of queue) callback();
    });
    expect(props.onZoomSettle).toHaveBeenCalledWith(expect.any(Number), 3);
  } finally {
    mockRNQueue = null;
  }
});

it('checks the final frame promptly when Reduce Motion skips the zoom animation', () => {
  const { props } = setup(0, false, true);
  props.requestEpoch.value = 2;
  act(() => mockPinch.onDeactivate?.(event({ canceled: false })));
  expect(props.onZoomSettle).toHaveBeenCalledWith(50, 2);
});

// The edge is at one of the sheet's two stops, never in between: following
// the sheet, it re-ran layout on every frame of every open and close.
it.each([
  [0, 300],
  [0.005, 300],
  [0.5, 600],
  [1, 600],
  [2, 600],
])('limits the native touch surface to the sheet stop at progress %s', (progress, bottom) => {
  setup(progress);
  expect(mockBounds).toContainEqual({ top: 100, bottom });
});

it('maps absolute tap coordinates to the canvas regardless of detector-local coordinates', () => {
  const { globe, props } = setup();
  act(() =>
    mockTap.onDeactivate?.(
      event({ x: 400, y: 500, absoluteX: 40, absoluteY: 150, canceled: false }),
    ),
  );
  expect(globe.hitTest).toHaveBeenCalledWith(40, 130, props.tapFrame.value);
  expect(globe.showPulse).toHaveBeenCalledWith(40, 130);
  expect(props.onTap).toHaveBeenCalledTimes(1);
  act(() =>
    mockTap.onDeactivate?.(
      event({ x: 400, y: 500, absoluteX: 40, absoluteY: 150, canceled: true }),
    ),
  );
  expect(globe.hitTest).toHaveBeenCalledTimes(1);
});

it.each([0, 100])(
  'keeps pinch anchors in canvas coordinates when detector offset is %s',
  (offset) => {
    const { props } = setup();
    act(() => {
      mockPinch.onTouchesDown?.(
        event({ allTouches: [{ x: 40, y: 150 - offset, absoluteX: 40, absoluteY: 150 }] }),
      );
      mockPinch.onActivate?.(event({ focalX: 40, focalY: 150 - offset }));
      if (typeof mockPinch.onUpdate === 'function') {
        mockPinch.onUpdate(
          event({ focalX: 45, focalY: 160 - offset, scaleChange: 1.2, numberOfPointers: 2 }),
        );
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
  },
);

it('keeps the exposed globe available to collapse an open story without hit testing', () => {
  const { globe, props } = setup(1, true);
  // `enabled` is a SharedValue: an open and close must flip it without a new
  // config, which RNGH would push to the native side whole.
  const on = (enabled: PanGestureConfig['enabled']) =>
    typeof enabled === 'object' ? enabled.value : enabled;
  expect(on(mockPan.enabled)).toBe(false);
  expect(on(mockPinch.enabled)).toBe(false);
  expect(on(mockTap.enabled)).toBe(true);
  act(() =>
    mockTap.onDeactivate?.(
      event({ x: 400, y: 500, absoluteX: 40, absoluteY: 150, canceled: false }),
    ),
  );
  expect(props.onCollapse).toHaveBeenCalledTimes(1);
  expect(globe.hitTest).not.toHaveBeenCalled();
});

it('collapses during the sheet rise before the parent commits the expanded detent', () => {
  const { globe, props } = setup(0.5, false);
  expect(typeof mockPan.enabled === 'object' && mockPan.enabled.value).toBe(false);
  expect(typeof mockPinch.enabled === 'object' && mockPinch.enabled.value).toBe(false);
  act(() => mockTap.onDeactivate?.(event({ absoluteX: 40, absoluteY: 150, canceled: false })));
  expect(props.onCollapse).toHaveBeenCalledTimes(1);
  expect(globe.hitTest).not.toHaveBeenCalled();
});

it('a pinch stops a flight through cancelFlight, then holds the zoom on screen', () => {
  const { props } = setup();
  // A flight's own release would ease the zoom down; the pinch takes it back.
  props.cancelFlight.mockImplementation(() => {
    props.zoomActive.value = 0;
  });
  props.clip.value = 40;
  act(() => mockPinch.onActivate?.(event({ focalX: 40, focalY: 50 })));
  expect(props.cancelFlight).toHaveBeenCalledTimes(1);
  expect(props.zoomActive.value).toBe(1);
  expect(props.zoomAngle.value).toBe(40);
});

it.each(['pan', 'pinch'])('ignores a tap delivered to JS after a newer %s gesture', (gesture) => {
  const { globe, props } = setup();
  const queued: (() => void)[] = [];
  mockRNQueue = queued;
  props.cancelFlight.mockImplementation(() => {
    props.requestEpoch.value += 1;
  });
  try {
    act(() =>
      mockTap.onDeactivate?.(
        event({ x: 400, y: 500, absoluteX: 40, absoluteY: 150, canceled: false }),
      ),
    );
    act(() => {
      if (gesture === 'pan') mockPan.onBegin?.(event({}));
      else mockPinch.onActivate?.(event({ focalX: 40, focalY: 50 }));
    });
    act(() => {
      for (const fn of queued) fn();
    });
    expect(globe.hitTest).not.toHaveBeenCalled();
    expect(props.onTap).not.toHaveBeenCalled();
  } finally {
    mockRNQueue = null;
  }
});

it('accepts a delayed normal tap when no newer input has claimed the camera', () => {
  const { globe, props } = setup();
  const queued: (() => void)[] = [];
  mockRNQueue = queued;
  props.cancelFlight.mockImplementation(() => {
    props.requestEpoch.value += 1;
  });
  try {
    act(() => mockPan.onBegin?.(event({})));
    act(() =>
      mockTap.onDeactivate?.(
        event({ x: 400, y: 500, absoluteX: 40, absoluteY: 150, canceled: false }),
      ),
    );
    act(() => {
      for (const fn of queued) fn();
    });
    expect(globe.hitTest).toHaveBeenCalledWith(40, 130, props.tapFrame.value);
    expect(props.onTap).toHaveBeenCalledWith({ countryName: 'Sweden' }, 1);
  } finally {
    mockRNQueue = null;
  }
});
