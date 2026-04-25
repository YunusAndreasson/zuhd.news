// ---------------------------------------------------------------------------
// react-native mock — provides the subset used by app source code
// ---------------------------------------------------------------------------
jest.mock('react-native', () => {
  const RN = {
    StyleSheet: {
      create: (styles) => styles,
      hairlineWidth: 0.5,
      absoluteFillObject: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    },
    Dimensions: { get: () => ({ width: 375, height: 812 }) },
    Linking: { openURL: jest.fn() },
    Text: 'Text',
    View: 'View',
    Pressable: 'Pressable',
    FlatList: 'FlatList',
    ScrollView: 'ScrollView',
    Image: 'Image',
    RefreshControl: 'RefreshControl',
    Share: { share: jest.fn().mockResolvedValue({}) },
    AppState: {
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
      currentState: 'active',
    },
    Platform: { OS: 'ios', select: (obj) => obj.ios },
  };
  return RN;
});

// ---------------------------------------------------------------------------
// react-native-reanimated mock — stable useSharedValue with .modify()
// ---------------------------------------------------------------------------
jest.mock('react-native-reanimated', () => {
  const { useRef, createRef } = require('react');

  function useSharedValue(init) {
    const ref = useRef(null);
    if (ref.current === null) {
      ref.current = {
        value: init,
        get: () => ref.current.value,
        set: (v) => {
          ref.current.value = typeof v === 'function' ? v(ref.current.value) : v;
        },
        modify: (fn) => {
          ref.current.value = fn(ref.current.value);
        },
        addListener: () => {},
        removeListener: () => {},
      };
    }
    return ref.current;
  }

  const MockView = 'View';

  return {
    __esModule: true,
    default: {
      FlatList: MockView,
      ScrollView: MockView,
      View: MockView,
      Text: MockView,
      Image: MockView,
      createAnimatedComponent: (comp) => comp,
    },
    useSharedValue,
    useAnimatedStyle: (fn) => fn(),
    useAnimatedReaction: () => {},
    useAnimatedRef: () => createRef(),
    useAnimatedScrollHandler: (handler) =>
      typeof handler === 'function' ? handler : handler?.onScroll || (() => {}),
    useDerivedValue: (fn) => ({ value: fn(), get: () => fn() }),
    useReducedMotion: () => false,
    runOnJS: (fn) => fn,
    interpolate: (value, input, output) => {
      if (input.length < 2) return output[0] || 0;
      if (value <= input[0]) return output[0];
      if (value >= input[input.length - 1]) return output[output.length - 1];
      for (let i = 0; i < input.length - 1; i++) {
        if (value >= input[i] && value <= input[i + 1]) {
          const t = (value - input[i]) / (input[i + 1] - input[i]);
          return output[i] + t * (output[i + 1] - output[i]);
        }
      }
      return output[output.length - 1];
    },
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    Easing: {
      linear: (v) => v,
      ease: (v) => v,
      cubic: (v) => v,
      in: (fn) => fn,
      out: (fn) => fn,
      inOut: (fn) => fn,
    },
    SharedValue: {},
  };
});

// ---------------------------------------------------------------------------
// expo-* mocks
// ---------------------------------------------------------------------------
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// ---------------------------------------------------------------------------
// @shopify/react-native-skia mock
// ---------------------------------------------------------------------------
jest.mock('@shopify/react-native-skia', () => ({
  Canvas: 'Canvas',
  Rect: 'Rect',
  LinearGradient: 'LinearGradient',
  vec: (x, y) => ({ x, y }),
}));

// ---------------------------------------------------------------------------
// react-native-safe-area-context mock
// ---------------------------------------------------------------------------
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
