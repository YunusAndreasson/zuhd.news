import { AccessibilityInfo } from 'react-native';

beforeEach(() => jest.clearAllMocks());

function announceOn(os: 'ios' | 'android') {
  let announce!: typeof import('../lib/announce').announce;
  jest.isolateModules(() => {
    jest.doMock('../constants/platform', () => ({ IS_ANDROID: os === 'android' }));
    announce = require('../lib/announce').announce;
  });
  return announce;
}

it('interrupts with what answers the reader’s own action', () => {
  announceOn('ios')('Markets');
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Markets');
  expect(AccessibilityInfo.announceForAccessibilityWithOptions).not.toHaveBeenCalled();
});

it('queues news the reader did not ask for behind what is being read', () => {
  announceOn('ios')('Saved', { queue: true });
  expect(AccessibilityInfo.announceForAccessibilityWithOptions).toHaveBeenCalledWith('Saved', {
    queue: true,
  });
  expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
});

it('leaves a live region to Android, which says its change itself', () => {
  announceOn('android')('now · Tropical Cyclone', { liveRegion: true, queue: true });
  expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
  expect(AccessibilityInfo.announceForAccessibilityWithOptions).not.toHaveBeenCalled();
});

it('says a live region’s change on iOS, where nothing else would', () => {
  announceOn('ios')('checking for new stories', { liveRegion: true });
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
    'checking for new stories',
  );
});

it('says nothing for an empty message', () => {
  const announce = announceOn('ios');
  announce('');
  announce('', { queue: true });
  expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
  expect(AccessibilityInfo.announceForAccessibilityWithOptions).not.toHaveBeenCalled();
});
