import { isStorySettled, requestGlobeSettle } from '../lib/globe-settle';

it('keeps detail off through the first and last quarter of a moving story', () => {
  for (const fraction of [0.0001, 0.003, 0.04, 0.24, 0.5, 0.76, 0.96, 0.997, 0.9999]) {
    expect(isStorySettled(fraction)).toBe(false);
  }
});

it.each(['drag', 'story navigation', 'second pinch'])(
  'ignores a delayed pinch settle after %s',
  () => {
    jest.useFakeTimers();
    try {
      const epoch = { value: 1 };
      const retick = { value: 0 };
      setTimeout(() => requestGlobeSettle(1, epoch, retick), 350);
      epoch.value = 2;
      jest.advanceTimersByTime(350);
      expect(retick.value).toBe(0);
      requestGlobeSettle(2, epoch, retick);
      expect(retick.value).toBe(1);
      jest.advanceTimersByTime(10_000);
      expect(retick.value).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  },
);

it('restores detail at either landing, including cancellation back to the start', () => {
  for (const fraction of [0, 1]) {
    expect(isStorySettled(fraction)).toBe(true);
  }
});

it('detects restoration even when the final movement is below the reaction epsilon', () => {
  expect(isStorySettled(0.0001)).not.toBe(isStorySettled(0));
  expect(isStorySettled(0.9999)).not.toBe(isStorySettled(1));
  expect(isStorySettled(Number.NaN)).toBe(false);
});
