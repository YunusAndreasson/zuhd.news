import { renderHook } from '@testing-library/react';
import { useChartDrawProgress } from '../components/blocks/shared';

// A chart's line is drawn in as it mounts, and its canvas redraws on every
// frame of that. A chart that mounts where nobody is looking, such as a page
// of the country carousel not in front, starts drawn.

// The suite's Reanimated mock has no timing; this one records what it is asked.
const reanimated = jest.requireMock('react-native-reanimated') as Record<string, unknown>;
let mockReduced = false;
const mockTiming = jest.fn((to: number) => to);
Object.assign(reanimated, {
  cancelAnimation: jest.fn(),
  useReducedMotion: () => mockReduced,
  withTiming: (to: number) => mockTiming(to),
});

beforeEach(() => {
  mockReduced = false;
  mockTiming.mockClear();
});

it('draws a chart in as it mounts', () => {
  const { result } = renderHook(() => useChartDrawProgress(400));
  expect(mockTiming).toHaveBeenCalledTimes(1);
  expect(mockTiming).toHaveBeenCalledWith(1);
  expect(result.current.value).toBe(1);
});

it('starts a chart mounted out of sight drawn, with nothing to animate', () => {
  const seen: number[] = [];
  const { result } = renderHook(() => {
    const progress = useChartDrawProgress(400, true);
    seen.push(progress.value);
    return progress;
  });
  expect(seen[0]).toBe(1);
  expect(result.current.value).toBe(1);
  expect(mockTiming).not.toHaveBeenCalled();
});

it('starts drawn under Reduce Motion, as before', () => {
  mockReduced = true;
  const { result } = renderHook(() => useChartDrawProgress(400));
  expect(result.current.value).toBe(1);
  expect(mockTiming).not.toHaveBeenCalled();
});
