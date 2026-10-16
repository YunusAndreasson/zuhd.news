import { act, render } from '@testing-library/react';
import { createRef, type ReactNode } from 'react';
import * as Reanimated from 'react-native-reanimated';
import { ReduceMotion } from 'react-native-reanimated';
import type { ToastRef } from '../components/Toast';
import { dissolveIn, dissolveOut } from '../constants/theme';

// Under Reduce Motion a slide gives way to a dissolve in place, which keeps
// its fade: Reanimated would otherwise drop the slide to a cut, and a cut is
// no feedback at all (DESIGN.md Motion). The builders are the jest mock's
// recording chains: `kind` is the preset, `calls` its configuration.

jest.mock('../hooks/useTheme', () => ({
  useTheme: () => ({ colors: require('../constants/theme').DARK_COLORS }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('../components/primitives', () => ({ Text: () => null }));

type Chain = { kind: string; calls: [string, unknown][]; definitions?: unknown };
type Props = Record<string, unknown> & { children?: ReactNode };
let mockAnimated: Props | null = null;
Object.assign(Reanimated.default, {
  View: (props: Props) => {
    mockAnimated = props;
    return props.children ?? null;
  },
});
Object.assign(jest.requireMock('react-native'), {
  Pressable: () => null,
  View: ({ children }: Props) => children ?? null,
});
const { Toast } = require('../components/Toast') as typeof import('../components/Toast');
const { HintOverlay } =
  require('../components/HintOverlay') as typeof import('../components/HintOverlay');
const { VEIL_LIFT } =
  require('../components/SheetPager') as typeof import('../components/SheetPager');

const keeps = (chain: Chain) =>
  chain.calls.some(([m, v]) => m === 'reduceMotion' && v === ReduceMotion.Never);
const moves = (chain: Chain) => chain.calls.some(([m]) => m === 'withInitialValues');

/** The builder the last animated view was handed for `key`. */
function handed(key: 'entering' | 'exiting'): Chain {
  const chain = mockAnimated?.[key] as Chain | undefined;
  if (!chain) throw new Error(`no ${key} builder was handed over`);
  return chain;
}

let reduced = false;
beforeEach(() => {
  mockAnimated = null;
  jest.spyOn(Reanimated, 'useReducedMotion').mockImplementation(() => reduced);
});
afterEach(() => jest.restoreAllMocks());

it('dissolves in place, and keeps the fade under the setting', () => {
  for (const [dissolve, kind] of [
    [dissolveIn() as unknown as Chain, 'FadeIn'],
    [dissolveOut() as unknown as Chain, 'FadeOut'],
  ] as const) {
    expect(dissolve.kind).toBe(kind);
    expect(keeps(dissolve)).toBe(true);
    expect(moves(dissolve)).toBe(false);
  }
});

it("keeps a sheet page's veil fading, which is its only motion left", () => {
  const veil = VEIL_LIFT as unknown as Chain;
  expect(veil.kind).toBe('Keyframe');
  expect(veil.definitions).toEqual({ 0: { opacity: 1 }, 100: { opacity: 0 } });
  expect(keeps(veil)).toBe(true);
});

it.each([
  [false, 'FadeInDown', 'FadeOutUp'],
  [true, 'FadeIn', 'FadeOut'],
])('a top toast, Reduce Motion %s, enters %s and leaves %s', async (setting, enter, leave) => {
  reduced = setting;
  const ref = createRef<ToastRef>();
  render(<Toast ref={ref} />);
  await act(async () => {});
  act(() => ref.current?.show('Saved', undefined, 'top'));
  expect(handed('entering').kind).toBe(enter);
  expect(handed('exiting').kind).toBe(leave);
  // The slide never keeps its motion: under the setting it is not used.
  if (!setting) expect(keeps(handed('entering'))).toBe(false);
});

it.each([
  [false, 'FadeInUp', 'FadeOutDown'],
  [true, 'FadeIn', 'FadeOut'],
])('a hint, Reduce Motion %s, enters %s and leaves %s', (setting, enter, leave) => {
  reduced = setting;
  render(<HintOverlay hint="swipe" onDismiss={() => {}} bottomInset={0} />);
  expect(handed('entering').kind).toBe(enter);
  expect(handed('exiting').kind).toBe(leave);
});
